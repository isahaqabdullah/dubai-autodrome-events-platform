import { env } from "@/lib/env";
import { formatEventDateRange } from "@/lib/utils";

interface VerificationEmailInput {
  fullName: string;
  eventTitle: string;
  verifyUrl: string;
}

interface ConfirmationEmailInput {
  fullName: string;
  eventTitle: string;
  eventStartAt: string;
  eventEndAt: string;
  eventTimezone: string;
  venue: string | null;
  qrImageSrc: string;
}

export function buildVerificationEmail(input: VerificationEmailInput) {
  const subject = `Verify your registration for ${input.eventTitle}`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0c1723">
      <p>Hello ${input.fullName},</p>
      <p>Verify your email to complete your registration for <strong>${input.eventTitle}</strong>.</p>
      <p><a href="${input.verifyUrl}" style="display:inline-block;padding:12px 18px;background:#0c1723;color:#ffffff;text-decoration:none;border-radius:10px">Verify registration</a></p>
      <p>If the button does not work, copy and paste this URL into your browser:</p>
      <p>${input.verifyUrl}</p>
      <p>This verification link is specific to this registration attempt and expires soon.</p>
      <p>Questions? Reply to ${env.MAIL_REPLY_TO_EMAIL}.</p>
    </div>
  `;

  const text = [
    `Hello ${input.fullName},`,
    "",
    `Verify your email to complete your registration for ${input.eventTitle}.`,
    input.verifyUrl,
    "",
    `Questions? Reply to ${env.MAIL_REPLY_TO_EMAIL}.`
  ].join("\n");

  return { subject, html, text };
}

export function buildConfirmationEmail(input: ConfirmationEmailInput) {
  const subject = `Your QR code for ${input.eventTitle}`;
  const schedule = formatEventDateRange(input.eventStartAt, input.eventEndAt, input.eventTimezone);
  const venueLine = input.venue ? `<p><strong>Venue:</strong> ${input.venue}</p>` : "";

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0c1723">
      <p>Hello ${input.fullName},</p>
      <p>Your registration is confirmed for <strong>${input.eventTitle}</strong>.</p>
      <p><strong>Date and time:</strong> ${schedule}</p>
      ${venueLine}
      <p>Present this QR code at check-in. It is single-use.</p>
      <p><img src="${input.qrImageSrc}" alt="Registration QR code" width="260" height="260" style="display:block;border:1px solid #d6dde6;border-radius:16px" /></p>
      <p>If the QR preview does not appear automatically, download the attached QR image and present it at check-in.</p>
      <p>Support: ${env.MAIL_REPLY_TO_EMAIL}</p>
    </div>
  `;

  const text = [
    `Hello ${input.fullName},`,
    "",
    `Your registration is confirmed for ${input.eventTitle}.`,
    `Date and time: ${schedule}`,
    input.venue ? `Venue: ${input.venue}` : "",
    "Present your QR code at check-in. It is single-use.",
    "If the QR preview does not appear in your email client, download the attached QR image and present it at check-in.",
    `Support: ${env.MAIL_REPLY_TO_EMAIL}`
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
}
