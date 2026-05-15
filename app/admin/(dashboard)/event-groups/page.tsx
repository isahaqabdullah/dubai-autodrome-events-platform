import { revalidatePath } from "next/cache";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { requireAuthenticatedUser } from "@/lib/auth";
import { parseAdminEventGroupFormData } from "@/lib/form-data";
import { createEventGroup, updateEventGroup } from "@/services/admin";
import { listAdminEvents, listEventGroups } from "@/services/events";

export const dynamic = "force-dynamic";

function revalidateEventGroupViews() {
  revalidatePath("/admin");
  revalidatePath("/admin/event-groups");
  revalidatePath("/admin/events/new");
  revalidatePath("/events");
}

async function createEventGroupAction(formData: FormData) {
  "use server";

  const actor = await requireAuthenticatedUser("admin");
  const input = parseAdminEventGroupFormData(formData);
  await createEventGroup(input, actor);
  revalidateEventGroupViews();
}

async function updateEventGroupAction(formData: FormData) {
  "use server";

  const actor = await requireAuthenticatedUser("admin");
  const input = parseAdminEventGroupFormData(formData);
  await updateEventGroup(input, actor);
  revalidateEventGroupViews();
}

export default async function EventGroupsPage() {
  const [eventGroups, events] = await Promise.all([
    listEventGroups({ includeInactive: true }),
    listAdminEvents()
  ]);
  const eventCounts = new Map<string, number>();

  for (const event of events) {
    eventCounts.set(event.event_group_id, (eventCounts.get(event.event_group_id) ?? 0) + 1);
  }

  return (
    <main className="admin-page">
      <section className="admin-card p-4 sm:p-6">
        <p className="admin-label">Event groups</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Organize upcoming events
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate">
          Groups appear as headings on the public upcoming events page. Every event must be assigned to one group.
        </p>
      </section>

      <section className="admin-card p-4 sm:p-6">
        <div className="mb-4">
          <p className="admin-label">Create group</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-ink">New public grouping</h2>
        </div>

        <form action={createEventGroupAction} className="grid gap-4">
          <input type="hidden" name="active" value="true" />
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_260px_120px]">
            <Field label="Name">
              <Input
                name="name"
                required
                placeholder="Track Experiences"
                className="rounded-2xl border-slate/20 bg-white px-3.5 py-3"
              />
            </Field>
            <Field label="Slug" hint="Used internally for stable grouping">
              <Input
                name="slug"
                required
                placeholder="track-experiences"
                className="rounded-2xl border-slate/20 bg-white px-3.5 py-3"
              />
            </Field>
            <Field label="Order">
              <Input
                name="sortOrder"
                type="number"
                min={0}
                defaultValue={eventGroups.length}
                className="rounded-2xl border-slate/20 bg-white px-3.5 py-3"
              />
            </Field>
          </div>

          <Field label="Description" hint="Optional">
            <Textarea
              name="description"
              placeholder="Short public description shown above this group of events."
              className="min-h-[90px] rounded-2xl border-slate/20 bg-white px-3.5 py-3"
            />
          </Field>

          <div>
            <Button type="submit" className="rounded-2xl">
              Create group
            </Button>
          </div>
        </form>
      </section>

      <section className="grid gap-3 sm:gap-4">
        <div>
          <p className="admin-label">Existing groups</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-ink">Assign these from event create/edit</h2>
        </div>

        {eventGroups.length === 0 ? (
          <div className="admin-card px-4 py-8 text-center text-sm text-slate">
            No groups have been created yet.
          </div>
        ) : null}

        {eventGroups.map((group) => (
          <form key={group.id} action={updateEventGroupAction} className="admin-card grid gap-4 p-4 sm:p-5">
            <input type="hidden" name="id" value={group.id} />
            <input type="hidden" name="active" value="true" />

            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="admin-label">/{group.slug}</p>
                <h3 className="mt-1 text-base font-semibold tracking-tight text-ink">{group.name}</h3>
              </div>
              <span className="rounded-full border border-slate/15 bg-white/80 px-3 py-1 text-xs font-medium text-slate">
                {eventCounts.get(group.id) ?? 0} event{eventCounts.get(group.id) === 1 ? "" : "s"}
              </span>
            </div>

            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_260px_120px]">
              <Field label="Name">
                <Input
                  name="name"
                  required
                  defaultValue={group.name}
                  className="rounded-2xl border-slate/20 bg-white px-3.5 py-3"
                />
              </Field>
              <Field label="Slug">
                <Input
                  name="slug"
                  required
                  defaultValue={group.slug}
                  className="rounded-2xl border-slate/20 bg-white px-3.5 py-3"
                />
              </Field>
              <Field label="Order">
                <Input
                  name="sortOrder"
                  type="number"
                  min={0}
                  defaultValue={group.sort_order}
                  className="rounded-2xl border-slate/20 bg-white px-3.5 py-3"
                />
              </Field>
            </div>

            <Field label="Description" hint="Optional">
              <Textarea
                name="description"
                defaultValue={group.description ?? ""}
                className="min-h-[80px] rounded-2xl border-slate/20 bg-white px-3.5 py-3"
              />
            </Field>

            <div>
              <Button type="submit" variant="secondary" className="rounded-2xl">
                Save group
              </Button>
            </div>
          </form>
        ))}
      </section>
    </main>
  );
}
