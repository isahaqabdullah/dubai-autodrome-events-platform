"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ImageIcon, FileText, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CategoriesEditor } from "@/components/admin/categories-editor";
import { TicketOptionsEditor } from "@/components/admin/ticket-options-editor";
import type { EventFormConfig, EventRecord } from "@/lib/types";
import { formatInputDateTimeInZone } from "@/lib/utils";

const DEFAULT_POSTER_IMAGE = "/train-with-dubai-police-cover.png";
const DEFAULT_DISCLAIMER_PDF = "/disclaimer-dubai-autodrome.pdf";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const ALLOWED_PDF_TYPES = ["application/pdf"];

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface EventFormResult {
  ok: boolean;
  error?: string;
}

interface EventFormProps {
  event?: EventRecord | null;
  action: (formData: FormData) => Promise<EventFormResult>;
  hideRegistrationSections?: boolean;
  cancelHref?: string;
  successHref?: string;
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
    <section className="admin-card grid gap-3 p-3 sm:gap-5 sm:p-6 md:grid-cols-[200px_minmax(0,1fr)] lg:grid-cols-[220px_minmax(0,1fr)]">
      <div>
        <p className="admin-label">{eyebrow}</p>
        <h3 className="mt-1 text-sm font-semibold tracking-tight text-ink sm:mt-2 sm:text-xl">{title}</h3>
      </div>
      <div className="grid gap-3 sm:gap-5">{children}</div>
    </section>
  );
}

