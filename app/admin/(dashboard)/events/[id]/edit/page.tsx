import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { EventForm } from "@/components/admin/event-form";
import type { EventFormResult } from "@/components/admin/event-form";
import { StatusPill } from "@/components/ui/status-pill";
import { requireAuthenticatedUser } from "@/lib/auth";
import { parseAdminEventFormData } from "@/lib/form-data";
import { formatEventDateRange, getRegistrationWindowState } from "@/lib/utils";
import { updateEvent } from "@/services/admin";
import { getEventById } from "@/services/events";

export default async function EditEventPage({
  params
}: {
  params: { id: string };
}) {
  const event = await getEventById(params.id);

  if (!event) {
    notFound();
  }

  const registrationState = getRegistrationWindowState(event);

  async function updateEventAction(formData: FormData): Promise<EventFormResult> {
    "use server";

    const actor = await requireAuthenticatedUser("admin");

    try {
      const input = parseAdminEventFormData(formData);
      await updateEvent(input, actor);
      revalidatePath("/admin");
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update the event.";
      return { ok: false, error: message };
    }
  }

  return (
    <main className="admin-page">
      <section className="admin-card p-5 sm:p-6 lg:p-7">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/admin" className="text-sm font-medium text-slate transition hover:text-ink">
              Admin
            </Link>
            <span className="text-slate/50">/</span>
            <Link
              href={`/admin/registrations?eventId=${event.id}`}
              className="text-sm font-medium text-slate transition hover:text-ink"
            >
              Registrations &amp; Analytics
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
              href={`/admin/registrations?eventId=${event.id}`}
              className="admin-action"
            >
              Back to registrations &amp; analytics
            </Link>
          </div>
        </div>
      </section>

      <section className="admin-card p-5 sm:p-6">
        <EventForm event={event} action={updateEventAction} hideRegistrationSections />
      </section>
    </main>
  );
}
