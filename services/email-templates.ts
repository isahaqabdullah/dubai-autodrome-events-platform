import { env } from "@/lib/env";
import { formatEventDateRange } from "@/lib/utils";

interface VerificationEmailInput {
  fullName: string;
  eventTitle: string;
  otpCode: string;
}

interface ConfirmationEmailInput {
  fullName: string;
  eventTitle: string;
  eventStartAt: string;
  eventEndAt: string;
  eventTimezone: string;
  venue: string | null;
  mapLink?: string | null;
  qrImageSrc: string;
  ticketTitle: string;
  posterImageUrl: string;
  introLine?: string;
  detailParagraphs?: string[];
}

export function buildVerificationEmail(input: VerificationEmailInput) {
  const subject = `Your verification code for ${input.eventTitle}`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0c1723">
      <p>Hello ${input.fullName},</p>
      <p>Enter this 6-digit verification code to complete your registration for <strong>${input.eventTitle}</strong>.</p>
      <div style="display:inline-block;padding:14px 18px;background:#0c1723;color:#ffffff;border-radius:12px;font-size:28px;font-weight:700;letter-spacing:0.22em">
        ${input.otpCode}
      </div>
      <p style="margin-top:16px">This code is specific to this registration attempt and expires soon.</p>
      <p>Questions? Reply to ${env.MAIL_REPLY_TO_EMAIL}.</p>
    </div>
  `;

  const text = [
    `Hello ${input.fullName},`,
    "",
    `Enter this 6-digit verification code to complete your registration for ${input.eventTitle}:`,
    input.otpCode,
    "",
    `Questions? Reply to ${env.MAIL_REPLY_TO_EMAIL}.`
  ].join("\n");

  return { subject, html, text };
}

export function buildConfirmationEmail(input: ConfirmationEmailInput) {
  const subject = `Your QR code for ${input.eventTitle}`;
  const schedule = formatEventDateRange(input.eventStartAt, input.eventEndAt, input.eventTimezone);
  const mapLinkHtml = input.mapLink
    ? ` — <a href="${input.mapLink}" style="color:#2e768b;text-decoration:none;font-weight:600" target="_blank">📍 View on map</a>`
    : "";
  const venueLine = input.venue ? `<p><strong>Venue:</strong> ${input.venue}${mapLinkHtml}</p>` : "";
  const introLine = input.introLine ?? "Hit the track for free. Dubai Police has you covered!";
  const detailParagraphs =
    input.detailParagraphs ?? [
      "Join us at Dubai Autodrome for the region's premier community fitness night! In a shared commitment to community health, wellness, and safety, we are thrilled to announce Train With Dubai Police.",
      "The best part? Dubai Police has your entry completely covered, making it 100% free for all participants. Join us on our Circuit under the lights for an unforgettable, high-energy evening of cycling, running, and specialized bootcamps.",
      "Registration is required, so secure your free spot today and let's hit the track!"
    ];

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0c1723">
      <div style="max-width:720px;margin:0 auto;border:1px solid #e5e7eb;border-radius:18px;overflow:hidden;background:#ffffff">
        <img src="${input.posterImageUrl}" alt="${input.eventTitle}" style="display:block;width:100%;height:auto" />
        <div style="padding:28px 32px">
          <h1 style="margin:0 0 14px;font-size:22px;line-height:1.2;color:#24324a">${input.eventTitle}</h1>
          <p style="margin:0 0 16px;font-size:16px;color:#5b6678">${introLine}</p>
          ${detailParagraphs.map((paragraph) => `<p style="margin:0 0 16px;color:#4b5563">${paragraph}</p>`).join("")}
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0" />
          <p style="margin:0 0 12px;font-weight:700;color:#24324a">Primary Registrant</p>
          <p style="margin:0 0 16px;color:#4b5563">${input.fullName}</p>
          <p style="margin:0 0 10px"><strong>Admission:</strong> ${input.ticketTitle}</p>
          <p style="margin:0 0 10px"><strong>Date and time:</strong> ${schedule}</p>
          ${venueLine}
          <p style="margin:18px 0 12px"><strong>Your ticket QR code</strong></p>
          <p><img src="${input.qrImageSrc}" alt="Registration QR code" width="260" height="260" style="display:block;border:1px solid #d6dde6;border-radius:16px;background:#ffffff;padding:8px" /></p>
          <p style="margin:16px 0 0;color:#4b5563">Present this QR code at check-in. If the preview does not appear automatically, download the attached QR image and present it at the venue.</p>
          <p style="margin:18px 0 0;color:#4b5563">Support: ${env.MAIL_REPLY_TO_EMAIL}</p>
        </div>
      </div>
    </div>
  `;

  const text = [
    `Hello ${input.fullName},`,
    "",
    `Your registration is confirmed for ${input.eventTitle}.`,
    `Admission: ${input.ticketTitle}`,
    `Date and time: ${schedule}`,
    input.venue ? `Venue: ${input.venue}` : "",
    input.mapLink ? `View on map: ${input.mapLink}` : "",
    "Present your QR code at check-in. It is single-use.",
    "If the QR preview does not appear in your email client, download the attached QR image and present it at check-in.",
    `Support: ${env.MAIL_REPLY_TO_EMAIL}`
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
}
