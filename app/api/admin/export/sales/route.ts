import { salesReportQuerySchema } from "@/lib/validation/admin";
import { exportDailySalesCsv } from "@/services/admin";
import { getAuthenticatedAppUser } from "@/lib/auth";

export async function GET(request: Request) {
  const user = await getAuthenticatedAppUser();

  if (!user || user.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = salesReportQuerySchema.safeParse({
    date: searchParams.get("date"),
    eventId: searchParams.get("eventId") || undefined
  });

  if (!parsed.success) {
    return new Response("Invalid sales report query", { status: 400 });
  }

  const csv = await exportDailySalesCsv(parsed.data);
  const eventSuffix = parsed.data.eventId ? `-${parsed.data.eventId}` : "";

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sales-report-${parsed.data.date}${eventSuffix}.csv"`
    }
  });
}
