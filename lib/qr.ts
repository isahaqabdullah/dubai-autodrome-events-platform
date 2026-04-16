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

export async function buildQrEmailAttachment(token: string, index = 0) {
  const contentId = index === 0 ? QR_EMAIL_CONTENT_ID : `${QR_EMAIL_CONTENT_ID}-${index}`;
  const filename = index === 0 ? QR_EMAIL_FILENAME : `registration-qr-${index}.png`;

  return {
    content: await generateQrPngBuffer(buildQrPayload(token)),
    filename,
    contentType: "image/png",
    contentId
  };
}
