import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { demoEvents, demoRegistrations } from "@/lib/demo-data";
import { isDemoMode } from "@/lib/demo-mode";
import { env } from "@/lib/env";
import { buildQrEmailAttachment, buildQrEmailCid } from "@/lib/qr";
import { generateOpaqueToken, hashOpaqueToken } from "@/lib/tokens";
import type { AuthenticatedAppUser } from "@/lib/auth";
import type { EventRecord } from "@/lib/types";
import { blankToNull, buildAbsoluteUrl, slugify, zonedInputToUtcIso } from "@/lib/utils";
import { adminEventSchema } from "@/lib/validation/admin";
import { buildConfirmationEmail } from "@/services/email-templates";
import { executeEmailJob } from "@/services/email-jobs";
import { sendMail } from "@/services/mailer";
import type { z } from "zod";

type AdminEventInput = z.infer<typeof adminEventSchema>;

function buildEventPayload(input: AdminEventInput) {
  const timeZone = input.timezone.trim();

  return {
    slug: slugify(input.slug),
    title: input.title.trim(),
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
      ticketOptions: input.ticketOptions.map((ticket) => ({
        id: ticket.id.trim(),
        title: ticket.title.trim(),
        description: ticket.description?.trim() ?? "",
        note: blankToNull(ticket.note),
        badge: blankToNull(ticket.badge),
        capacity: ticket.capacity ?? null,
        soldOut: ticket.soldOut
      }))
    }
  };
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

