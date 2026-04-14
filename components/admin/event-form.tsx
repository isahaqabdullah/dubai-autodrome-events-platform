"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TicketOptionsEditor } from "@/components/admin/ticket-options-editor";
import type { EventFormConfig, EventRecord } from "@/lib/types";
import { formatInputDateTimeInZone } from "@/lib/utils";

export interface EventFormResult {
  ok: boolean;
  error?: string;
}

interface EventFormProps {
  event?: EventRecord | null;
  action: (formData: FormData) => Promise<EventFormResult>;
  hideRegistrationSections?: boolean;
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
    <section className="admin-card grid gap-4 p-4 sm:gap-5 sm:p-6 md:grid-cols-[200px_minmax(0,1fr)] lg:grid-cols-[220px_minmax(0,1fr)]">
      <div>
        <p className="admin-label">{eyebrow}</p>
        <h3 className="mt-2 text-lg font-semibold tracking-tight text-ink sm:text-xl">{title}</h3>
      </div>
      <div className="grid gap-4 sm:gap-5">{children}</div>
    </section>
  );
}

export function EventForm({ event, action, hideRegistrationSections = false }: EventFormProps) {
  const config = (event?.form_config ?? {}) as EventFormConfig;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await action(formData);
      if (result.ok) {
        setShowSuccess(true);
      } else {
        setError(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <>
      <form action={handleSubmit} className="grid gap-4 sm:gap-5">
        {event ? <input type="hidden" name="id" value={event.id} /> : null}

        <FormSection
          eyebrow="Basics"
          title="Name and identify the event"
        >
          <div className="grid gap-4 sm:gap-5 md:grid-cols-2">
            <Field label="Event title">
              <Input
                name="title"
                required
                defaultValue={event?.title ?? ""}
                placeholder="Dubai Autodrome Track Day"
                className="rounded-2xl border-slate/20 bg-white px-3.5 py-3"
              />
            </Field>
            <Field label="Slug" hint="Used in URLs">
              <Input
                name="slug"
                required
                defaultValue={event?.slug ?? ""}
                placeholder="track-day-april-2026"
                className="rounded-2xl border-slate/20 bg-white px-3.5 py-3"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:gap-5 md:grid-cols-3">
            <Field label="Venue" hint="Optional">
              <Input
                name="venue"
                defaultValue={event?.venue ?? "Dubai Autodrome, Sheikh Mohammed Bin Zayed Rd, Dubai"}
                placeholder="Dubai Autodrome"
                className="rounded-2xl border-slate/20 bg-white px-3.5 py-3"
              />
            </Field>
            <Field label="Timezone">
              <Input
                name="timezone"
                required
                defaultValue={event?.timezone ?? "Asia/Dubai"}
                className="rounded-2xl border-slate/20 bg-white px-3.5 py-3"
              />
            </Field>
            <Field label="Capacity" hint="Optional">
              <Input
                name="capacity"
                type="number"
                min={1}
                defaultValue={event?.capacity ?? ""}
                placeholder="150"
                className="rounded-2xl border-slate/20 bg-white px-3.5 py-3"
              />
            </Field>
          </div>

          <Field label="Map link" hint="Optional — shown on ticket and confirmation email">
            <Input
              name="mapLink"
              type="url"
              defaultValue={config.mapLink ?? "https://maps.app.goo.gl/7aQkJWJ7L9N8WetSA"}
              placeholder="https://maps.google.com/..."
              className="rounded-2xl border-slate/20 bg-white px-3.5 py-3"
            />
          </Field>
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
                className="rounded-2xl border-slate/20 bg-white px-3.5 py-3"
              />
            </Field>
            <Field label="Event end">
              <Input
                name="endAt"
                type="datetime-local"
                required
                defaultValue={formatInputDateTimeInZone(event?.end_at ?? null, event?.timezone ?? "Asia/Dubai")}
                className="rounded-2xl border-slate/20 bg-white px-3.5 py-3"
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
                className="rounded-2xl border-slate/20 bg-white px-3.5 py-3"
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
                className="rounded-2xl border-slate/20 bg-white px-3.5 py-3"
              />
            </Field>
            <Field label="Status">
              <Select name="status" defaultValue={event?.status ?? "draft"} className="rounded-2xl border-slate/20 bg-white px-3.5 py-3">
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
          eyebrow="Tickets"
          title="Configure bootcamp or secondary admissions"
        >
          <TicketOptionsEditor initialTickets={config.ticketOptions ?? []} />
        </FormSection>

        {hideRegistrationSections ? (
          <>
            <input type="hidden" name="declarationVersion" value={event?.declaration_version ?? 1} />
            <input type="hidden" name="submitLabel" value={config.submitLabel ?? ""} />
            <input type="hidden" name="declarationText" value={event?.declaration_text ?? ""} />
          </>
        ) : (
          <FormSection
            eyebrow="Registration"
            title="Declaration and submit label"
          >
            <div className="grid gap-4 sm:gap-5 md:grid-cols-2">
              <Field label="Declaration version">
                <Input
                  name="declarationVersion"
                  type="number"
                  min={1}
                  required
                  defaultValue={event?.declaration_version ?? 1}
                  className="rounded-2xl border-slate/20 bg-white px-3.5 py-3"
                />
              </Field>
              <Field label="Submit label" hint="Optional">
                <Input
                  name="submitLabel"
                  defaultValue={config.submitLabel ?? ""}
                  placeholder="Request registration"
                  className="rounded-2xl border-slate/20 bg-white px-3.5 py-3"
                />
              </Field>
            </div>

            <Field label="Declaration text">
              <Textarea
                name="declarationText"
                required
                defaultValue={event?.declaration_text ?? "Terms & Conditions: By proceeding with this booking, you confirm that you have read and agree to the full Terms & Conditions. Entry is at your own risk and all participants must sign a waiver before taking part. Participants must follow all safety rules, use appropriate equipment, and comply with instructions from officials at all times. Unsafe behaviour or misuse of equipment may result in removal from the session. Specific rules apply for cyclists, runners, rollerbladers, and bootcamp users. Medical support is available onsite. Participants must meet fitness requirements and are responsible for any damage caused. Personal data may be collected for participation purposes. UAE law applies. - Full Terms & Conditions: dubaiautodrome.ae/open-track-days/traindxb"}
                className="min-h-[130px] rounded-2xl border-slate/20 bg-white px-3.5 py-3"
              />
            </Field>
          </FormSection>
        )}

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-100 px-4 py-3 text-sm text-rose-900">
            {error}
          </div>
        ) : null}

        <div className="admin-card sticky bottom-3 z-10 flex flex-col gap-3 px-4 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="admin-label">{event ? "Editing event" : "Create event"}</p>
            <p className="mt-1 text-sm font-medium text-ink">{event ? "Ready to save changes." : "Ready to create the event."}</p>
          </div>
          <Button type="submit" disabled={isPending} className="min-w-[150px] rounded-2xl">
            {isPending ? "Saving..." : event ? "Save event" : "Create event"}
          </Button>
        </div>
      </form>

      {showSuccess ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-sm rounded-2xl border border-slate/10 bg-white p-6 text-center shadow-lg sm:p-8">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
            <h2 className="mt-4 text-xl font-semibold tracking-tight text-ink">
              {event ? "Changes saved" : "Event created"}
            </h2>
            <p className="mt-2 text-sm text-slate">
              {event
                ? "Your changes have been saved successfully."
                : "The event has been created successfully."}
            </p>
            <Button
              type="button"
              onClick={() => router.push("/admin")}
              className="mt-6 w-full rounded-2xl"
            >
              OK
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
