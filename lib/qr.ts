import "server-only";
import QRCode from "qrcode";

export const QR_EMAIL_CONTENT_ID = "registration-qr";
export const QR_EMAIL_FILENAME = "registration-qr.png";

export function buildQrPayload(token: string) {
  return token;
}

export async function generateQrPngBuffer(payload: string) {
  return QRCode.toBuffer(payload, {
    margin: 1,
    width: 360,
    type: "png",
    errorCorrectionLevel: "M"
  });
}

export function buildQrEmailCid(contentId = QR_EMAIL_CONTENT_ID) {
  return `cid:${contentId}`;
}

export async function buildQrEmailAttachment(token: string) {
  return {
    content: await generateQrPngBuffer(buildQrPayload(token)),
    filename: QR_EMAIL_FILENAME,
    contentType: "image/png",
    contentId: QR_EMAIL_CONTENT_ID
  };
}
