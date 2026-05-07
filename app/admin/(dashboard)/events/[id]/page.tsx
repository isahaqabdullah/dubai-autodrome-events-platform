import { redirect } from "next/navigation";
import { appendReturnTo } from "@/lib/admin-navigation";

export default async function EventAnalyticsPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const [{ id }, { returnTo }] = await Promise.all([params, searchParams]);
  redirect(appendReturnTo(`/admin/events/${id}/edit`, returnTo));
}
