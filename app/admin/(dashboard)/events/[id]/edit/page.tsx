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

  const currentEvent = event;

  const registrationState = getRegistrationWindowState(currentEvent);

  async function updateEventAction(formData: FormData): Promise<EventFormResult> {
    "use server";

    const actor = await requireAuthenticatedUser("admin");

    try {
      const input = parseAdminEventFormData(formData);
      const updatedEvent = await updateEvent(input, actor);
      revalidatePath("/admin");
      revalidatePath("/admin/registrations");
      revalidatePath(`/admin/events/${params.id}/edit`);
      revalidatePath("/events");
      revalidatePath(`/events/${currentEvent.slug}`);
      revalidatePath(`/events/${updatedEvent.slug}`);
      revalidatePath(`/check-in/${currentEvent.slug}`);
      revalidatePath(`/check-in/${updatedEvent.slug}`);
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update the event.";
      return { ok: false, error: message };
    }
  }

  return (
    <main className="admin-page">
      <section className="admin-card p-3 sm:p-6 lg:p-7">
        <div className="space-y-3 sm:space-y-5">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] sm:gap-2 sm:text-sm">
            <Link href="/admin" className="font-medium text-slate transition hover:text-ink">
              Admin
            </Link>
            <span className="text-slate/50">/</span>
            <Link
              href={`/admin/registrations?eventId=${currentEvent.id}`}
              className="font-medium text-slate transition hover:text-ink"
            >
              Registrations
            </Link>
            <span className="text-slate/50">/</span>
            <span className="font-medium text-slate">Edit</span>
          </div>

          <div className="flex flex-col gap-3 sm:gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
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
              <h1 className="mt-2 text-xl font-semibold tracking-tight text-ink sm:mt-3 sm:text-4xl">{currentEvent.title}</h1>
              <p className="mt-1.5 text-xs text-slate sm:mt-3 sm:text-base">
                {formatEventDateRange(currentEvent.start_at, currentEvent.end_at, currentEvent.timezone)}
              </p>
            </div>

            <Link
              href={`/admin/registrations?eventId=${currentEvent.id}`}
              className="admin-action"
            >
              Back to registrations
            </Link>
          </div>
        </div>
      </section>

      <section className="admin-card p-3 sm:p-6">
        <EventForm event={currentEvent} action={updateEventAction} hideRegistrationSections />
      </section>
    </main>
  );
}
