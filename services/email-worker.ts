import "server-only";
import { env } from "@/lib/env";
import { DEFAULT_TICKET_POSTER_IMAGE } from "@/lib/ticket-presentation";
import { buildQrEmailAttachment, buildQrEmailCid } from "@/lib/qr";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { EmailJobKind } from "@/lib/types";
import { buildAbsoluteUrl } from "@/lib/utils";
import { formatErrorMessage, getErrorInfo } from "@/lib/errors";
import { buildConfirmationEmail, buildGroupConfirmationEmail } from "@/services/email-templates";
import { getEventById } from "@/services/events";
import { sendMail } from "@/services/mailer";

const CLAIM_BATCH_SIZE = 5;
const LOCK_TTL_SECONDS = 120;

interface ClaimedJob {
  id: string;
  kind: EmailJobKind;
  payload: Record<string, unknown>;
  attempts: number;
  attempts_max: number;
}

interface GroupAttendeePayload {
  registrationId: string;
  fullName: string;
  qrToken: string;
  manualCheckinCode?: string;
  categoryTitle: string;
  ticketTitle: string | null;
  email?: string;
}

type RegistrationConfirmedPayload = Record<string, unknown> & {
  registrationId: string;
  eventId: string;
  email: string;
  fullName: string;
  qrToken: string;
  manualCheckinCode?: string;
  ticketTitle: string;
  bookingId?: string;
  bookedBy?: string;
  attendees?: GroupAttendeePayload[];
};

function isRegistrationConfirmedPayload(
  payload: Record<string, unknown>
): payload is RegistrationConfirmedPayload {
  return (
    typeof payload.registrationId === "string" &&
    typeof payload.eventId === "string" &&
    typeof payload.email === "string" &&
    typeof payload.fullName === "string" &&
    typeof payload.qrToken === "string" &&
    typeof payload.ticketTitle === "string"
  );
}

async function hydrateManualCheckinCodes(payload: RegistrationConfirmedPayload) {
  const registrationIds = new Set<string>();

  if (!payload.manualCheckinCode) {
    registrationIds.add(payload.registrationId);
  }

  for (const attendee of payload.attendees ?? []) {
    if (!attendee.manualCheckinCode) {
      registrationIds.add(attendee.registrationId);
    }
  }

  if (registrationIds.size === 0) {
    return payload;
  }

  const { data, error } = await createAdminSupabaseClient()
    .from("registrations")
    .select("id, manual_checkin_code")
    .in("id", Array.from(registrationIds));

  if (error) {
    throw error;
  }

  const codeById = new Map(
    (data ?? []).map((row) => [row.id as string, row.manual_checkin_code as string])
  );

  return {
    ...payload,
    manualCheckinCode: payload.manualCheckinCode ?? codeById.get(payload.registrationId),
    attendees: payload.attendees?.map((attendee) => ({
      ...attendee,
      manualCheckinCode: attendee.manualCheckinCode ?? codeById.get(attendee.registrationId)
    }))
  };
}

async function handleRegistrationConfirmed(job: ClaimedJob) {
  if (!isRegistrationConfirmedPayload(job.payload)) {
    throw new Error("registration_confirmed payload is missing required fields");
  }

  const payload = await hydrateManualCheckinCodes(job.payload);
  const event = await getEventById(payload.eventId);

  if (!event) {
    throw new Error(`Event ${payload.eventId} not found when sending confirmation email`);
  }

  const fc = event.form_config;
  const posterImageUrl = buildAbsoluteUrl(env.APP_URL, fc?.posterImage ?? DEFAULT_TICKET_POSTER_IMAGE);
  const emailIntroLine = fc?.emailIntroLine ?? fc?.introLine ?? undefined;
  const emailDescriptionParagraphs = fc?.emailDescriptionParagraphs ?? fc?.descriptionParagraphs ?? undefined;

  // Group booking — primary registrant gets all attendees' tickets
  if (payload.attendees && payload.attendees.length > 1) {
    const attendeeWithoutCode = payload.attendees.find((attendee) => !attendee.manualCheckinCode);
    if (attendeeWithoutCode) {
      throw new Error(`Missing manual check-in code for attendee ${attendeeWithoutCode.registrationId}`);
    }

    const attachments = await Promise.all(
      payload.attendees.map((att, i) => buildQrEmailAttachment(att.qrToken, i))
    );

    const mail = buildGroupConfirmationEmail({
      primaryFullName: payload.fullName,
      eventTitle: event.title,
      eventStartAt: event.start_at,
      eventEndAt: event.end_at,
      eventTimezone: event.timezone,
      venue: event.venue,
      mapLink: fc?.mapLink,
      posterImageUrl,
      introLine: emailIntroLine,
      detailParagraphs: emailDescriptionParagraphs,
      attendees: payload.attendees.map((att, i) => ({
        fullName: att.fullName,
        categoryTitle: att.categoryTitle,
        ticketTitle: att.ticketTitle,
        manualCheckinCode: att.manualCheckinCode!,
        qrImageSrc: buildQrEmailCid(attachments[i].contentId),
        qrLinkHref: buildAbsoluteUrl(env.APP_URL, `/api/qr?token=${encodeURIComponent(att.qrToken)}`)
      }))
    });

    await sendMail({
      to: payload.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      attachments,
      idempotencyKey: job.id
    });
  } else {
    // Single attendee or individual attendee email
    if (!payload.manualCheckinCode) {
      throw new Error(`Missing manual check-in code for registration ${payload.registrationId}`);
    }

    const qrAttachment = await buildQrEmailAttachment(payload.qrToken);
    const mail = buildConfirmationEmail({
      fullName: payload.fullName,
      eventTitle: event.title,
      eventStartAt: event.start_at,
      eventEndAt: event.end_at,
      eventTimezone: event.timezone,
      venue: event.venue,
      mapLink: fc?.mapLink,
      manualCheckinCode: payload.manualCheckinCode,
      ticketTitle: payload.ticketTitle,
      posterImageUrl,
      qrImageSrc: buildQrEmailCid(qrAttachment.contentId),
      qrLinkHref: buildAbsoluteUrl(env.APP_URL, `/api/qr?token=${encodeURIComponent(payload.qrToken)}`),
      introLine: emailIntroLine,
      detailParagraphs: emailDescriptionParagraphs,
      bookedBy: payload.bookedBy as string | undefined
    });

    await sendMail({
      to: payload.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      attachments: [qrAttachment],
      idempotencyKey: job.id
    });
  }

  const { error } = await createAdminSupabaseClient()
    .from("registrations")
    .update({ confirmation_email_sent_at: new Date().toISOString() })
    .eq("id", payload.registrationId);

  if (error) {
    console.error("[email-worker] confirmation email sent but audit update failed", {
      jobId: job.id,
      registrationId: payload.registrationId,
      error: error.message
    });
  }
}

