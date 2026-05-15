import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { demoEventGroups, demoEvents, demoRegistrations } from "@/lib/demo-data";
import { isDemoMode } from "@/lib/demo-mode";
import { env } from "@/lib/env";
import { buildQrEmailAttachment, buildQrEmailCid } from "@/lib/qr";
import { generateOpaqueToken, hashOpaqueToken } from "@/lib/tokens";
import type { AuthenticatedAppUser } from "@/lib/auth";
import type { EventFormConfig, EventGroup, EventRecord, EventTicketOption } from "@/lib/types";
import { blankToNull, buildAbsoluteUrl, isSyntheticEmail, resolveCategories, slugify, zonedInputToUtcIso } from "@/lib/utils";
import { adminEventGroupSchema, adminEventSchema } from "@/lib/validation/admin";
import { buildConfirmationEmail } from "@/services/email-templates";
import { executeEmailJob } from "@/services/email-jobs";
import { sendMail } from "@/services/mailer";
import { getRegistrationSummaryForEvent } from "@/services/events";
import type { z } from "zod";

type AdminEventInput = z.infer<typeof adminEventSchema>;
type AdminEventGroupInput = z.infer<typeof adminEventGroupSchema>;

function splitParagraphs(text: string | undefined | null): string[] | undefined {
  if (!text?.trim()) return undefined;
  return text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

function buildEventPayload(input: AdminEventInput) {
  const timeZone = input.timezone.trim();

  return {
    event_group_id: input.eventGroupId,
    slug: slugify(input.slug),
    title: input.title.trim(),
    description: blankToNull(input.descriptionText),
    venue: blankToNull(input.venue),
    timezone: timeZone,
    start_at: zonedInputToUtcIso(input.startAt, timeZone),
    end_at: zonedInputToUtcIso(input.endAt, timeZone),
    registration_opens_at: input.registrationOpensAt
      ? zonedInputToUtcIso(input.registrationOpensAt, timeZone)
      : null,
    registration_closes_at: input.registrationClosesAt
      ? zonedInputToUtcIso(input.registrationClosesAt, timeZone)
      : null,
    status: input.status,
    capacity: input.capacity ? Number(input.capacity) : null,
    declaration_version: input.declarationVersion,
    declaration_text: input.declarationText.trim(),
    form_config: {
      submitLabel: blankToNull(input.submitLabel),
      mapLink: blankToNull(input.mapLink),
      categoriesLabel: blankToNull(input.categoriesLabel),
      ticketOptionsLabel: blankToNull(input.ticketOptionsLabel),
      categories: (input.categories ?? []).map((cat) => ({
        id: cat.id.trim(),
        title: cat.title.trim(),
        description: cat.description?.trim() ?? "",
        note: blankToNull(cat.note),
        badge: blankToNull(cat.badge),
        capacity: cat.capacity ?? null,
        priceMinor: cat.priceMinor ?? 0,
        currencyCode: cat.currencyCode ?? "AED",
        soldOut: cat.soldOut
      })),
      ticketOptions: input.ticketOptions.map((ticket) => ({
        id: ticket.id.trim(),
        title: ticket.title.trim(),
        description: ticket.description?.trim() ?? "",
        note: blankToNull(ticket.note),
        badge: blankToNull(ticket.badge),
        capacity: null,
        priceMinor: 0,
        currencyCode: "AED",
        soldOut: ticket.soldOut
      })),
      posterImage: blankToNull(input.posterImage),
      introLine: blankToNull(input.introLine),
      descriptionParagraphs: splitParagraphs(input.descriptionText),
      emailIntroLine: blankToNull(input.emailIntroLine),
      emailDescriptionParagraphs: splitParagraphs(input.emailDescriptionText),
      disclaimerPdfUrl: blankToNull(input.disclaimerPdfUrl),
      disclaimerHeading: blankToNull(input.disclaimerHeading)
    }
  };
}

function mapOptionsById(options: EventTicketOption[] | undefined) {
  return new Map((options ?? []).map((option) => [option.id, option]));
}

function describeOption(option: EventTicketOption | undefined, id: string) {
  const title = option?.title?.trim();
  return title ? `"${title}"` : `ID "${id}"`;
}

function assertCatalogReadyForPublicStatus(input: AdminEventInput) {
  if (!["open", "live"].includes(input.status)) {
    return;
  }

  if (!(input.categories ?? []).some((category) => !category.soldOut)) {
    throw new Error("Add at least one available ticket type before opening registration.");
  }

  if (!input.ticketOptions.some((ticket) => !ticket.soldOut)) {
    throw new Error("Add at least one available activity category before opening registration.");
  }
}

function assertRegistrationLinkedOptionsAreStillValid(input: {
  before: EventRecord;
  after: ReturnType<typeof buildEventPayload>;
  summary: Awaited<ReturnType<typeof getRegistrationSummaryForEvent>>;
}) {
  const nextConfig = (input.after.form_config ?? {}) as EventFormConfig;
  const beforeCategoriesById = mapOptionsById(resolveCategories(input.before.form_config));
  const nextCategoriesById = mapOptionsById(resolveCategories(nextConfig));
  const beforeTicketsById = mapOptionsById(input.before.form_config?.ticketOptions);
  const nextTicketsById = mapOptionsById(nextConfig.ticketOptions);

  if (input.after.capacity && input.summary.count > input.after.capacity) {
    throw new Error(
      `Event capacity cannot be set below ${input.summary.count} because ${input.summary.count} registrations already exist.`
    );
  }

  for (const [categoryId, count] of Object.entries(input.summary.categoryCounts)) {
    if (count <= 0) {
      continue;
    }

    const nextCategory = nextCategoriesById.get(categoryId);
    if (!nextCategory) {
      throw new Error(
        `Cannot remove ticket type ${describeOption(beforeCategoriesById.get(categoryId), categoryId)} because ${count} registrations already use it. Edit the existing ticket type instead of removing and recreating it.`
      );
    }

    if (nextCategory.capacity && count > nextCategory.capacity) {
      throw new Error(
        `Ticket type ${describeOption(nextCategory, categoryId)} capacity cannot be set below ${count} because ${count} registrations already use it.`
      );
    }
  }

  for (const [ticketId, count] of Object.entries(input.summary.ticketCounts)) {
    if (count <= 0) {
      continue;
    }

    const nextTicket = nextTicketsById.get(ticketId);
    if (!nextTicket) {
      throw new Error(
        `Cannot remove activity category ${describeOption(beforeTicketsById.get(ticketId), ticketId)} because ${count} registrations already use it. Edit the existing activity category instead of removing and recreating it.`
      );
    }

  }
}

async function syncCatalogFromEventInput(eventId: string, input: AdminEventInput) {
  const supabase = createAdminSupabaseClient();
  const categoryIds = (input.categories ?? []).map((category) => category.id.trim()).filter(Boolean);
  const addonIds = input.ticketOptions.map((addon) => addon.id.trim()).filter(Boolean);

  if (categoryIds.length > 0) {
    const { error: categoryUpsertError } = await supabase.from("event_categories").upsert(
      input.categories.map((category, index) => ({
        event_id: eventId,
        public_id: category.id.trim(),
        title: category.title.trim(),
        description: category.description?.trim() ?? "",
        note: blankToNull(category.note),
        badge: blankToNull(category.badge),
        capacity: category.capacity ?? null,
        sold_out: category.soldOut,
        active: true,
        price_minor: category.priceMinor ?? 0,
        currency_code: category.currencyCode ?? "AED",
        sort_order: index
      })),
      { onConflict: "event_id,public_id" }
    );

    if (categoryUpsertError) {
      throw categoryUpsertError;
    }
  }

  const categoryDeactivateQuery = supabase
    .from("event_categories")
    .update({ active: false })
    .eq("event_id", eventId);

  const { error: categoryDeactivateError } = categoryIds.length > 0
    ? await categoryDeactivateQuery.not("public_id", "in", `(${categoryIds.map((id) => `"${id}"`).join(",")})`)
    : await categoryDeactivateQuery;

  if (categoryDeactivateError) {
    throw categoryDeactivateError;
  }

  if (input.ticketOptions.length > 0) {
    const { error: addonUpsertError } = await supabase.from("event_addons").upsert(
      input.ticketOptions.map((addon, index) => ({
        event_id: eventId,
        public_id: addon.id.trim(),
        title: addon.title.trim(),
        description: addon.description?.trim() ?? "",
        note: blankToNull(addon.note),
        badge: blankToNull(addon.badge),
        capacity: null,
        sold_out: addon.soldOut,
        active: true,
        price_minor: 0,
        currency_code: "AED",
        sort_order: index
      })),
      { onConflict: "event_id,public_id" }
    );

    if (addonUpsertError) {
      throw addonUpsertError;
    }
  }

  const addonDeactivateQuery = supabase
    .from("event_addons")
    .update({ active: false })
    .eq("event_id", eventId);

  const { error: addonDeactivateError } = addonIds.length > 0
    ? await addonDeactivateQuery.not("public_id", "in", `(${addonIds.map((id) => `"${id}"`).join(",")})`)
    : await addonDeactivateQuery;

  if (addonDeactivateError) {
    throw addonDeactivateError;
  }
}

export async function logAuditEvent(input: {
  actor: AuthenticatedAppUser;
  action: string;
  entityType: string;
  entityId: string;
  beforeJson?: Record<string, unknown> | null;
  afterJson?: Record<string, unknown> | null;
}) {
  if (isDemoMode()) {
    return;
  }

  const supabase = createAdminSupabaseClient();

  await supabase.from("audit_logs").insert({
    actor_type: "staff_user",
    actor_id: input.actor.id,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId,
    before_json: input.beforeJson ?? null,
    after_json: input.afterJson ?? null
  });
}

function buildEventGroupPayload(input: AdminEventGroupInput) {
  const slug = slugify(input.slug);

  if (!slug) {
    throw new Error("Enter a valid category slug.");
  }

  return {
    name: input.name.trim(),
    slug,
    description: blankToNull(input.description),
    sort_order: input.sortOrder,
    active: input.active
  };
}

async function assertEventSlugDoesNotMatchGroupSlug(slug: string) {
  if (isDemoMode()) {
    if (demoEventGroups.some((group) => group.slug === slug)) {
      throw new Error("Event slug cannot match an event category slug. Choose a different event slug.");
    }

    return;
  }

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("event_groups")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (data) {
    throw new Error("Event slug cannot match an event category slug. Choose a different event slug.");
  }
}

async function assertGroupSlugDoesNotMatchEventSlug(slug: string) {
  if (isDemoMode()) {
    if (demoEvents.some((event) => event.slug === slug)) {
      throw new Error("Event category slug cannot match an event slug. Choose a different category slug.");
    }

    return;
  }

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("events")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (data) {
    throw new Error("Event category slug cannot match an event slug. Choose a different category slug.");
  }
}

export async function createEventGroup(input: AdminEventGroupInput, actor: AuthenticatedAppUser) {
  const payload = buildEventGroupPayload(input);
  await assertGroupSlugDoesNotMatchEventSlug(payload.slug);

  if (isDemoMode()) {
    return {
      id: "7a6c5527-fba8-44d4-9475-07b97cc2223a",
      ...payload,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    } as EventGroup;
  }

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("event_groups")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  await logAuditEvent({
    actor,
    action: "event_group.created",
    entityType: "event_group",
    entityId: data.id,
    afterJson: data
  });

  return data as EventGroup;
}

export async function updateEventGroup(input: AdminEventGroupInput, actor: AuthenticatedAppUser) {
  const payload = buildEventGroupPayload(input);

  if (!input.id) {
    throw new Error("Event category id is required for updates.");
  }

  await assertGroupSlugDoesNotMatchEventSlug(payload.slug);

  if (isDemoMode()) {
    const existing = demoEventGroups.find((group) => group.id === input.id);

    if (!existing) {
      throw new Error("Demo event category not found.");
    }

    return {
      ...existing,
      ...payload,
      updated_at: new Date().toISOString()
    } as EventGroup;
  }

  const supabase = createAdminSupabaseClient();
  const { data: before, error: beforeError } = await supabase
    .from("event_groups")
    .select("*")
    .eq("id", input.id)
    .single();

  if (beforeError) {
    throw beforeError;
  }

  const { data, error } = await supabase
    .from("event_groups")
    .update(payload)
    .eq("id", input.id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  await logAuditEvent({
    actor,
    action: "event_group.updated",
    entityType: "event_group",
    entityId: input.id,
    beforeJson: before,
    afterJson: data
  });

  return data as EventGroup;
}

export async function createEvent(input: AdminEventInput, actor: AuthenticatedAppUser) {
  assertCatalogReadyForPublicStatus(input);
  const payload = buildEventPayload(input);
  await assertEventSlugDoesNotMatchGroupSlug(payload.slug);

  if (isDemoMode()) {
    return {
      id: "demo-created-event",
      ...payload,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    } as EventRecord;
  }

  const supabase = createAdminSupabaseClient();

  const { data, error } = await supabase.from("events").insert(payload).select("*").single();

  if (error) {
    throw error;
  }

  await syncCatalogFromEventInput(data.id, input);

  await logAuditEvent({
    actor,
    action: "event.created",
    entityType: "event",
    entityId: data.id,
    afterJson: data
  });

  return data as EventRecord;
}

export async function updateEvent(input: AdminEventInput, actor: AuthenticatedAppUser) {
  assertCatalogReadyForPublicStatus(input);
  const payload = buildEventPayload(input);
  await assertEventSlugDoesNotMatchGroupSlug(payload.slug);

  if (isDemoMode()) {
    const existing = demoEvents.find((event) => event.id === input.id);

    if (!existing) {
      throw new Error("Demo event not found.");
    }

    return {
      ...existing,
      ...payload,
      updated_at: new Date().toISOString()
    } as EventRecord;
  }

  if (!input.id) {
    throw new Error("Event id is required for updates.");
  }

  const supabase = createAdminSupabaseClient();

  const [{ data: before, error: beforeError }, registrationSummary] = await Promise.all([
    supabase
      .from("events")
      .select("*")
      .eq("id", input.id)
      .single(),
    getRegistrationSummaryForEvent(input.id)
  ]);

  if (beforeError) {
    throw beforeError;
  }

  assertRegistrationLinkedOptionsAreStillValid({
    before: before as EventRecord,
    after: payload,
    summary: registrationSummary
  });

  const { data, error } = await supabase
    .from("events")
    .update(payload)
    .eq("id", input.id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  await syncCatalogFromEventInput(input.id, input);

  await logAuditEvent({
    actor,
    action: "event.updated",
    entityType: "event",
    entityId: input.id,
    beforeJson: before,
    afterJson: data
  });

  return data as EventRecord;
}

export async function deleteEvent(eventId: string, actor: AuthenticatedAppUser) {
  if (isDemoMode()) {
    return { ok: true, slug: "demo-event" };
  }

  const supabase = createAdminSupabaseClient();

  const { data: event, error: fetchError } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .single();

  if (fetchError) {
    throw fetchError;
  }

  const [
    registrationsResult,
    bookingIntentsResult
  ] = await Promise.all([
    supabase.from("registrations").select("id", { count: "exact", head: true }).eq("event_id", eventId),
    supabase.from("booking_intents").select("id", { count: "exact", head: true }).eq("event_id", eventId)
  ]);

  if (registrationsResult.error) {
    throw registrationsResult.error;
  }

  if (bookingIntentsResult.error) {
    throw bookingIntentsResult.error;
  }

  if ((registrationsResult.count ?? 0) > 0 || (bookingIntentsResult.count ?? 0) > 0) {
    throw new Error("Cannot delete an event with registrations, booking intents, or payment activity. Archive or close it instead.");
  }

  const { error: deletePendingError } = await supabase
    .from("pending_registrations")
    .delete()
    .eq("event_id", eventId);

  if (deletePendingError) {
    throw deletePendingError;
  }

  const { error: deleteError } = await supabase
    .from("events")
    .delete()
    .eq("id", eventId);

  if (deleteError) {
    throw deleteError;
  }

  await logAuditEvent({
    actor,
    action: "event.deleted",
    entityType: "event",
    entityId: eventId,
    beforeJson: event
  });

  return { ok: true, slug: event.slug as string };
}

type ListRegistrationsFilters = {
  eventId?: string;
  category?: string;
  status?: string;
  query?: string;
  page?: number;
  pageSize?: number;
};

function matchesCategoryFilter(
  row: {
    category_id?: string | null;
    category_title?: string | null;
    ticket_option_id?: string | null;
    ticket_option_title?: string | null;
  },
  categoryFilter?: string
) {
  if (!categoryFilter) {
    return true;
  }

  if (categoryFilter.startsWith("category:")) {
    return row.category_id === categoryFilter.slice("category:".length);
  }

  if (categoryFilter.startsWith("ticket:")) {
    return row.ticket_option_id === categoryFilter.slice("ticket:".length);
  }

  return row.category_title === categoryFilter || row.ticket_option_title === categoryFilter;
}

const ADMIN_REGISTRATION_SELECT =
  "id, event_id, full_name, email_raw, phone, age, uae_resident, marketing_opt_in, category_title, ticket_option_title, status, checked_in_at, created_at, booking_id, is_primary, registered_by_email, booking_intent_id, payment_attempt_id, ni_order_reference, paid_amount_minor, paid_currency_code, events(title, slug)";

export async function listRegistrations(filters: ListRegistrationsFilters) {
  const page = Number.isFinite(filters.page) && (filters.page ?? 0) > 0 ? Math.floor(filters.page ?? 1) : 1;
  const pageSize =
    Number.isFinite(filters.pageSize) && (filters.pageSize ?? 0) > 0 ? Math.floor(filters.pageSize ?? 25) : 25;
  const rangeStart = (page - 1) * pageSize;
  const rangeEnd = rangeStart + pageSize - 1;

  if (isDemoMode()) {
    const filteredRows = demoRegistrations
      .filter((row) => !filters.eventId || row.event_id === filters.eventId)
      .filter((row) => matchesCategoryFilter(row, filters.category))
      .filter((row) => !filters.status || row.status === filters.status)
      .filter((row) => {
        if (!filters.query?.trim()) {
          return true;
        }

        const needle = filters.query.trim().toLowerCase();
        return (
          row.full_name.toLowerCase().includes(needle) ||
          row.email_raw.toLowerCase().includes(needle) ||
          (row.phone ?? "").toLowerCase().includes(needle)
        );
      })
      .map((row) => ({
        ...row,
        events: {
          title: demoEvents.find((event) => event.id === row.event_id)?.title ?? "Demo event",
          slug: demoEvents.find((event) => event.id === row.event_id)?.slug ?? "demo-event"
        }
      }));

    return {
      rows: filteredRows.slice(rangeStart, rangeEnd + 1),
      total: filteredRows.length
    };
  }

  const supabase = createAdminSupabaseClient();
  let query = supabase
    .from("registrations")
    .select(ADMIN_REGISTRATION_SELECT, { count: "exact" })
    .order("created_at", { ascending: false });

  if (filters.eventId) {
    query = query.eq("event_id", filters.eventId);
  }

  if (filters.category) {
    if (filters.category.startsWith("category:")) {
      query = query.eq("category_id", filters.category.slice("category:".length));
    } else if (filters.category.startsWith("ticket:")) {
      query = query.eq("ticket_option_id", filters.category.slice("ticket:".length));
    } else {
      query = query.eq("category_title", filters.category);
    }
  }

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  if (filters.query?.trim()) {
    const needle = filters.query.trim();
    query = query.or(`full_name.ilike.%${needle}%,email_raw.ilike.%${needle}%,phone.ilike.%${needle}%`);
  }

  const { data, error, count } = await query.range(rangeStart, rangeEnd);

  if (error) {
    throw error;
  }

  return {
    rows: data ?? [],
    total: count ?? 0
  };
}

export async function revokeRegistration(
  registrationId: string,
  actor: AuthenticatedAppUser,
  reason?: string | null
) {
  if (isDemoMode()) {
    return {
      id: registrationId,
      deleted: true,
      reason: blankToNull(reason)
    };
  }

  const supabase = createAdminSupabaseClient();

  const { data: before, error: beforeError } = await supabase
    .from("registrations")
    .select("*")
    .eq("id", registrationId)
    .single();

  if (beforeError) {
    throw beforeError;
  }

  if (before.payment_attempt_id || before.paid_amount_minor != null || before.ni_order_reference) {
    const { data: updated, error: updateError } = await supabase
      .from("registrations")
      .update({ status: "revoked" })
      .eq("id", registrationId)
      .select("*")
      .single();

    if (updateError) {
      throw updateError;
    }

    await logAuditEvent({
      actor,
      action: "registration.revoked",
      entityType: "registration",
      entityId: registrationId,
      beforeJson: before,
      afterJson: {
        ...(updated ?? {}),
        delete_reason: blankToNull(reason),
        payment_backed: true
      }
    });

    return {
      id: registrationId,
      deleted: false,
      reason: blankToNull(reason)
    };
  }

  const { error: deleteCheckinsError } = await supabase
    .from("checkins")
    .delete()
    .eq("registration_id", registrationId);

  if (deleteCheckinsError) {
    throw deleteCheckinsError;
  }

  const { error } = await supabase
    .from("registrations")
    .delete()
    .eq("id", registrationId);

  if (error) {
    throw error;
  }

  await logAuditEvent({
    actor,
    action: "registration.deleted",
    entityType: "registration",
    entityId: registrationId,
    beforeJson: before,
    afterJson: {
      deleted: true,
      delete_reason: blankToNull(reason)
    }
  });

  return {
    id: registrationId,
    deleted: true,
    reason: blankToNull(reason)
  };
}

export async function rotateQrAndResend(registrationId: string, actor: AuthenticatedAppUser) {
  if (isDemoMode()) {
    return {
      ok: true
    };
  }

  const supabase = createAdminSupabaseClient();

  const { data: registration, error } = await supabase
    .from("registrations")
    .select("id, event_id, full_name, email_raw, manual_checkin_code, status, category_title, ticket_option_title, events(*)")
    .eq("id", registrationId)
    .single();

  if (error) {
    throw error;
  }

  if (registration.status === "revoked" || registration.status === "cancelled") {
    throw new Error("Cannot resend QR for a revoked or cancelled registration.");
  }

  if (isSyntheticEmail(registration.email_raw)) {
    throw new Error("No email on file for this attendee. Contact the primary registrant to share their ticket.");
  }

  const nextQrToken = generateOpaqueToken();
  const nextQrTokenHash = hashOpaqueToken(nextQrToken);

  const { error: rotateError } = await supabase.rpc("rotate_registration_qr_token", {
    p_registration_id: registrationId,
    p_qr_token_hash: nextQrTokenHash
  });

  if (rotateError) {
    throw rotateError;
  }

  const event = (registration.events as EventRecord | EventRecord[] | null) as EventRecord;
  const qrAttachment = await buildQrEmailAttachment(nextQrToken);
  const fc = event.form_config;

  await executeEmailJob(
    "resend_qr",
    {
      registrationId,
      eventId: registration.event_id,
      email: registration.email_raw
    },
    async (job) => {
      const mail = buildConfirmationEmail({
        fullName: registration.full_name,
        eventTitle: event.title,
        eventStartAt: event.start_at,
        eventEndAt: event.end_at,
        eventTimezone: event.timezone,
        venue: event.venue,
        mapLink: fc?.mapLink,
        manualCheckinCode: registration.manual_checkin_code,
        ticketTitle: registration.ticket_option_title ?? registration.category_title ?? "General Admission",
        posterImageUrl: fc?.posterImage?.trim() ? buildAbsoluteUrl(env.APP_URL, fc.posterImage) : null,
        qrImageSrc: buildQrEmailCid(qrAttachment.contentId),
        qrLinkHref: buildAbsoluteUrl(env.APP_URL, `/api/qr?token=${encodeURIComponent(nextQrToken)}`),
        introLine: fc?.emailIntroLine ?? fc?.introLine ?? undefined,
        detailParagraphs: fc?.emailDescriptionParagraphs ?? fc?.descriptionParagraphs ?? undefined
      });

      await sendMail({
        to: registration.email_raw,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        attachments: [qrAttachment],
        idempotencyKey: job.id
      });
    }
  );

  await supabase
    .from("registrations")
    .update({
      confirmation_email_sent_at: new Date().toISOString()
    })
    .eq("id", registrationId);

  await logAuditEvent({
    actor,
    action: "registration.qr_resent",
    entityType: "registration",
    entityId: registrationId,
    afterJson: {
      event_id: registration.event_id,
      status: registration.status
    }
  });

  return {
    ok: true
  };
}

function escapeCsvValue(value: unknown) {
  if (value == null) {
    return "";
  }

  const raw = String(value);
  const guarded = /(?:^\s*[=+\-@])|[\t\r\n]/.test(raw) ? `'${raw}` : raw;
  const stringified = guarded.replace(/"/g, '""');
  return `"${stringified}"`;
}

function buildCsv(rows: unknown[][]) {
  return rows.map((row) => row.map(escapeCsvValue).join(",")).join("\n");
}

type ExportRegistrationRowInput = {
  full_name: string;
  email_raw: string | null;
  phone?: string | null;
  age?: number | null;
  uae_resident?: boolean | null;
  marketing_opt_in?: boolean | null;
  category_title?: string | null;
  ticket_option_title?: string | null;
  status?: string | null;
  registered_by_email?: string | null;
  is_primary?: boolean;
  created_at: string;
  checked_in_at?: string | null;
};

const REGISTRATION_EXPORT_SELECT =
  "full_name, email_raw, phone, age, uae_resident, marketing_opt_in, category_title, ticket_option_title, status, registered_by_email, is_primary, created_at, checked_in_at";
const EXPORT_BATCH_SIZE = 1000;
const EXPORT_TIME_ZONE = "Asia/Dubai";
const REGISTRATION_EXPORT_HEADERS = [
  "#",
  "Full Name",
  "Email",
  "Phone Number",
  "Age",
  "UAE Resident",
  "Marketing Opt-In",
  "Ticket Type",
  "Activity Category",
  "Status",
  "Booked By",
  "Registered At",
  "Checked In At"
];

async function fetchExportRowsInBatches<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
) {
  const rows: T[] = [];

  for (let from = 0; ; from += EXPORT_BATCH_SIZE) {
    const to = from + EXPORT_BATCH_SIZE - 1;
    const { data, error } = await fetchPage(from, to);

    if (error) {
      throw error;
    }

    const batch = data ?? [];
    rows.push(...batch);

    if (batch.length < EXPORT_BATCH_SIZE) {
      break;
    }
  }

  return rows;
}

function formatExportEmail(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return isSyntheticEmail(value) ? "N/A" : value;
}

function formatExportDateTime(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: EXPORT_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function formatExportPrimaryBoolean(value: boolean | null | undefined, isPrimary?: boolean) {
  if (typeof value !== "boolean") {
    return "";
  }

  if (isPrimary === false) {
    return "";
  }

  return value ? "Yes" : "No";
}

function buildRegistrationExportRow(row: ExportRegistrationRowInput, index: number) {
  return {
    "#": index + 1,
    "Full Name": row.full_name,
    "Email": formatExportEmail(row.email_raw),
    "Phone Number": row.phone ?? "",
    "Age": row.age ?? "",
    "UAE Resident": formatExportPrimaryBoolean(row.uae_resident, row.is_primary),
    "Marketing Opt-In": formatExportPrimaryBoolean(row.marketing_opt_in, row.is_primary),
    "Ticket Type": row.category_title ?? "General Admission",
    "Activity Category": row.ticket_option_title ?? "",
    "Status": row.status ?? "",
    "Booked By": row.registered_by_email ?? "",
    "Registered At": formatExportDateTime(row.created_at),
    "Checked In At": formatExportDateTime(row.checked_in_at)
  };
}

function registrationRowsToCsv(dataRows: Array<Record<string, unknown>>) {
  return buildCsv([
    REGISTRATION_EXPORT_HEADERS,
    ...dataRows.map((row) => REGISTRATION_EXPORT_HEADERS.map((header) => row[header]))
  ]);
}

type SalesReportFilters = {
  date: string;
  eventId?: string;
};

type SalesReportItemInput = {
  title?: string | null;
  quantity?: number | null;
  sort_order?: number | null;
};

type SalesReportBookingInput = {
  payer_full_name?: string | null;
  events?: { title?: string | null } | Array<{ title?: string | null }> | null;
  booking_intent_items?: SalesReportItemInput[] | null;
};

type SalesReportPaymentInput = {
  id: string;
  ni_order_reference?: string | null;
  merchant_order_reference?: string | null;
  amount_minor: number;
  currency_code?: string | null;
  paid_at: string;
  booking_intents?: SalesReportBookingInput | SalesReportBookingInput[] | null;
};

export type SalesReportRow = {
  paidAt: string;
  transactionRef: string;
  name: string;
  totalAmountMinor: number;
  amountBeforeVatMinor: number;
  vatMinor: number;
  currencyCode: string;
  activityDescription: string;
};

export type DailySalesReport = {
  date: string;
  startIso: string;
  endIso: string;
  rows: SalesReportRow[];
  totalAmountMinor: number;
  amountBeforeVatMinor: number;
  vatMinor: number;
  currencyCode: string;
};

const SALES_REPORT_HEADERS = [
  "Date",
  "Transaction ref",
  "Name",
  "Total amount",
  "Amount before vat",
  "Vat 5%",
  "Activity description"
];

function getDatePart(value: string, part: "year" | "month" | "day") {
  const index = part === "year" ? 0 : part === "month" ? 1 : 2;
  return Number(value.split("-")[index]);
}

function getNextDateValue(value: string) {
  const date = new Date(Date.UTC(
    getDatePart(value, "year"),
    getDatePart(value, "month") - 1,
    getDatePart(value, "day") + 1
  ));

  return date.toISOString().slice(0, 10);
}

function getSalesReportDateRange(date: string) {
  return {
    startIso: zonedInputToUtcIso(`${date}T00:00`, EXPORT_TIME_ZONE),
    endIso: zonedInputToUtcIso(`${getNextDateValue(date)}T00:00`, EXPORT_TIME_ZONE)
  };
}

function firstRelatedRow<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function splitVatInclusiveMinor(totalAmountMinor: number) {
  const amountBeforeVatMinor = Math.round((totalAmountMinor * 100) / 105);
  return {
    amountBeforeVatMinor,
    vatMinor: totalAmountMinor - amountBeforeVatMinor
  };
}

function formatExportMoneyMinor(amountMinor: number, currencyCode: string) {
  return `${currencyCode} ${(amountMinor / 100).toFixed(2)}`;
}

export function formatSalesMoneyMinor(amountMinor: number, currencyCode = "AED") {
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 2
  }).format(amountMinor / 100);
}

export function getDubaiDateInputValue(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: EXPORT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const lookup = new Map(parts.map((part) => [part.type, part.value]));
  return `${lookup.get("year")}-${lookup.get("month")}-${lookup.get("day")}`;
}

function buildActivityDescription(booking: SalesReportBookingInput | null) {
  const event = firstRelatedRow(booking?.events);
  const eventTitle = event?.title?.trim() || "Unknown event";
  const items = [...(booking?.booking_intent_items ?? [])]
    .sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0))
    .map((item) => {
      const title = item.title?.trim();
      if (!title) {
        return null;
      }

      const quantity = item.quantity ?? 1;
      return quantity > 1 ? `${title} x${quantity}` : title;
    })
    .filter((item): item is string => Boolean(item));

  return items.length > 0 ? `${eventTitle}: ${items.join("; ")}` : eventTitle;
}

