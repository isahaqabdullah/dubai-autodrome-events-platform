import { redirect } from "next/navigation";
import { appendReturnTo } from "@/lib/admin-navigation";

export default function EventAnalyticsPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams: { returnTo?: string };
}) {
  redirect(appendReturnTo(`/admin/events/${params.id}/edit`, searchParams.returnTo));
}
