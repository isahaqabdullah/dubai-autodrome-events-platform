import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { EventForm } from "@/components/admin/event-form";
import { requireAuthenticatedUser } from "@/lib/auth";
import { parseAdminEventFormData } from "@/lib/form-data";
import { createEvent } from "@/services/admin";

export default function NewEventPage({
  searchParams
}: {
  searchParams: { error?: string };
}) {
  async function createEventAction(formData: FormData) {
    "use server";

    const actor = await requireAuthenticatedUser("admin");

    try {
      const input = parseAdminEventFormData(formData);
      const event = await createEvent(input, actor);
      revalidatePath("/admin");
      redirect(`/admin/events/${event.id}/edit?created=1`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create the event.";
      redirect(`/admin/events/new?error=${encodeURIComponent(message)}`);
    }
  }

  return (
    <main className="space-y-5 sm:space-y-6">
      <section className="card-panel overflow-hidden p-5 sm:p-6 lg:p-7">
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-r from-gold/20 via-white/0 to-aurora/35" />
        <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_320px]">
          <div>
            <p className="section-title">Create event</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">New event</h2>
            {searchParams.error ? (
              <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-100 px-4 py-3 text-sm text-rose-900">
                {searchParams.error}
              </div>
            ) : null}
          </div>

          <div className="grid gap-3">
            <div className="rounded-[24px] border border-slate/10 bg-white/80 p-4">
              <p className="section-title">Step 1</p>
              <p className="mt-2 text-lg font-semibold tracking-tight text-ink">Basics</p>
            </div>
            <div className="rounded-[24px] border border-slate/10 bg-white/80 p-4">
              <p className="section-title">Step 2</p>
              <p className="mt-2 text-lg font-semibold tracking-tight text-ink">Schedule</p>
            </div>
            <div className="rounded-[24px] border border-slate/10 bg-white/80 p-4">
              <p className="section-title">Step 3</p>
              <p className="mt-2 text-lg font-semibold tracking-tight text-ink">Registration</p>
            </div>
          </div>
        </div>
      </section>

      <section className="card-panel p-5 sm:p-6">
        <EventForm action={createEventAction} />
      </section>
    </main>
  );
}