function buildSalesReportRow(row: SalesReportPaymentInput): SalesReportRow {
  const booking = firstRelatedRow(row.booking_intents);
  const currencyCode = row.currency_code ?? "AED";
  const vat = splitVatInclusiveMinor(row.amount_minor);

  return {
    paidAt: row.paid_at,
    transactionRef: row.ni_order_reference ?? row.merchant_order_reference ?? row.id,
    name: booking?.payer_full_name ?? "",
    totalAmountMinor: row.amount_minor,
    amountBeforeVatMinor: vat.amountBeforeVatMinor,
    vatMinor: vat.vatMinor,
    currencyCode,
    activityDescription: buildActivityDescription(booking)
  };
}

export function buildSalesReportCsvRows(rows: SalesReportRow[]) {
  return [
    SALES_REPORT_HEADERS,
    ...rows.map((row) => [
      formatExportDateTime(row.paidAt),
      row.transactionRef,
      row.name,
      formatExportMoneyMinor(row.totalAmountMinor, row.currencyCode),
      formatExportMoneyMinor(row.amountBeforeVatMinor, row.currencyCode),
      formatExportMoneyMinor(row.vatMinor, row.currencyCode),
      row.activityDescription
    ])
  ];
}

export async function getDailySalesReport(filters: SalesReportFilters): Promise<DailySalesReport> {
  const { startIso, endIso } = getSalesReportDateRange(filters.date);
  let rows: SalesReportRow[] = [];

  if (!isDemoMode()) {
    const supabase = createAdminSupabaseClient();
    const data = await fetchExportRowsInBatches<SalesReportPaymentInput>((from, to) => {
      let query = supabase
        .from("payment_attempts")
        .select(`
          id,
          ni_order_reference,
          merchant_order_reference,
          amount_minor,
          currency_code,
          paid_at,
          booking_intents!inner(
            payer_full_name,
            events(title),
            booking_intent_items(title, quantity, sort_order)
          )
        `)
        .not("paid_at", "is", null)
        .gte("paid_at", startIso)
        .lt("paid_at", endIso)
        .order("paid_at", { ascending: true });

      if (filters.eventId) {
        query = query.eq("booking_intents.event_id", filters.eventId);
      }

      return query.range(from, to);
    });

    rows = data.map(buildSalesReportRow);
  }

  const currencyCode = rows[0]?.currencyCode ?? "AED";

  return {
    date: filters.date,
    startIso,
    endIso,
    rows,
    totalAmountMinor: rows.reduce((sum, row) => sum + row.totalAmountMinor, 0),
    amountBeforeVatMinor: rows.reduce((sum, row) => sum + row.amountBeforeVatMinor, 0),
    vatMinor: rows.reduce((sum, row) => sum + row.vatMinor, 0),
    currencyCode
  };
}

