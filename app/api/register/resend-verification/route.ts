import { NextResponse } from "next/server";

export const maxDuration = 30;

export async function POST(request: Request) {
  await request.text().catch(() => null);
  return NextResponse.json(
    {
      outcome: "checkout_required",
      message: "This registration endpoint is closed for new attempts. Use the checkout flow instead."
    },
    { status: 410 }
  );
}
