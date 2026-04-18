import { buildTicketPresentation, type TicketEventLike, type TicketPresentationAttendee } from "@/lib/ticket-presentation";

interface EventTicketEmailCardProps {
  event: TicketEventLike;
  attendee: TicketPresentationAttendee;
  posterImageUrl: string;
  qrImageSrc: string;
  qrLinkHref?: string | null;
  mapLink?: string | null;
}

type InlineStyle = Record<string, number | string>;

const fonts = {
  sans: "'Open Sans', Arial, sans-serif",
  title: "'Arial Black', 'Gotham Ultra', Arial, sans-serif"
};

function styleAttr(style: InlineStyle) {
  return Object.entries(style)
    .map(([key, value]) => `${key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}:${value}`)
    .join(";");
}

const wrapperStyle = styleAttr({
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  border: "1px solid #1b2a36",
  borderRadius: "20px",
  overflow: "hidden",
  backgroundColor: "#0b1117"
});

const smallLabelStyle = styleAttr({
  margin: 0,
  fontSize: "10px",
  lineHeight: "14px",
  fontWeight: 700,
  letterSpacing: "0.24em",
  textTransform: "uppercase",
  color: "#ffffff",
  fontFamily: fonts.sans
});

const metaLabelStyle = styleAttr({
  margin: 0,
  fontSize: "10px",
  lineHeight: "14px",
  fontWeight: 700,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: "#697e90",
  fontFamily: fonts.sans
});

const metaValueStyle = styleAttr({
  margin: "3px 0 0",
  fontSize: "12px",
  lineHeight: "16px",
  fontWeight: 700,
  color: "#0c1723",
  fontFamily: fonts.sans
});

export function EventTicketEmailCard({
  event,
  attendee,
  posterImageUrl,
  qrImageSrc,
  qrLinkHref,
  mapLink
}: EventTicketEmailCardProps) {
  const presentation = buildTicketPresentation(event, attendee);
  const rightRailRows = [
    { label: "Attendee", value: presentation.attendeeName },
    { label: "Admission", value: presentation.admissionLabel },
    { label: "Date", value: presentation.dateLabel },
    { label: "Time", value: presentation.timeRange },
    {
      label: "Venue",
      value: `${presentation.venueShort}${presentation.venueSecondary ? `, ${presentation.venueSecondary}` : ""}`
    },
    { label: "Category", value: presentation.categoryLabel },
    ...(presentation.addOnLabel ? [{ label: "Add-on", value: presentation.addOnLabel }] : [])
  ];

  function buildQrImageHtml(size: number, className: string) {
    const qrImage = `
      <img
        src="${qrImageSrc}"
        alt="QR code for ${presentation.attendeeName}"
        width="${size}"
        class="${className}"
        style="${styleAttr({ display: "block", width: "100%", maxWidth: `${size}px`, height: "auto", margin: "0 auto", border: 0 })}"
      />
    `;

    return qrLinkHref
      ? `
        <a href="${qrLinkHref}" target="_blank" style="${styleAttr({ display: "block", textDecoration: "none" })}">
          ${qrImage}
        </a>
      `
      : qrImage;
  }

  const qrImageHtml = buildQrImageHtml(304, "ticket-card__qr-image");
  const manualCheckinCode = attendee.manualCheckinCode?.trim().toUpperCase() || null;

  return `
    <table class="ticket-card" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${wrapperStyle}">
      <tr>
        <td style="${styleAttr({ backgroundColor: "#0b1117" })}">
          <table class="ticket-card__layout" role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td
                width="62%"
                valign="top"
                class="ticket-card__poster-cell"
                style="${styleAttr({
                  padding: 0,
                  backgroundColor: "#0d171e",
                  backgroundImage:
                    "linear-gradient(135deg, rgba(255,255,255,0.03), rgba(255,255,255,0)), radial-gradient(circle at top right, rgba(36,140,119,0.18), transparent 34%)"
                })}"
              >
                <img
                  src="${posterImageUrl}"
                  alt="${presentation.title}"
                  width="422"
                  class="ticket-card__poster-image"
                  style="${styleAttr({
                    display: "block",
                    width: "100%",
                    height: "126px",
                    objectFit: "cover",
                    objectPosition: "center",
                    border: 0
                  })}"
                />
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${styleAttr({ padding: "14px 16px 16px" })}">
                  <tr>
                    <td>
                      <p style="${smallLabelStyle}">Scan At Check-In</p>
                      <h2
                        style="${styleAttr({
                          margin: "7px 0 0",
                          fontSize: "20px",
                          lineHeight: "21px",
                          fontWeight: 900,
                          fontStyle: "italic",
                          color: "#ffffff",
                          fontFamily: fonts.title
                        })}"
                      >
                        ${presentation.title}
                      </h2>
                    </td>
                  </tr>
                  <tr>
                    <td style="${styleAttr({ paddingTop: "12px", borderTop: "1px solid rgba(255,255,255,0.12)" })}">
                      <table
                        role="presentation"
                        width="100%"
                        cellpadding="0"
                        cellspacing="0"
                        style="${styleAttr({
                          borderCollapse: "separate",
                          borderSpacing: 0,
                          backgroundColor: "#fffdfa",
                          border: "1px solid rgba(216,206,194,0.88)",
                          borderRadius: "18px"
                        })}"
                      >
                        <tr>
                          <td align="center" style="${styleAttr({ padding: "14px 14px 12px" })}">
                            ${qrImageHtml}
                            <p style="${styleAttr({ margin: "10px 0 0", fontSize: "11px", lineHeight: "16px", textAlign: "center", color: "#516576", fontFamily: fonts.sans })}">
                              Present this QR for the fastest entry.
                            </p>
                            ${manualCheckinCode ? `
                              <p style="${styleAttr({ margin: "10px 0 0", fontSize: "9px", lineHeight: "13px", fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", textAlign: "center", color: "#697e90", fontFamily: fonts.sans })}">
                                Manual code
                              </p>
                              <p style="${styleAttr({ margin: "4px 0 0", fontSize: "24px", lineHeight: "24px", fontWeight: 800, letterSpacing: "0.24em", textAlign: "center", color: "#0c1723", fontFamily: fonts.sans })}">
                                ${manualCheckinCode}
                              </p>
                            ` : ""}
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
              <td
                width="38%"
                valign="top"
                class="ticket-card__meta-cell"
                style="${styleAttr({
                  padding: "12px 12px 10px",
                  backgroundColor: "#f4ede4",
                  borderLeft: "2px dashed #d2c7ba"
                })}"
              >
                <p style="${metaLabelStyle};color:#516576;font-size:9px;line-height:13px">Ticket #${presentation.ticketReference}</p>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${styleAttr({ marginTop: "10px" })}">
                  ${rightRailRows.map((row) => `
                    <tr>
                      <td style="${styleAttr({ paddingBottom: "8px" })}">
                        <p style="${metaLabelStyle};font-size:9px;line-height:13px">${row.label}</p>
                        <p style="${metaValueStyle}">${row.value}</p>
                      </td>
                    </tr>
                  `).join("")}
                  ${mapLink ? `
                    <tr>
                      <td style="${styleAttr({ paddingTop: "2px" })}">
                        <a
                          href="${mapLink}"
                          target="_blank"
                          style="${styleAttr({
                            display: "inline-block",
                            color: "#0c1723",
                            fontSize: "12px",
                            lineHeight: "16px",
                            fontWeight: 700,
                            textDecoration: "none",
                            fontFamily: fonts.sans
                          })}"
                        >
                          View venue map
                        </a>
                      </td>
                    </tr>
                  ` : ""}
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
}
