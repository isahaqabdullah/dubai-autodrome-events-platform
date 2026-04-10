import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { demoEvents, demoRegistrations } from "@/lib/demo-data";
import { isDemoMode } from "@/lib/demo-mode";
import { buildQrEmailAttachment, buildQrEmailCid } from "@/lib/qr";
import { generateOpaqueToken, hashOpaqueToken } from "@/lib/tokens";
import type { AuthenticatedAppUser } from "@/lib/auth";
import type { EventRecord } from "@/lib/types";
import { blankToNull, slugify, zonedInputToUtcIso } from "@/lib/utils";
import { adminEventSchema } from "@/lib/validation/admin";
import { buildConfirmationEmail } from "@/services/email-templates";
import { executeEmailJob } from "@/services/email-jobs";
import { getEventById } from "@/services/events";
import { sendMail } from "@/services/mailer";
import type { z } from "zod";

type AdminEventInput = z.infer<typeof adminEventSchema>;

function buildEventPayload(input: AdminEventInput) {
  const timeZone = input.timezone.trim();

  return {
    slug: slugify(input.slug),
    title: input.title.trim(),
    description: blankToNull(input.description),
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
      introNote: blankToNull(input.introNote),
      successMessage: blankToNull(input.successMessage),
      showCompanyField: input.showCompanyField,
      showEmergencyFields: input.showEmergencyFields
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
    .select("id, event_id, full_name, email_raw, phone, company, status, checked_in_at, created_at, events(title, slug)")
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
    .select("id, event_id, full_name, email_raw, status, events(*)")
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

export async function exportRegistrationsCsv(eventId: string) {
  if (isDemoMode()) {
    const rows = [
      ["id", "full_name", "email", "phone", "company", "status", "checked_in_at", "created_at", "event_title"],
      ...demoRegistrations
        .filter((row) => row.event_id === eventId)
        .map((row) => [
          row.id,
          row.full_name,
          row.email_raw,
          row.phone,
          row.company,
          row.status,
          row.checked_in_at,
          row.created_at,
          demoEvents.find((event) => event.id === row.event_id)?.title ?? "Demo event"
        ])
    ];

    return rows.map((row) => row.map(escapeCsvValue).join(",")).join("\n");
  }

  const supabase = createAdminSupabaseClient();

  const { data, error } = await supabase
    .from("registrations")
    .select("id, full_name, email_raw, phone, company, status, checked_in_at, created_at, events(title)")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  const rows = [
    ["id", "full_name", "email", "phone", "company", "status", "checked_in_at", "created_at", "event_title"],
    ...(data ?? []).map((row) => [
      row.id,
      row.full_name,
      row.email_raw,
      row.phone,
      row.company,
      row.status,
      row.checked_in_at,
      row.created_at,
      (row.events as { title?: string } | null)?.title ?? ""
    ])
  ];

  return rows.map((row) => row.map(escapeCsvValue).join(",")).join("\n");
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

export async function getEventAnalyticsBundle(eventId: string) {
  const event = await getEventById(eventId);

  if (!event) {
    throw new Error("Event not found.");
  }

  return {
    event
  };
}