async function dispatch(job: ClaimedJob) {
  switch (job.kind) {
    case "registration_confirmed":
      await handleRegistrationConfirmed(job);
      return;
    case "verify_email":
    case "resend_qr":
      // These only ever enter the queue via a stale-lock reclaim — i.e. the
      // original in-request send was killed mid-flight. The plaintext token
      // isn't in the payload (by design), so we can't safely re-send. Mark
      // failed so operators can follow up with the user.
      throw new Error(
        `Reclaimed ${job.kind} job cannot be retried from the worker; manual resend required`
      );
    default: {
      const exhaustive: never = job.kind;
      throw new Error(`Unknown email job kind: ${exhaustive}`);
    }
  }
}

async function finalizeSuccess(jobId: string) {
  const supabase = createAdminSupabaseClient();
  await supabase
    .from("email_jobs")
    .update({ status: "sent", last_error: null, locked_at: null })
    .eq("id", jobId);
}

async function finalizeFailure(job: ClaimedJob, error: unknown) {
  const supabase = createAdminSupabaseClient();
  const message = formatErrorMessage(error);
  const errorInfo = getErrorInfo(error);
  const exhausted = job.attempts >= job.attempts_max;

  console.error("[email-worker] job failed", {
    jobId: job.id,
    kind: job.kind,
    attempts: job.attempts,
    attempts_max: job.attempts_max,
    exhausted,
    error: errorInfo
  });

  await supabase
    .from("email_jobs")
    .update({
      status: exhausted ? "failed" : "queued",
      last_error: message,
      locked_at: null
    })
    .eq("id", job.id);
}

export interface EmailWorkerRunResult {
  claimed: number;
  sent: number;
  requeued: number;
  failed: number;
  swept: number;
}

export async function runEmailWorker(): Promise<EmailWorkerRunResult> {
  const supabase = createAdminSupabaseClient();

  const { data: claimed, error: claimError } = await supabase.rpc("claim_email_jobs", {
    p_limit: CLAIM_BATCH_SIZE,
    p_lock_ttl_seconds: LOCK_TTL_SECONDS
  });

  if (claimError) {
    throw claimError;
  }

  const jobs = (claimed ?? []) as ClaimedJob[];
  let sent = 0;
  let requeued = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      await dispatch(job);
      await finalizeSuccess(job.id);
      sent += 1;
    } catch (error) {
      await finalizeFailure(job, error);
      if (job.attempts >= job.attempts_max) {
        failed += 1;
      } else {
        requeued += 1;
      }
    }
  }

  const { data: sweptCount, error: sweepError } = await supabase.rpc(
    "fail_exhausted_email_jobs",
    { p_lock_ttl_seconds: LOCK_TTL_SECONDS }
  );

  if (sweepError) {
    console.error("[email-worker] sweeper failed", { error: sweepError.message });
  }

  return {
    claimed: jobs.length,
    sent,
    requeued,
    failed,
    swept: typeof sweptCount === "number" ? sweptCount : 0
  };
}
