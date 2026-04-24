import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { runPaymentReconcile } from "@/services/payment-worker";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request: Request) {
  return Boolean(env.CRON_SECRET) && request.headers.get("authorization") === `Bearer ${env.CRON_SECRET}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const result = await runPaymentReconcile();
  return NextResponse.json({ ok: true, ...result });
}

export async function POST(request: Request) {
  return GET(request);
}
