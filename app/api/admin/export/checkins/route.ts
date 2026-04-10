import { exportQuerySchema } from "@/lib/validation/admin";
import { exportCheckinsCsv } from "@/services/admin";
import { getAuthenticatedAppUser } from "@/lib/auth";

export async function GET(request: Request) {
  const user = await getAuthenticatedAppUser();

  if (!user || user.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = exportQuerySchema.safeParse({
    eventId: searchParams.get("eventId")
  });

  if (!parsed.success) {
    return new Response("Invalid event id", { status: 400 });
  }

  const csv = await exportCheckinsCsv(parsed.data.eventId);

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="checkins-${parsed.data.eventId}.csv"`
    }
  });
}
