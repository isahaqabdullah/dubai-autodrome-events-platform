import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { EventRecord } from "@/lib/types";
import { formatInputDateTimeInZone } from "@/lib/utils";

interface EventFormProps {
  event?: EventRecord | null;
  action: (formData: FormData) => Promise<void>;
}

function FormSection({
  eyebrow,
  title,
  children
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-5 rounded-[28px] border border-slate/10 bg-white/70 p-4 sm:p-6 lg:grid-cols-[240px_minmax(0,1fr)]">
      <div>
        <p className="section-title">{eyebrow}</p>
        <h3 className="mt-2 text-xl font-semibold tracking-tight text-ink">{title}</h3>
      </div>
      <div className="grid gap-4 sm:gap-5">{children}</div>
    </section>
  );
}

export function EventForm({ event, action }: EventFormProps) {
  const config = (event?.form_config ?? {}) as {
    submitLabel?: string;
    introNote?: string;
    successMessage?: string;
    showCompanyField?: boolean;
    showEmergencyFields?: boolean;
  };

  return (
    <form action={action} className="grid gap-4 sm:gap-5">
      {event ? <input type="hidden" name="id" value={event.id} /> : null}

      <FormSection
        eyebrow="Basics"
        title="Name and identify the event"
      >
        <div className="grid gap-4 sm:gap-5 md:grid-cols-2">
          <Field label="Event title">
            <Input name="title" required defaultValue={event?.title ?? ""} placeholder="Dubai Autodrome Track Day" />
          </Field>
          <Field label="Slug" hint="Used in URLs">
            <Input name="slug" required defaultValue={event?.slug ?? ""} placeholder="track-day-april-2026" />
          </Field>
        </div>

        <Field label="Description" hint="Optional">
          <Textarea
            name="description"
            defaultValue={event?.description ?? ""}
            className="min-h-[120px]"
            placeholder="Describe the experience, audience, or any operational notes that help attendees."
          />
        </Field>

        <div className="grid gap-4 sm:gap-5 md:grid-cols-3">
          <Field label="Venue" hint="Optional">
            <Input name="venue" defaultValue={event?.venue ?? ""} placeholder="Dubai Autodrome" />
          </Field>
          <Field label="Timezone">
            <Input name="timezone" required defaultValue={event?.timezone ?? "Asia/Dubai"} />
          </Field>
          <Field label="Capacity" hint="Optional">
            <Input name="capacity" type="number" min={1} defaultValue={event?.capacity ?? ""} placeholder="150" />
          </Field>
        </div>
      </FormSection>

      <FormSection
        eyebrow="Schedule"
        title="Define the event window"
      >
        <div className="grid gap-4 sm:gap-5 md:grid-cols-2">
          <Field label="Event start">
            <Input
              name="startAt"
              type="datetime-local"
              required
              defaultValue={formatInputDateTimeInZone(event?.start_at ?? null, event?.timezone ?? "Asia/Dubai")}
            />
          </Field>
          <Field label="Event end">
            <Input
              name="endAt"
              type="datetime-local"
              required
              defaultValue={formatInputDateTimeInZone(event?.end_at ?? null, event?.timezone ?? "Asia/Dubai")}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:gap-5 md:grid-cols-3">
          <Field label="Registration opens" hint="Optional">
            <Input
              name="registrationOpensAt"
              type="datetime-local"
              defaultValue={formatInputDateTimeInZone(
                event?.registration_opens_at ?? null,
                event?.timezone ?? "Asia/Dubai"
              )}
            />
          </Field>
          <Field label="Registration closes" hint="Optional">
            <Input
              name="registrationClosesAt"
              type="datetime-local"
              defaultValue={formatInputDateTimeInZone(
                event?.registration_closes_at ?? null,
                event?.timezone ?? "Asia/Dubai"
              )}
            />
          </Field>
          <Field label="Status">
            <Select name="status" defaultValue={event?.status ?? "draft"}>
              <option value="draft">Draft</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="live">Live</option>
              <option value="archived">Archived</option>
            </Select>
          </Field>
        </div>
      </FormSection>

      <FormSection
        eyebrow="Registration"
        title="Control what guests read and submit"
      >
        <div className="grid gap-4 sm:gap-5 md:grid-cols-2">
          <Field label="Declaration version">
            <Input
              name="declarationVersion"
              type="number"
              min={1}
              required
              defaultValue={event?.declaration_version ?? 1}
            />
          </Field>
          <Field label="Submit label" hint="Optional">
            <Input name="submitLabel" defaultValue={config.submitLabel ?? ""} placeholder="Request registration" />
          </Field>
        </div>

        <Field label="Declaration text">
          <Textarea
            name="declarationText"
            required
            defaultValue={event?.declaration_text ?? ""}
            className="min-h-[220px]"
          />
        </Field>

        <div className="grid gap-4 sm:gap-5 md:grid-cols-2">
          <Field label="Intro note" hint="Optional">
            <Textarea
              name="introNote"
              defaultValue={config.introNote ?? ""}
              className="min-h-[130px]"
              placeholder="Welcome note or instructions shown before the form."
            />
          </Field>
          <Field label="Success message" hint="Optional">
            <Textarea
              name="successMessage"
              defaultValue={config.successMessage ?? ""}
              className="min-h-[130px]"
              placeholder="Confirmation note after a successful submission."
            />
          </Field>
        </div>
      </FormSection>

      <FormSection
        eyebrow="Form fields"
        title="Choose which attendee details are collected"
      >
        <div className="grid gap-3 rounded-[24px] border border-slate/10 bg-mist/40 p-4 text-sm text-slate sm:p-5">
          <label className="flex items-start gap-3 rounded-2xl border border-white/80 bg-white/75 px-4 py-3">
            <Checkbox name="showCompanyField" defaultChecked={config.showCompanyField ?? true} />
            <span>
              <strong className="block text-sm text-ink">Company field</strong>
            </span>
          </label>
          <label className="flex items-start gap-3 rounded-2xl border border-white/80 bg-white/75 px-4 py-3">
            <Checkbox name="showEmergencyFields" defaultChecked={config.showEmergencyFields ?? true} />
            <span>
              <strong className="block text-sm text-ink">Emergency contact fields</strong>
            </span>
          </label>
        </div>
      </FormSection>

      <div className="sticky bottom-3 z-10 flex items-center justify-between gap-3 rounded-[28px] border border-slate/10 bg-white/90 px-4 py-4 shadow-soft backdrop-blur sm:px-6">
        <p className="text-sm font-semibold text-ink">{event ? "Update this event" : "Publish a new event shell"}</p>
        <Button type="submit" className="min-w-[150px]">
          {event ? "Save event" : "Create event"}
        </Button>
      </div>
    </form>
  );
}
