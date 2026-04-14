import "server-only";
import { Resend } from "resend";
import { env, resendConfigured } from "@/lib/env";

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
}

let resendClient: Resend | null = null;

function getResendClient() {
  if (!resendClient) {
    resendClient = new Resend(env.RESEND_API_KEY);
  }

  return resendClient;
}

export async function sendMail(payload: MailPayload) {
  const toAddresses = Array.isArray(payload.to) ? payload.to : [payload.to];

  if (!resendConfigured) {
    console.warn("[mock-mailer] RESEND_API_KEY missing; email not sent", {
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        VERCEL: process.env.VERCEL,
        VERCEL_ENV: process.env.VERCEL_ENV
      },
      to: toAddresses,
      subject: payload.subject,
      from: env.MAIL_FROM_EMAIL,
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

  const { error } = await getResendClient().emails.send({
    from: env.MAIL_FROM_EMAIL,
    to: toAddresses,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
    replyTo: env.MAIL_REPLY_TO_EMAIL,
    attachments: payload.attachments
  });

  if (error) {
    console.error("[resend] emails.send failed", {
      to: toAddresses,
      from: env.MAIL_FROM_EMAIL,
      subject: payload.subject,
      error: error.message
    });
    throw new Error(error.message);
  }

  return {
    ok: true,
    mode: "resend" as const
  };
}
