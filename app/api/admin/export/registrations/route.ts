import { exportQuerySchema } from "@/lib/validation/admin";
import { exportRegistrationsXlsx } from "@/services/admin";
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

  const buffer = await exportRegistrationsXlsx(parsed.data.eventId);

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="registrations-${parsed.data.eventId}.xlsx"`
    }
  });
}
