import { redirect } from "next/navigation";

export default function EventAnalyticsPage({
  params
}: {
  params: { id: string };
}) {
  redirect(`/admin/registrations?eventId=${params.id}`);
}
