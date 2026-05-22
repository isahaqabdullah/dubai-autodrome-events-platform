import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { EventForm } from "@/components/admin/event-form";
import type { EventFormResult } from "@/components/admin/event-form";
import { getAdminBackLabel, normalizeAdminReturnTo } from "@/lib/admin-navigation";
import { StatusPill } from "@/components/ui/status-pill";
import { requireAuthenticatedUser } from "@/lib/auth";
import { parseAdminEventFormData } from "@/lib/form-data";
import { formatEventDateRange, getRegistrationWindowState } from "@/lib/utils";
import { listEventFormTemplates, updateEvent } from "@/services/admin";
import { getEventById, listEventGroups } from "@/services/events";
import {
  deleteEventFormTemplateAction,
  importLocalEventFormTemplatesAction,
  saveEventFormTemplateAction
} from "../../template-actions";

export default async function EditEventPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const [{ id }, { returnTo }] = await Promise.all([params, searchParams]);
  const [event, eventGroups, initialTemplates] = await Promise.all([
    getEventById(id),
    listEventGroups({ includeInactive: true }),
    listEventFormTemplates()
  ]);

  if (!event) {
    notFound();
  }

  const currentEvent = event;
  const backHref = normalizeAdminReturnTo(returnTo, "/admin");
  const backLabel = getAdminBackLabel(backHref);
  const backCrumbLabel =
    backLabel === "Back to registrations"
      ? "Registrations"
      : backLabel === "Back to payments"
        ? "Payments"
      : backLabel === "Back to events"
        ? "Events"
        : backLabel === "Back to check-in"
          ? "Check-in"
          : "Admin";

  const registrationState = getRegistrationWindowState(currentEvent);

  async function updateEventAction(formData: FormData): Promise<EventFormResult> {
    "use server";

    const actor = await requireAuthenticatedUser("admin");

    try {
      const input = parseAdminEventFormData(formData);
      const updatedEvent = await updateEvent(input, actor);
      const currentGroup = eventGroups.find((item) => item.id === currentEvent.event_group_id);
      const nextGroup = eventGroups.find((item) => item.id === updatedEvent.event_group_id);
      revalidatePath("/admin");
      revalidatePath("/admin/registrations");
      revalidatePath(`/admin/events/${id}/edit`);
      revalidatePath("/events");
      revalidatePath(`/events/${currentEvent.slug}`);
      revalidatePath(`/events/${updatedEvent.slug}`);
      if (currentGroup) {
        revalidatePath(`/events/${currentGroup.slug}`);
        revalidatePath(`/events/${currentGroup.slug}/${currentEvent.slug}`);
      }
      if (nextGroup) {
        revalidatePath(`/events/${nextGroup.slug}`);
        revalidatePath(`/events/${nextGroup.slug}/${updatedEvent.slug}`);
      }
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
            {backHref !== "/admin" ? (
              <>
                <span className="text-slate/50">/</span>
                <a href={backHref} className="font-medium text-slate transition hover:text-ink">
                  {backCrumbLabel}
                </a>
              </>
            ) : null}
            <span className="text-slate/50">/</span>
            <span className="font-medium text-slate">Edit</span>
          </div>

          <div className="flex flex-col gap-3 sm:gap-4">
            <a href={backHref} className="admin-back-link self-start">
              <ArrowLeft className="h-4 w-4" />
              {backLabel}
            </a>

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
          </div>
        </div>
      </section>

      <section className="admin-card p-3 sm:p-6">
        <EventForm
          event={currentEvent}
          eventGroups={eventGroups}
          initialTemplates={initialTemplates}
          action={updateEventAction}
          saveTemplateAction={saveEventFormTemplateAction}
          deleteTemplateAction={deleteEventFormTemplateAction}
          importLocalTemplatesAction={importLocalEventFormTemplatesAction}
          hideRegistrationSections
          cancelHref={backHref}
          successHref={backHref}
        />
      </section>
    </main>
  );
}
