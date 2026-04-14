import Link from "next/link";
import { revalidatePath } from "next/cache";
import { EventForm } from "@/components/admin/event-form";
import type { EventFormResult } from "@/components/admin/event-form";
import { requireAuthenticatedUser } from "@/lib/auth";
import { parseAdminEventFormData } from "@/lib/form-data";
import { createEvent } from "@/services/admin";

export default function NewEventPage() {
  async function createEventAction(formData: FormData): Promise<EventFormResult> {
    "use server";

    const actor = await requireAuthenticatedUser("admin");

    try {
      const input = parseAdminEventFormData(formData);
      await createEvent(input, actor);
      revalidatePath("/admin");
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create the event.";
      return { ok: false, error: message };
    }
  }

  return (
    <main className="admin-page">
      <section className="admin-card p-5 sm:p-6">
        <div className="mb-6 border-b border-slate/10 pb-5">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Link href="/admin" className="text-sm font-medium text-slate transition hover:text-ink">
              Admin
            </Link>
            <span className="text-slate/50">/</span>
            <span className="text-sm font-medium text-slate">New event</span>
          </div>
          <p className="admin-label">Create event</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">New event</h1>
        </div>
        <EventForm action={createEventAction} />
      </section>
    </main>
  );
}
