import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { formatErrorMessage, getErrorInfo } from "@/lib/errors";
import { runEmailWorker } from "@/services/email-worker";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  if (!env.CRON_SECRET) {
    // Missing secret in prod = deployment misconfiguration. Fail closed.
    return false;
  }
  const header = request.headers.get("authorization");
  return header === `Bearer ${env.CRON_SECRET}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runEmailWorker();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = formatErrorMessage(error);
    console.error("[cron/email-worker] unhandled failure", { error: getErrorInfo(error) });
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