export async function exportDailySalesCsv(filters: SalesReportFilters) {
  const report = await getDailySalesReport(filters);
  return buildCsv(buildSalesReportCsvRows(report.rows));
}

export async function exportAttendeesCsv(eventId: string) {
  let dataRows: Array<Record<string, unknown>>;

  if (isDemoMode()) {
    dataRows = demoRegistrations
      .filter((row) => row.event_id === eventId && row.checked_in_at)
      .map((row, i) => buildRegistrationExportRow(row, i));
  } else {
    const supabase = createAdminSupabaseClient();
    const data = await fetchExportRowsInBatches<ExportRegistrationRowInput>((from, to) =>
      supabase
        .from("registrations")
        .select(REGISTRATION_EXPORT_SELECT)
        .eq("event_id", eventId)
        .not("checked_in_at", "is", null)
        .order("checked_in_at", { ascending: true })
        .range(from, to)
    );

    dataRows = data.map((row, i) => buildRegistrationExportRow(row, i));
  }

  return registrationRowsToCsv(dataRows);
}

export async function exportRegistrationsCsv(eventId: string) {
  let dataRows: Array<Record<string, unknown>>;

  if (isDemoMode()) {
    dataRows = demoRegistrations
      .filter((row) => row.event_id === eventId)
      .map((row, i) => buildRegistrationExportRow(row, i));
  } else {
    const supabase = createAdminSupabaseClient();
    const data = await fetchExportRowsInBatches<ExportRegistrationRowInput>((from, to) =>
      supabase
        .from("registrations")
        .select(REGISTRATION_EXPORT_SELECT)
        .eq("event_id", eventId)
        .order("created_at", { ascending: true })
        .range(from, to)
    );

    dataRows = data.map((row, i) => buildRegistrationExportRow(row, i));
  }

  return registrationRowsToCsv(dataRows);
}

