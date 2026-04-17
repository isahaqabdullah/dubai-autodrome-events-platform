import "server-only";
import { Resend } from "resend";
import { env, resendConfigured } from "@/lib/env";
import { formatMailFromAddress } from "@/lib/mail-address";

export interface MailPayload {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  attachments?: Array<{
    content: string | Buffer;
    filename: string;
    contentType?: string;
    contentId?: string;
  }>;
  /**
   * Stable key for safe retries. Reuse across retry attempts for the same
   * logical send (e.g. email_jobs.id) so Resend dedupes at the API.
   */
  idempotencyKey?: string;
}

const PER_ATTEMPT_TIMEOUT_MS = 8_000;
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 400;

let resendClient: Resend | null = null;

function getResendClient() {
  if (!resendClient) {
    resendClient = new Resend(env.RESEND_API_KEY);
  }

  return resendClient;
}

class MailTimeoutError extends Error {
  constructor(ms: number) {
    super(`Resend send timed out after ${ms}ms`);
    this.name = "MailTimeoutError";
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(statusCode: number | null | undefined) {
  // Treat fetch-level failures (null) and 408/429/5xx as transient.
  if (statusCode == null) return true;
  if (statusCode === 408 || statusCode === 429) return true;
  return statusCode >= 500;
}

async function sendOnce(
  client: Resend,
  body: Parameters<Resend["emails"]["send"]>[0],
  options: Parameters<Resend["emails"]["send"]>[1]
) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new MailTimeoutError(PER_ATTEMPT_TIMEOUT_MS)),
      PER_ATTEMPT_TIMEOUT_MS
    );
  });

  try {
    return await Promise.race([client.emails.send(body, options), timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function sendMail(payload: MailPayload) {
  const toAddresses = Array.isArray(payload.to) ? payload.to : [payload.to];
  const fromAddress = formatMailFromAddress(env.MAIL_FROM_EMAIL, env.MAIL_FROM_NAME);

  if (!resendConfigured) {
    console.warn("[mock-mailer] RESEND_API_KEY missing; email not sent", {
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        VERCEL: process.env.VERCEL,
        VERCEL_ENV: process.env.VERCEL_ENV
      },
      to: toAddresses,
      subject: payload.subject,
      from: fromAddress,
      replyTo: env.MAIL_REPLY_TO_EMAIL,
      attachments: payload.attachments?.map((attachment) => ({
        filename: attachment.filename,
        contentId: attachment.contentId,
        contentType: attachment.contentType
      }))
    });

    return {
      ok: true,
      mode: "mock" as const
    };
  }

  const client = getResendClient();
  const body = {
    from: fromAddress,
    to: toAddresses,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
    replyTo: env.MAIL_REPLY_TO_EMAIL,
    attachments: payload.attachments
  };
  const options = payload.idempotencyKey
    ? { idempotencyKey: payload.idempotencyKey }
    : undefined;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let result;
    try {
      result = await sendOnce(client, body, options);
    } catch (thrown) {
      // Timeout or unexpected throw. Always retryable.
      lastError = thrown instanceof Error ? thrown : new Error(String(thrown));
      console.warn("[resend] send threw; will retry if attempts remain", {
        attempt,
        error: lastError.message,
        to: toAddresses,
        subject: payload.subject
      });
      if (attempt < MAX_ATTEMPTS) {
        await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1) + Math.random() * 200);
        continue;
      }
      break;
    }

    const { error } = result;
    if (!error) {
      return { ok: true, mode: "resend" as const };
    }

    const message = error.message ?? "Resend returned an unknown error";
    lastError = new Error(message);

    if (!isRetryableStatus(error.statusCode) || attempt === MAX_ATTEMPTS) {
      console.error("[resend] emails.send failed", {
        attempt,
        to: toAddresses,
        from: fromAddress,
        subject: payload.subject,
        statusCode: error.statusCode,
        name: error.name,
        error: message
      });
      throw lastError;
    }

    console.warn("[resend] transient failure; retrying", {
      attempt,
      statusCode: error.statusCode,
      name: error.name,
      error: message,
      to: toAddresses
    });
    await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1) + Math.random() * 200);
  }

  throw lastError ?? new Error("Resend send failed with no error detail");
}
