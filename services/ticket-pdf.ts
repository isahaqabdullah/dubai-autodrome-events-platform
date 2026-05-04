import "server-only";
import QRCode from "qrcode";
import { buildTicketAdmissionLabel, formatTicketDateTimeLine } from "@/lib/ticket-presentation";
import type { TicketWalletData } from "@/services/tickets";

type PdfObject = {
  id: number;
  body: string | Buffer;
};

function escapePdfText(input: string) {
  return input.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function fitText(input: string, max = 72) {
  const trimmed = input.trim();
  return trimmed.length > max ? `${trimmed.slice(0, Math.max(0, max - 3))}...` : trimmed;
}

function text(x: number, y: number, size: number, value: string, font = "F1") {
  return `BT /${font} ${size} Tf ${x} ${y} Td (${escapePdfText(value)}) Tj ET\n`;
}

function rect(x: number, y: number, w: number, h: number, color: string) {
  return `${color} ${x} ${y} ${w} ${h} re f\n`;
}

function strokeRect(x: number, y: number, w: number, h: number, color: string, width = 1) {
  return `${color} ${width} w ${x} ${y} ${w} ${h} re S\n`;
}

function qrVector(token: string, x: number, y: number, size: number) {
  const qr = QRCode.create(token, { errorCorrectionLevel: "M" });
  const moduleSize = size / qr.modules.size;
  const commands: string[] = [`0 0 0 rg\n`];

  for (let row = 0; row < qr.modules.size; row += 1) {
    for (let col = 0; col < qr.modules.size; col += 1) {
      if (qr.modules.get(row, col)) {
        const rx = x + col * moduleSize;
        const ry = y + (qr.modules.size - row - 1) * moduleSize;
        commands.push(`${rx.toFixed(3)} ${ry.toFixed(3)} ${moduleSize.toFixed(3)} ${moduleSize.toFixed(3)} re f\n`);
      }
    }
  }

  return commands.join("");
}

function pageContent(wallet: TicketWalletData, attendeeIndex: number) {
  const attendee = wallet.attendees[attendeeIndex];
  const event = wallet.event;
  const ticketLabel = buildTicketAdmissionLabel(attendee);
  const dateLine = formatTicketDateTimeLine(event);
  const manualCode = attendee.manualCheckinCode?.trim().toUpperCase() || "";
  const pageNo = attendeeIndex + 1;
  const total = wallet.attendees.length;
  const qrSize = 220;
  const qrX = 196;
  const qrY = 215;

  return [
    rect(0, 0, 612, 792, "0.956 0.965 0.973 rg"),
    rect(46, 46, 520, 700, "1 1 1 rg"),
    strokeRect(46, 46, 520, 700, "0.82 0.84 0.86 RG", 1),
    rect(46, 626, 520, 120, "0.047 0.086 0.125 rg"),
    text(76, 704, 12, "EVENT ACCESS PASS", "F2"),
    text(76, 672, 26, fitText(event.title, 40), "F2"),
    text(76, 642, 11, fitText(`${pageNo} of ${total} tickets`, 48), "F1"),
    text(76, 582, 10, "ATTENDEE", "F2"),
    text(76, 558, 21, fitText(attendee.fullName, 42), "F2"),
    text(76, 520, 10, "ADMISSION", "F2"),
    text(76, 498, 14, fitText(ticketLabel, 62), "F1"),
    text(76, 462, 10, "DATE AND TIME", "F2"),
    text(76, 440, 13, fitText(dateLine, 70), "F1"),
    text(76, 404, 10, "VENUE", "F2"),
    text(76, 382, 13, fitText(event.venue ?? "Venue to be announced", 70), "F1"),
    rect(qrX - 15, qrY - 15, qrSize + 30, qrSize + 30, "1 0.992 0.972 rg"),
    strokeRect(qrX - 15, qrY - 15, qrSize + 30, qrSize + 30, "0.82 0.78 0.72 RG", 1),
    qrVector(attendee.qrToken, qrX, qrY, qrSize),
    text(232, 180, 11, "SCAN AT CHECK-IN", "F2"),
    text(224, 144, 10, "MANUAL CODE", "F2"),
    text(242, 112, 28, manualCode, "F2"),
    text(76, 78, 10, "If scanning fails, staff can use the manual code shown above.", "F1")
  ].join("");
}

export function generateTicketPdf(wallet: TicketWalletData) {
  const objects: PdfObject[] = [];
  let nextId = 1;
  const newId = () => nextId++;

  const catalogId = newId();
  const pagesId = newId();
  const fontRegularId = newId();
  const fontBoldId = newId();
  const pageIds: number[] = [];
  const contentIds: number[] = [];

  for (let i = 0; i < wallet.attendees.length; i += 1) {
    pageIds.push(newId());
    contentIds.push(newId());
  }

  objects.push({ id: catalogId, body: `<< /Type /Catalog /Pages ${pagesId} 0 R >>` });
  objects.push({
    id: pagesId,
    body: `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`
  });
  objects.push({ id: fontRegularId, body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>" });
  objects.push({ id: fontBoldId, body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>" });

  for (let i = 0; i < wallet.attendees.length; i += 1) {
    const content = Buffer.from(pageContent(wallet, i), "utf8");
    objects.push({
      id: pageIds[i],
      body: `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentIds[i]} 0 R >>`
    });
    objects.push({
      id: contentIds[i],
      body: Buffer.concat([
        Buffer.from(`<< /Length ${content.length} >>\nstream\n`, "utf8"),
        content,
        Buffer.from("endstream", "utf8")
      ])
    });
  }

  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n", "utf8")];
  const offsets: number[] = [0];

  for (const object of objects.sort((a, b) => a.id - b.id)) {
    offsets[object.id] = Buffer.concat(chunks).length;
    chunks.push(Buffer.from(`${object.id} 0 obj\n`, "utf8"));
    chunks.push(Buffer.isBuffer(object.body) ? object.body : Buffer.from(object.body, "utf8"));
    chunks.push(Buffer.from("\nendobj\n", "utf8"));
  }

  const body = Buffer.concat(chunks);
  const xrefOffset = body.length;
  const xrefRows = ["0000000000 65535 f "];
  for (let id = 1; id < nextId; id += 1) {
    xrefRows.push(`${String(offsets[id]).padStart(10, "0")} 00000 n `);
  }

  const trailer = [
    `xref`,
    `0 ${nextId}`,
    ...xrefRows,
    `trailer << /Size ${nextId} /Root ${catalogId} 0 R >>`,
    `startxref`,
    String(xrefOffset),
    `%%EOF`
  ].join("\n");

  return Buffer.concat([body, Buffer.from(trailer, "utf8")]);
}
