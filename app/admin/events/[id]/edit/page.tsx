import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { EventForm } from "@/components/admin/event-form";
import { StatusPill } from "@/components/ui/status-pill";
import { requireAuthenticatedUser } from "@/lib/auth";
import { parseAdminEventFormData } from "@/lib/form-data";
import { formatEventDateRange, getRegistrationWindowState } from "@/lib/utils";
import { updateEvent } from "@/services/admin";
import { getEventById } from "@/services/events";

export default async function EditEventPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams: { error?: string; saved?: string; created?: string };
}) {
  const event = await getEventById(params.id);

  if (!event) {
    notFound();
  }

  const registrationState = getRegistrationWindowState(event);

  async function updateEventAction(formData: FormData) {
    "use server";

    const actor = await requireAuthenticatedUser("admin");

    try {
      const input = parseAdminEventFormData(formData);
      await updateEvent(input, actor);
      revalidatePath("/admin");
      redirect(`/admin/events/${params.id}/edit?saved=1`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update the event.";
      redirect(`/admin/events/${params.id}/edit?error=${encodeURIComponent(message)}`);
    }
  }

  return (
    <main className="space-y-5 sm:space-y-6">
      <section className="card-panel overflow-hidden p-5 sm:p-6 lg:p-7">
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-r from-gold/20 via-white/0 to-aurora/35" />
        <div className="relative space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/admin" className="text-sm font-medium text-slate transition hover:text-ink">
              Admin
            </Link>
            <span className="text-slate/50">/</span>
            <Link href={`/admin/events/${event.id}`} className="text-sm font-medium text-slate transition hover:text-ink">
              Analytics
            </Link>
            <span className="text-slate/50">/</span>
            <span className="text-sm font-medium text-slate">Edit</span>
          </div>

          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill
                  tone={
                    event.status === "live"
                      ? "success"
                      : event.status === "draft" || event.status === "archived"
                        ? "warning"
                        : "neutral"
                  }
                >
                  {event.status}
                </StatusPill>
                <StatusPill
                  tone={
                    registrationState.state === "open"
                      ? "success"
                      : registrationState.state === "not_open_yet"
                        ? "warning"
                        : "danger"
                  }
                >
                  {registrationState.label}
                </StatusPill>
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{event.title}</h1>
              <p className="mt-3 text-sm text-slate sm:text-base">
                {formatEventDateRange(event.start_at, event.end_at, event.timezone)}
              </p>
            </div>

            <Link
              href={`/admin/events/${event.id}`}
              className="inline-flex items-center justify-center rounded-2xl border border-slate/15 bg-white/80 px-4 py-3 text-sm font-semibold text-ink transition hover:border-slate/30 hover:bg-mist/70"
            >
              Back to analytics
            </Link>
          </div>

          {searchParams.saved || searchParams.created ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-100 px-4 py-3 text-sm text-emerald-900">
              Event saved successfully.
            </div>
          ) : null}
          {searchParams.error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-100 px-4 py-3 text-sm text-rose-900">
              {searchParams.error}
            </div>
          ) : null}
        </div>
      </section>

      <section className="card-panel p-5 sm:p-6">
        <div className="mb-5">
          <p className="section-title">Edit event</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Update event settings</h2>
        </div>
        <EventForm event={event} action={updateEventAction} />
      </section>
    </main>
  );
}
