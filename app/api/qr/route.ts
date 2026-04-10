import { generateQrPngBuffer } from "@/lib/qr";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return new Response("Missing token", { status: 400 });
  }

  const png = await generateQrPngBuffer(token);

  return new Response(png, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, no-store"
    }
  });
}