function FileUploadField({
  label,
  hint,
  accept,
  currentUrl,
  onUploaded,
  onRemove,
  eventId,
  kind,
  preview
}: {
  label: string;
  hint: string;
  accept: string;
  currentUrl: string;
  onUploaded: (url: string) => void;
  onRemove: () => void;
  eventId: string;
  kind: "poster" | "disclaimer";
  preview?: "image" | "link";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);

    // Client-side guardrails
    if (file.size > MAX_FILE_SIZE) {
      setUploadError(`File too large (${formatFileSize(file.size)}). Maximum size is 10 MB.`);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    const allowedTypes = kind === "poster" ? ALLOWED_IMAGE_TYPES : ALLOWED_PDF_TYPES;
    if (!allowedTypes.includes(file.type)) {
      const expected = kind === "poster" ? "PNG, JPEG, or WebP" : "PDF";
      setUploadError(`Invalid file type "${file.type || file.name.split(".").pop()}". Accepted: ${expected}.`);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setUploading(true);

    const body = new FormData();
    body.append("file", file);
    body.append("eventId", eventId);
    body.append("kind", kind);

    try {
      const response = await fetch("/api/admin/upload", { method: "POST", body });
      const result = await response.json();

      if (!response.ok) {
        setUploadError(result.message ?? "Upload failed.");
      } else {
        onUploaded(result.publicUrl);
      }
    } catch {
      setUploadError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <Field label={label} hint={hint}>
      <div className="space-y-3">
        {currentUrl ? (
          <div className="flex items-start gap-3 rounded-2xl border border-slate/15 bg-white p-3">
            {preview === "image" ? (
              <img src={currentUrl} alt="" className="h-16 w-24 rounded-lg object-cover" />
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-50">
                <FileText className="h-6 w-6 text-slate" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{currentUrl.split("/").pop()}</p>
              <p className="mt-0.5 truncate text-xs text-slate">{currentUrl}</p>
            </div>
            <button
              type="button"
              onClick={onRemove}
              className="shrink-0 rounded-lg p-1.5 text-slate transition hover:bg-rose-50 hover:text-rose-600"
              title="Remove"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-2xl border border-dashed border-slate/25 bg-slate-50 px-4 py-3 text-sm text-slate">
            {kind === "poster" ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
            <span>No file selected</span>
          </div>
        )}

        <div className="flex items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate/20 bg-white px-3.5 py-2 text-sm font-medium text-ink shadow-sm transition hover:bg-mist">
            <Upload className="h-4 w-4" />
            {uploading ? "Uploading..." : "Upload file"}
            <input
              ref={inputRef}
              type="file"
              accept={accept}
              onChange={handleFileChange}
              disabled={uploading}
              className="hidden"
            />
          </label>
          <span className="text-xs text-slate">or paste a URL</span>
          <Input
            value={currentUrl}
            onChange={(e) => onUploaded(e.target.value)}
            placeholder={kind === "poster" ? "/path/to/image.png" : "/path/to/file.pdf"}
            className="flex-1 rounded-xl border-slate/20 bg-white px-3 py-2 text-sm"
          />
        </div>

        <p className="text-xs text-slate">
          Max 10 MB. Accepted: {kind === "poster" ? "PNG, JPEG, WebP" : "PDF"}.
        </p>

        {uploadError ? (
          <p className="text-sm text-rose-600">{uploadError}</p>
        ) : null}
      </div>
    </Field>
  );
}

export function EventForm({
  event,
  action,
  hideRegistrationSections = false,
  cancelHref = "/admin",
  successHref
}: EventFormProps) {
  const config = (event?.form_config ?? {}) as EventFormConfig;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formVersion = event ? `${event.id}:${event.updated_at}` : "new";
  const finalSuccessHref = successHref ?? cancelHref;

  // File upload state
  const initialPosterImage = config.posterImage ?? DEFAULT_POSTER_IMAGE;
  const initialDisclaimerPdfUrl = config.disclaimerPdfUrl ?? DEFAULT_DISCLAIMER_PDF;
  const [posterImage, setPosterImage] = useState(initialPosterImage);
  const [disclaimerPdfUrl, setDisclaimerPdfUrl] = useState(initialDisclaimerPdfUrl);

  const eventId = event?.id ?? "new";

  useEffect(() => {
    setPosterImage(initialPosterImage);
    setDisclaimerPdfUrl(initialDisclaimerPdfUrl);
  }, [formVersion, initialPosterImage, initialDisclaimerPdfUrl]);

  function handleSubmit(formData: FormData) {
    setError(null);
    formData.set("posterImage", posterImage);
    formData.set("disclaimerPdfUrl", disclaimerPdfUrl);
    startTransition(async () => {
      const result = await action(formData);
      if (result.ok) {
        setShowSuccess(true);
        if (event) {
          router.refresh();
        }
      } else {
        setError(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <>
      <form key={formVersion} action={handleSubmit} className="grid gap-4 sm:gap-5">
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
          eyebrow="Content"
          title="Event photo & description"
        >
          <FileUploadField
            label="Event poster image"
            hint="Shown on the booking page, ticket card, sidebar, and confirmation emails"
            accept="image/png,image/jpeg,image/webp"
            currentUrl={posterImage}
            onUploaded={setPosterImage}
            onRemove={() => setPosterImage("")}
            eventId={eventId}
            kind="poster"
            preview="image"
          />

          <div className="grid gap-4 sm:gap-5 md:grid-cols-2">
            <Field label="Intro line" hint="Short tagline shown on the booking page">
              <Input
                name="introLine"
                defaultValue={config.introLine ?? ""}
                placeholder="Hit the track for free. Dubai Police has you covered!"
                className="rounded-2xl border-slate/20 bg-white px-3.5 py-3"
              />
            </Field>
            <Field label="Email intro line" hint="Short tagline in confirmation emails — falls back to intro line if empty">
              <Input
                name="emailIntroLine"
                defaultValue={config.emailIntroLine ?? ""}
                placeholder="Same as booking page intro if left empty"
                className="rounded-2xl border-slate/20 bg-white px-3.5 py-3"
              />
            </Field>
          </div>

          <Field label="Event description" hint="Shown on the booking page. Separate paragraphs with blank lines.">
            <Textarea
              name="descriptionText"
              defaultValue={config.descriptionParagraphs?.join("\n\n") ?? ""}
              placeholder="Join us at Dubai Autodrome for the region's premier community fitness night!&#10;&#10;Registration is required, so secure your free spot today!"
              className="min-h-[120px] rounded-2xl border-slate/20 bg-white px-3.5 py-3"
            />
          </Field>

          <Field label="Email description" hint="Shown in confirmation emails. Falls back to event description if empty.">
            <Textarea
              name="emailDescriptionText"
              defaultValue={config.emailDescriptionParagraphs?.join("\n\n") ?? ""}
              placeholder="Leave empty to use the event description above"
              className="min-h-[120px] rounded-2xl border-slate/20 bg-white px-3.5 py-3"
            />
          </Field>
        </FormSection>

        <FormSection
          eyebrow="Terms & Conditions"
          title="Disclaimer PDF and terms"
        >
          <FileUploadField
            label="Disclaimer PDF"
            hint="Upload a PDF. Clear to remove PDF and show terms as text only."
            accept="application/pdf"
            currentUrl={disclaimerPdfUrl}
            onUploaded={setDisclaimerPdfUrl}
            onRemove={() => setDisclaimerPdfUrl("")}
            eventId={eventId}
            kind="disclaimer"
            preview="link"
          />

          <Field label="Disclaimer heading" hint="Heading shown above the terms/PDF on the registration page">
            <Input
              name="disclaimerHeading"
              defaultValue={config.disclaimerHeading ?? ""}
              placeholder="Waiver of Liability and Declaration of Assumption of Risk"
              className="rounded-2xl border-slate/20 bg-white px-3.5 py-3"
            />
          </Field>

          <Field label="Terms & Conditions text" hint="Full terms shown on the registration page (expandable). Also stored as the declaration text.">
            <Textarea
              name="declarationText"
              required
              defaultValue={event?.declaration_text ?? "Terms & Conditions: By proceeding with this booking, you confirm that you have read and agree to the full Terms & Conditions. Entry is at your own risk and all participants must sign a waiver before taking part. Participants must follow all safety rules, use appropriate equipment, and comply with instructions from officials at all times. Unsafe behaviour or misuse of equipment may result in removal from the session. Specific rules apply for cyclists, runners, rollerbladers, and bootcamp users. Medical support is available onsite. Participants must meet fitness requirements and are responsible for any damage caused. Personal data may be collected for participation purposes. UAE law applies. - Full Terms & Conditions: dubaiautodrome.ae/open-track-days/traindxb"}
              className="min-h-[160px] rounded-2xl border-slate/20 bg-white px-3.5 py-3"
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
          eyebrow={config.categoriesLabel || "Categories"}
          title="Define ticket categories"
        >
          <Field label="Section label" hint="Optional — displayed to attendees as the heading for categories">
            <Input
              name="categoriesLabel"
              defaultValue={config.categoriesLabel ?? ""}
              placeholder="Categories"
              className="rounded-2xl border-slate/20 bg-white px-3.5 py-3"
            />
          </Field>
          <CategoriesEditor initialCategories={config.categories ?? []} />
        </FormSection>

        <FormSection
          eyebrow={config.ticketOptionsLabel || "Additional ticket categories"}
          title="Define add-on options"
        >
          <Field label="Section label" hint="Optional — displayed to attendees as the heading for add-ons">
            <Input
              name="ticketOptionsLabel"
              defaultValue={config.ticketOptionsLabel ?? ""}
              placeholder="Additional ticket categories"
              className="rounded-2xl border-slate/20 bg-white px-3.5 py-3"
            />
          </Field>
          <TicketOptionsEditor initialTickets={config.ticketOptions ?? []} />
        </FormSection>

        {hideRegistrationSections ? (
          <>
            <input type="hidden" name="declarationVersion" value={event?.declaration_version ?? 1} />
            <input type="hidden" name="submitLabel" value={config.submitLabel ?? ""} />
          </>
        ) : (
          <FormSection
            eyebrow="Registration"
            title="Declaration version and submit label"
          >
            <div className="grid gap-4 sm:gap-5 md:grid-cols-2">
              <Field label="Declaration version" hint="Increment when T&C change to re-require acceptance">
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
          </FormSection>
        )}

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-100 px-4 py-3 text-sm text-rose-900">
            {error}
          </div>
        ) : null}

        <div className="admin-card sticky bottom-3 z-10 flex items-center justify-between gap-3 px-3 py-3 backdrop-blur sm:px-6 sm:py-4">
          <div className="min-w-0">
            <p className="admin-label">{event ? "Editing event" : "Create event"}</p>
            <p className="mt-0.5 hidden text-sm font-medium text-ink sm:block">{event ? "Ready to save changes." : "Ready to create the event."}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href={cancelHref}
              className="inline-flex items-center justify-center rounded-xl border border-slate/15 bg-white px-4 py-2 text-xs font-semibold text-ink transition hover:border-slate/30 hover:bg-slate-50 sm:rounded-2xl sm:text-sm"
            >
              Cancel
            </a>
            <Button type="submit" disabled={isPending} className="rounded-xl px-4 py-2 text-xs sm:min-w-[150px] sm:rounded-2xl sm:text-sm">
              {isPending ? "Saving..." : event ? "Save event" : "Create event"}
            </Button>
          </div>
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
              onClick={() => window.location.assign(finalSuccessHref)}
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