export async function createEvent(input: AdminEventInput, actor: AuthenticatedAppUser) {
  if (isDemoMode()) {
    const payload = buildEventPayload(input);

    return {
      id: "demo-created-event",
      ...payload,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    } as EventRecord;
  }

  const supabase = createAdminSupabaseClient();
  const payload = buildEventPayload(input);

  const { data, error } = await supabase.from("events").insert(payload).select("*").single();

  if (error) {
    throw error;
  }

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
  if (isDemoMode()) {
    const existing = demoEvents.find((event) => event.id === input.id);

    if (!existing) {
      throw new Error("Demo event not found.");
    }

    return {
      ...existing,
      ...buildEventPayload(input),
      updated_at: new Date().toISOString()
    } as EventRecord;
  }

  if (!input.id) {
    throw new Error("Event id is required for updates.");
  }

  const supabase = createAdminSupabaseClient();

  const { data: before, error: beforeError } = await supabase
    .from("events")
    .select("*")
    .eq("id", input.id)
    .single();

  if (beforeError) {
    throw beforeError;
  }

  const payload = buildEventPayload(input);

  const { data, error } = await supabase
    .from("events")
    .update(payload)
    .eq("id", input.id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

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
    return { ok: true };
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

  const { count, error: countError } = await supabase
    .from("registrations")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId);

  if (countError) {
    throw countError;
  }

  if ((count ?? 0) > 0) {
    throw new Error("Cannot delete an event that has registrations. Revoke or remove all registrations first.");
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

  return { ok: true };
}

export async function listRegistrations(filters: {
  eventId?: string;
  status?: string;
  query?: string;
}) {
  if (isDemoMode()) {
    return demoRegistrations
      .filter((row) => !filters.eventId || row.event_id === filters.eventId)
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
  }

  const supabase = createAdminSupabaseClient();
  let query = supabase
    .from("registrations")
    .select(
      "id, event_id, full_name, email_raw, phone, age, uae_resident, ticket_option_title, status, checked_in_at, created_at, events(title, slug)"
    )
    .order("created_at", { ascending: false });

  if (filters.eventId) {
    query = query.eq("event_id", filters.eventId);
  }

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  if (filters.query?.trim()) {
    const needle = filters.query.trim();
    query = query.or(`full_name.ilike.%${needle}%,email_raw.ilike.%${needle}%,phone.ilike.%${needle}%`);
  }

  const { data, error } = await query.limit(200);

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function revokeRegistration(
  registrationId: string,
  actor: AuthenticatedAppUser,
  reason?: string | null
) {
  if (isDemoMode()) {
    return {
      id: registrationId,
      status: "revoked",
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

  const { data, error } = await supabase
    .from("registrations")
    .update({
      status: "revoked"
    })
    .eq("id", registrationId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  await logAuditEvent({
    actor,
    action: "registration.revoked",
    entityType: "registration",
    entityId: registrationId,
    beforeJson: before,
    afterJson: {
      ...data,
      revoke_reason: blankToNull(reason)
    }
  });

  return data;
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
    .select("id, event_id, full_name, email_raw, status, ticket_option_title, events(*)")
    .eq("id", registrationId)
    .single();

  if (error) {
    throw error;
  }

  if (registration.status === "revoked" || registration.status === "cancelled") {
    throw new Error("Cannot resend QR for a revoked or cancelled registration.");
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

  await executeEmailJob(
    "resend_qr",
    {
      registrationId,
      eventId: registration.event_id,
      email: registration.email_raw
    },
    async () => {
      const mail = buildConfirmationEmail({
        fullName: registration.full_name,
        eventTitle: event.title,
        eventStartAt: event.start_at,
        eventEndAt: event.end_at,
        eventTimezone: event.timezone,
        venue: event.venue,
        mapLink: event.form_config?.mapLink,
        ticketTitle: registration.ticket_option_title ?? "General Admission",
        posterImageUrl: buildAbsoluteUrl(env.APP_URL, "/train-with-dubai-police-cover.png"),
        qrImageSrc: buildQrEmailCid(qrAttachment.contentId)
      });

      await sendMail({
        to: registration.email_raw,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        attachments: [qrAttachment]
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

  const stringified = String(value).replace(/"/g, '""');
  return `"${stringified}"`;
}

function formatUaeDateTime(value: string | null) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("en-AE", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(new Date(value));
}

export async function exportAttendeesXlsx(eventId: string) {
  const XLSX = await import("xlsx");

  let dataRows: Array<Record<string, unknown>>;

  if (isDemoMode()) {
    dataRows = demoRegistrations
      .filter((row) => row.event_id === eventId)
      .map((row, i) => ({
        "#": i + 1,
        "Full Name": row.full_name,
        "Email": row.email_raw,
        "Status": row.status,
        "Admission": row.ticket_option_title ?? "General Admission",
        "Registered At (UAE)": formatUaeDateTime(row.created_at),
        "Checked In At (UAE)": formatUaeDateTime(row.checked_in_at ?? null),
      }));
  } else {
    const supabase = createAdminSupabaseClient();

    const { data, error } = await supabase
      .from("registrations")
      .select("full_name, email_raw, status, ticket_option_title, created_at, checked_in_at")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true });

    if (error) {
      throw error;
    }

    dataRows = (data ?? []).map((row, i) => ({
      "#": i + 1,
      "Full Name": row.full_name,
      "Email": row.email_raw,
      "Status": row.status,
      "Admission": row.ticket_option_title ?? "General Admission",
      "Registered At (UAE)": formatUaeDateTime(row.created_at),
      "Checked In At (UAE)": formatUaeDateTime(row.checked_in_at),
    }));
  }

  const ws = XLSX.utils.json_to_sheet(dataRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Attendees");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export async function exportRegistrationsXlsx(eventId: string) {
  const XLSX = await import("xlsx");

  let dataRows: Array<Record<string, unknown>>;

  if (isDemoMode()) {
    dataRows = demoRegistrations
      .filter((row) => row.event_id === eventId)
      .map((row, i) => ({
        "#": i + 1,
        "Full Name": row.full_name,
        "Email": row.email_raw,
        "Phone Number": row.phone,
        "Age": row.age,
        "UAE Resident": row.uae_resident ? "Yes" : "No",
        "Admission": row.ticket_option_title ?? "General Admission",
        "Registered At (UAE)": formatUaeDateTime(row.created_at),
      }));
  } else {
    const supabase = createAdminSupabaseClient();

    const { data, error } = await supabase
      .from("registrations")
      .select("full_name, email_raw, phone, age, uae_resident, ticket_option_title, created_at")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true });

    if (error) {
      throw error;
    }

    dataRows = (data ?? []).map((row, i) => ({
      "#": i + 1,
      "Full Name": row.full_name,
      "Email": row.email_raw,
      "Phone Number": row.phone,
      "Age": row.age,
      "UAE Resident": row.uae_resident ? "Yes" : "No",
      "Admission": row.ticket_option_title ?? "General Admission",
      "Registered At (UAE)": formatUaeDateTime(row.created_at),
    }));
  }

  const ws = XLSX.utils.json_to_sheet(dataRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Registrations");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
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

    return rows.map((row) => row.map(escapeCsvValue).join(",")).join("\n");
  }

  const supabase = createAdminSupabaseClient();

  const { data, error } = await supabase
    .from("checkins")
    .select("id, result, gate_name, device_id, staff_user_id, scanned_at, registration:registrations(full_name, email_raw)")
    .eq("event_id", eventId)
    .order("scanned_at", { ascending: true });

  if (error) {
    throw error;
  }

  const rows = [
    ["id", "result", "gate_name", "device_id", "staff_user_id", "scanned_at", "full_name", "email"],
    ...(data ?? []).map((row) => [
      row.id,
      row.result,
      row.gate_name,
      row.device_id,
      row.staff_user_id,
      row.scanned_at,
      (row.registration as { full_name?: string } | null)?.full_name ?? "",
      (row.registration as { email_raw?: string } | null)?.email_raw ?? ""
    ])
  ];

  return rows.map((row) => row.map(escapeCsvValue).join(",")).join("\n");
}
