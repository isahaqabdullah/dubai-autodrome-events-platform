import { revalidatePath } from "next/cache";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
  const createdGroup = await createEventGroup(input, actor);
  revalidateEventGroupViews();
  revalidatePath(`/events/${createdGroup.slug}`);
}

async function updateEventGroupAction(formData: FormData) {
  "use server";

  const actor = await requireAuthenticatedUser("admin");
  const input = parseAdminEventGroupFormData(formData);
  const previousSlug = String(formData.get("previousSlug") ?? "");
  await updateEventGroup(input, actor);
  revalidateEventGroupViews();
  if (previousSlug) {
    revalidatePath(`/events/${previousSlug}`);
  }
  revalidatePath(`/events/${input.slug}`);
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
        <p className="admin-label">Event categories</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Organize events
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate">
          Categories appear on the public events page. Every event must be assigned to one category.
        </p>
      </section>

      <section className="admin-card p-3 sm:p-4">
        <div className="mb-3">
          <p className="admin-label">Create category</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-ink">New public category</h2>
        </div>

        <form action={createEventGroupAction} className="grid gap-3">
          <input type="hidden" name="active" value="true" />
          <div className="grid gap-3 lg:grid-cols-[minmax(180px,1fr)_220px_90px_minmax(220px,1.2fr)_auto] lg:items-end">
            <Field label="Name">
              <Input
                name="name"
                required
                placeholder="Track Experiences"
                className="rounded-xl border-slate/20 bg-white px-3 py-2.5"
              />
            </Field>
            <Field label="Slug">
              <Input
                name="slug"
                required
                placeholder="track-experiences"
                className="rounded-xl border-slate/20 bg-white px-3 py-2.5"
              />
            </Field>
            <Field label="Order">
              <Input
                name="sortOrder"
                type="number"
                min={0}
                defaultValue={eventGroups.length}
                className="rounded-xl border-slate/20 bg-white px-3 py-2.5"
              />
            </Field>
            <Field label="Description" hint="Optional">
              <Input
                name="description"
                placeholder="Short public description"
                className="rounded-xl border-slate/20 bg-white px-3 py-2.5"
              />
            </Field>
            <Button type="submit" className="rounded-xl px-3.5 py-2.5 text-sm">
              Create
            </Button>
          </div>
        </form>
      </section>

      <section className="grid gap-2 sm:gap-3">
        <div>
          <p className="admin-label">Existing categories</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-ink">Edit category labels</h2>
        </div>

        {eventGroups.length === 0 ? (
          <div className="admin-card px-4 py-8 text-center text-sm text-slate">
            No categories have been created yet.
          </div>
        ) : null}

        {eventGroups.map((group) => {
          const eventCount = eventCounts.get(group.id) ?? 0;

          return (
            <form key={group.id} action={updateEventGroupAction} className="admin-card grid gap-3 p-3 sm:p-4">
              <input type="hidden" name="id" value={group.id} />
              <input type="hidden" name="active" value="true" />
              <input type="hidden" name="previousSlug" value={group.slug} />

              <div className="grid gap-3 xl:grid-cols-[220px_minmax(0,1fr)] xl:items-end">
                <div className="flex min-w-0 items-start justify-between gap-3 xl:block">
                  <div className="min-w-0">
                    <p className="admin-label">/{group.slug}</p>
                    <h3 className="mt-1 truncate text-base font-semibold tracking-tight text-ink">{group.name}</h3>
                  </div>
                  <span className="shrink-0 rounded-full border border-slate/15 bg-white/80 px-2.5 py-0.5 text-xs font-medium text-slate xl:mt-3 xl:inline-flex">
                    {eventCount} event{eventCount === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="grid gap-2 sm:grid-cols-[minmax(160px,1fr)_180px_80px] lg:grid-cols-[minmax(160px,1fr)_180px_80px_minmax(180px,1fr)_auto] lg:items-end">
                  <Field label="Name">
                    <Input
                      name="name"
                      required
                      defaultValue={group.name}
                      className="rounded-xl border-slate/20 bg-white px-3 py-2.5"
                    />
                  </Field>
                  <Field label="Slug">
                    <Input
                      name="slug"
                      required
                      defaultValue={group.slug}
                      className="rounded-xl border-slate/20 bg-white px-3 py-2.5"
                    />
                  </Field>
                  <Field label="Order">
                    <Input
                      name="sortOrder"
                      type="number"
                      min={0}
                      defaultValue={group.sort_order}
                      className="rounded-xl border-slate/20 bg-white px-3 py-2.5"
                    />
                  </Field>
                  <Field label="Description" hint="Optional">
                    <Input
                      name="description"
                      defaultValue={group.description ?? ""}
                      className="rounded-xl border-slate/20 bg-white px-3 py-2.5"
                    />
                  </Field>
                  <Button type="submit" variant="secondary" className="rounded-xl px-3.5 py-2.5 text-sm">
                    Save
                  </Button>
                </div>
              </div>
            </form>
          );
        })}
      </section>
    </main>
  );
}