export async function exportCheckinsCsv(eventId: string) {
  if (isDemoMode()) {
    const rows = [
      ["id", "result", "gate_name", "device_id", "staff_user_id", "scanned_at", "full_name", "email"],
      ...[
        [
          "demo-checkin-1",
          "success",
          "Main gate",
          "DL-01",
          "demo-admin",
          "2026-05-22T05:18:00.000Z",
          demoRegistrations[0]?.full_name ?? "",
          demoRegistrations[0]?.email_raw ?? ""
        ],
        [
          "demo-checkin-2",
          "already_checked_in",
          "Main gate",
          "DL-01",
          "demo-admin",
          "2026-05-22T05:19:00.000Z",
          demoRegistrations[0]?.full_name ?? "",
          demoRegistrations[0]?.email_raw ?? ""
        ]
      ]
    ];

    return buildCsv(rows);
  }

  const supabase = createAdminSupabaseClient();
  const data = await fetchExportRowsInBatches<Record<string, unknown>>((from, to) =>
    supabase
      .from("checkins")
      .select("id, result, gate_name, device_id, staff_user_id, scanned_at, registration:registrations(full_name, email_raw)")
      .eq("event_id", eventId)
      .order("scanned_at", { ascending: true })
      .range(from, to)
  );

  const rows = [
    ["id", "result", "gate_name", "device_id", "staff_user_id", "scanned_at", "full_name", "email"],
    ...(data ?? []).map((row) => [
      row.id,
      row.result,
      row.gate_name,
      row.device_id,
      row.staff_user_id,
      formatExportDateTime(String(row.scanned_at ?? "")),
      (row.registration as { full_name?: string } | null)?.full_name ?? "",
      (row.registration as { email_raw?: string } | null)?.email_raw ?? ""
    ])
  ];

  return buildCsv(rows);
}
