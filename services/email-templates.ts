import "server-only";
import { EventTicketEmailCard } from "@/components/email/event-ticket-email-card";
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
  qrLinkHref?: string | null;
  manualCheckinCode: string;
  ticketTitle: string;
  posterImageUrl: string;
  introLine?: string;
  detailParagraphs?: string[];
  bookedBy?: string;
}

interface GroupAttendeeEmailData {
  fullName: string;
  categoryTitle: string;
  ticketTitle: string | null;
  qrImageSrc: string;
  qrLinkHref?: string | null;
  manualCheckinCode: string;
}

interface GroupConfirmationEmailInput {
  primaryFullName: string;
  eventTitle: string;
  eventStartAt: string;
  eventEndAt: string;
  eventTimezone: string;
  venue: string | null;
  mapLink?: string | null;
  posterImageUrl: string;
  attendees: GroupAttendeeEmailData[];
  introLine?: string;
  detailParagraphs?: string[];
}

function buildEmailShell(content: string) {
  return `
    <style>
      @media only screen and (max-width: 620px) {
        .email-shell-inner {
          max-width: 100% !important;
        }

        .ticket-card__layout,
        .ticket-card__layout tbody,
        .ticket-card__layout tr {
          display: block !important;
          width: 100% !important;
        }

        .ticket-card__poster-cell,
        .ticket-card__meta-cell {
          display: block !important;
          width: 100% !important;
          box-sizing: border-box !important;
        }

        .ticket-card__poster-image {
          height: 148px !important;
        }

        .ticket-card__meta-cell {
          border-left: 0 !important;
          border-top: 2px dashed #d2c7ba !important;
          padding: 14px 14px 16px !important;
        }

        .ticket-card__qr-image {
          width: 100% !important;
          max-width: 304px !important;
          height: auto !important;
        }
      }
    </style>
    <table class="email-shell" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b1117;border-collapse:collapse;font-family:Arial,sans-serif;line-height:1.6;color:#dce5ec">
      <tr>
        <td align="center" style="padding:24px 12px">
          <table class="email-shell-inner" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;border-collapse:collapse">
            <tr>
              <td>
                ${content}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
}

function renderTicketCard(props: Parameters<typeof EventTicketEmailCard>[0]) {
  return EventTicketEmailCard(props);
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
  const introLine = input.introLine ?? "Hit the track for free. Dubai Police has you covered!";
  const detailParagraphs =
    input.detailParagraphs ?? [
      "Join us at Dubai Autodrome for the region's premier community fitness night! In a shared commitment to community health, wellness, and safety, we are thrilled to announce Train With Dubai Police.",
      "The best part? Dubai Police has your entry completely covered, making it 100% free for all participants. Join us on our Circuit under the lights for an unforgettable, high-energy evening of cycling, running, and specialized bootcamps.",
      "Registration is required, so secure your free spot today and let's hit the track!"
    ];
  const ticketCardHtml = renderTicketCard({
    event: {
      title: input.eventTitle,
      venue: input.venue,
      start_at: input.eventStartAt,
      end_at: input.eventEndAt,
      timezone: input.eventTimezone
    },
    attendee: {
      fullName: input.fullName,
      admissionLabel: input.ticketTitle,
      manualCheckinCode: input.manualCheckinCode
    },
    posterImageUrl: input.posterImageUrl,
    qrImageSrc: input.qrImageSrc,
    qrLinkHref: input.qrLinkHref,
    mapLink: input.mapLink
  });

  const html = buildEmailShell(`
    <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.26em;text-transform:uppercase;color:#8fb6a3">Registration confirmed</p>
    <h1 style="margin:0 0 14px;font-size:28px;line-height:1.1;color:#ffffff">${input.eventTitle}</h1>
    <p style="margin:0 0 12px;font-size:16px;color:#d5dde5">${introLine}</p>
    ${detailParagraphs.map((paragraph) => `<p style="margin:0 0 14px;color:#b7c3cf">${paragraph}</p>`).join("")}
    <p style="margin:20px 0 16px;color:#dce5ec"><strong>${input.bookedBy ? "Attendee" : "Primary registrant"}:</strong> ${input.fullName}${input.bookedBy ? ` <span style="color:#9fb0be">(booked by ${input.bookedBy})</span>` : ""}</p>
    <p style="margin:0 0 16px;color:#9fb0be"><strong>Date and time:</strong> ${schedule}</p>
    ${ticketCardHtml}
    <p style="margin:18px 0 0;color:#b7c3cf">Present this QR code at check-in. If scanning fails, staff can also use the 4-character manual code shown below the QR.</p>
    <p style="margin:18px 0 0;color:#b7c3cf">Support: ${env.MAIL_REPLY_TO_EMAIL}</p>
  `);

  const text = [
    `Hello ${input.fullName},`,
    "",
    `Your registration is confirmed for ${input.eventTitle}.`,
    input.bookedBy ? `Booked by: ${input.bookedBy}` : "",
    `Admission: ${input.ticketTitle}`,
    `Manual check-in code: ${input.manualCheckinCode}`,
    `Date and time: ${schedule}`,
    input.venue ? `Venue: ${input.venue}` : "",
    input.mapLink ? `View on map: ${input.mapLink}` : "",
    "Present your QR code at check-in. If scanning fails, staff can use the manual code shown on the ticket.",
    "If the QR preview does not appear in your email client, download the attached QR image and present it at check-in.",
    `Support: ${env.MAIL_REPLY_TO_EMAIL}`
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
}

export function buildGroupConfirmationEmail(input: GroupConfirmationEmailInput) {
  const subject = `Your ${input.attendees.length} tickets for ${input.eventTitle}`;
  const schedule = formatEventDateRange(input.eventStartAt, input.eventEndAt, input.eventTimezone);
  const introLine = input.introLine ?? "Hit the track for free. Dubai Police has you covered!";
  const detailParagraphs =
    input.detailParagraphs ?? [
      "Join us at Dubai Autodrome for the region's premier community fitness night! In a shared commitment to community health, wellness, and safety, we are thrilled to announce Train With Dubai Police.",
      "The best part? Dubai Police has your entry completely covered, making it 100% free for all participants. Join us on our Circuit under the lights for an unforgettable, high-energy evening of cycling, running, and specialized bootcamps.",
      "Registration is required, so secure your free spot today and let's hit the track!"
    ];

  const attendeeBlocks = input.attendees
    .map((attendee) =>
      renderTicketCard({
        event: {
          title: input.eventTitle,
          venue: input.venue,
          start_at: input.eventStartAt,
          end_at: input.eventEndAt,
          timezone: input.eventTimezone
        },
        attendee: {
          fullName: attendee.fullName,
          categoryTitle: attendee.categoryTitle,
          ticketTitle: attendee.ticketTitle,
          manualCheckinCode: attendee.manualCheckinCode
        },
        posterImageUrl: input.posterImageUrl,
        qrImageSrc: attendee.qrImageSrc,
        qrLinkHref: attendee.qrLinkHref,
        mapLink: input.mapLink
      })
    )
    .join('<div style="height:18px;line-height:18px">&nbsp;</div>');

  const html = buildEmailShell(`
    <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.26em;text-transform:uppercase;color:#8fb6a3">${input.attendees.length} tickets confirmed</p>
    <h1 style="margin:0 0 14px;font-size:28px;line-height:1.1;color:#ffffff">${input.eventTitle}</h1>
    <p style="margin:0 0 12px;font-size:16px;color:#d5dde5">${introLine}</p>
    ${detailParagraphs.map((paragraph) => `<p style="margin:0 0 14px;color:#b7c3cf">${paragraph}</p>`).join("")}
    <p style="margin:20px 0 8px;color:#dce5ec"><strong>Booked by:</strong> ${input.primaryFullName}</p>
    <p style="margin:0 0 18px;color:#9fb0be"><strong>Date and time:</strong> ${schedule}</p>
    ${attendeeBlocks}
    <p style="margin:18px 0 0;color:#b7c3cf">Present each attendee's QR code at check-in. If scanning fails, staff can also use the 4-character code shown below each QR.</p>
    <p style="margin:18px 0 0;color:#b7c3cf">Support: ${env.MAIL_REPLY_TO_EMAIL}</p>
  `);

  const attendeeTextLines = input.attendees.map((attendee, i) => {
    const ticketLabel = attendee.ticketTitle
      ? `${attendee.categoryTitle} + ${attendee.ticketTitle}`
      : attendee.categoryTitle;
    return `Attendee ${i + 1}: ${attendee.fullName} — ${ticketLabel} — Code ${attendee.manualCheckinCode}`;
  });

  const text = [
    `Hello ${input.primaryFullName},`,
    "",
    `${input.attendees.length} registrations confirmed for ${input.eventTitle}.`,
    `Date and time: ${schedule}`,
    input.venue ? `Venue: ${input.venue}` : "",
    input.mapLink ? `View on map: ${input.mapLink}` : "",
    "",
    ...attendeeTextLines,
    "",
    "Present each attendee's QR code at check-in. Each QR code is single-use.",
    "If the QR previews do not appear in your email client, download the attached QR images.",
    `Support: ${env.MAIL_REPLY_TO_EMAIL}`
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
}
