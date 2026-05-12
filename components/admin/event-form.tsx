"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { BookmarkPlus, CheckCircle2, Download, FileText, ImageIcon, RotateCcw, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CategoriesEditor } from "@/components/admin/categories-editor";
import { TicketOptionsEditor } from "@/components/admin/ticket-options-editor";
import {
  createEventFormTemplate,
  EVENT_FORM_TEMPLATE_STORAGE_KEY,
  EVENT_FORM_TEMPLATE_TEXT_FIELDS,
  extractEventFormTemplateValues,
  parseStoredEventFormTemplates,
  type EventFormTemplate,
  type EventFormTemplateTextField
} from "@/lib/event-form-templates";
import type { EventFormConfig, EventRecord, EventTicketOption } from "@/lib/types";
import { formatInputDateTimeInZone } from "@/lib/utils";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const ALLOWED_PDF_TYPES = ["application/pdf"];

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getDescriptionText(event: EventRecord | null | undefined, config: EventFormConfig) {
  if (config.descriptionParagraphs?.length) {
    return config.descriptionParagraphs.join("\n\n");
  }

  return event?.description ?? "";
}

function getInitialTemplateTextValues(
  event: EventRecord | null | undefined,
  config: EventFormConfig,
  descriptionText: string
): Record<EventFormTemplateTextField, string> {
  return {
    venue: event?.venue ?? "",
    timezone: event?.timezone ?? "",
    mapLink: config.mapLink ?? "",
    introLine: config.introLine ?? "",
    descriptionText,
    emailIntroLine: config.emailIntroLine ?? "",
    emailDescriptionText: config.emailDescriptionParagraphs?.join("\n\n") ?? "",
    disclaimerHeading: config.disclaimerHeading ?? "",
    declarationText: event?.declaration_text ?? "",
    categoriesLabel: config.categoriesLabel ?? "",
    ticketOptionsLabel: config.ticketOptionsLabel ?? "",
    declarationVersion: String(event?.declaration_version ?? 1),
    submitLabel: config.submitLabel ?? ""
  };
}

function setFormFieldValue(form: HTMLFormElement, name: string, value: string) {
  const field = form.elements.namedItem(name);

  if (!field || field instanceof RadioNodeList || !("value" in field)) {
    return;
  }

  const input = field as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
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
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formVersion = event ? `${event.id}:${event.updated_at}` : "new";
  const finalSuccessHref = successHref ?? cancelHref;

  // File upload state
  const initialPosterImage = config.posterImage ?? "";
  const initialDisclaimerPdfUrl = config.disclaimerPdfUrl ?? "";
  const initialDescriptionText = getDescriptionText(event, config);
  const initialTemplateTextValues = getInitialTemplateTextValues(event, config, initialDescriptionText);
  const dateInputTimeZone = event?.timezone?.trim() || "UTC";
  const [posterImage, setPosterImage] = useState(initialPosterImage);
  const [disclaimerPdfUrl, setDisclaimerPdfUrl] = useState(initialDisclaimerPdfUrl);
  const [templates, setTemplates] = useState<EventFormTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateMessage, setTemplateMessage] = useState<string | null>(null);
  const [templateCategories, setTemplateCategories] = useState<EventTicketOption[] | null>(null);
  const [templateTicketOptions, setTemplateTicketOptions] = useState<EventTicketOption[] | null>(null);
  const [templateEditorVersion, setTemplateEditorVersion] = useState(0);

  const eventId = event?.id ?? "new";

  useEffect(() => {
    setPosterImage(initialPosterImage);
    setDisclaimerPdfUrl(initialDisclaimerPdfUrl);
    setTemplateCategories(null);
    setTemplateTicketOptions(null);
    setTemplateEditorVersion((current) => current + 1);
  }, [formVersion, initialPosterImage, initialDisclaimerPdfUrl]);

  useEffect(() => {
    setTemplates(parseStoredEventFormTemplates(window.localStorage.getItem(EVENT_FORM_TEMPLATE_STORAGE_KEY)));
  }, []);

  function persistTemplates(nextTemplates: EventFormTemplate[]) {
    setTemplates(nextTemplates);
    window.localStorage.setItem(EVENT_FORM_TEMPLATE_STORAGE_KEY, JSON.stringify(nextTemplates));
    if (!nextTemplates.some((template) => template.id === selectedTemplateId)) {
      setSelectedTemplateId(nextTemplates[0]?.id ?? "");
    }
  }

  function handleSaveTemplate() {
    if (!formRef.current) {
      return;
    }

    const trimmedTemplateName = templateName.trim();

    if (!trimmedTemplateName) {
      setTemplateMessage("Enter a template name before saving.");
      return;
    }

    const formData = new FormData(formRef.current);
    formData.set("posterImage", posterImage);
    formData.set("disclaimerPdfUrl", disclaimerPdfUrl);

    const template = createEventFormTemplate(
      trimmedTemplateName,
      extractEventFormTemplateValues(formData, { posterImage, disclaimerPdfUrl })
    );
    const nextTemplates = [template, ...templates];
    persistTemplates(nextTemplates);
    setSelectedTemplateId(template.id);
    setTemplateName("");
    setTemplateMessage(`Saved "${template.name}" as a local template.`);
  }

  function handleLoadTemplate() {
    const template = templates.find((item) => item.id === selectedTemplateId);

    if (!template || !formRef.current) {
      return;
    }

    const confirmed = window.confirm(
      `Load "${template.name}"? This replaces reusable setup fields only and keeps title, slug, schedule, status, and capacity unchanged.`
    );

    if (!confirmed) {
      return;
    }

    for (const field of EVENT_FORM_TEMPLATE_TEXT_FIELDS) {
      setFormFieldValue(formRef.current, field, template.values[field]);
    }

    setPosterImage(template.values.posterImage);
    setDisclaimerPdfUrl(template.values.disclaimerPdfUrl);
    setTemplateCategories(template.values.categories);
    setTemplateTicketOptions(template.values.ticketOptions);
    setTemplateEditorVersion((current) => current + 1);
    setTemplateMessage(`Loaded "${template.name}".`);
  }

  function handleResetTemplate() {
    if (!formRef.current) {
      return;
    }

    const confirmed = window.confirm(
      "Reset reusable setup fields to the saved event values? Title, slug, schedule, status, and capacity will stay unchanged."
    );

    if (!confirmed) {
      return;
    }

    for (const field of EVENT_FORM_TEMPLATE_TEXT_FIELDS) {
      setFormFieldValue(formRef.current, field, initialTemplateTextValues[field]);
    }

    setPosterImage(initialPosterImage);
    setDisclaimerPdfUrl(initialDisclaimerPdfUrl);
    setTemplateCategories(null);
    setTemplateTicketOptions(null);
    setSelectedTemplateId("");
    setTemplateEditorVersion((current) => current + 1);
    setTemplateMessage("Template fields reset.");
  }

  function handleDeleteTemplate() {
    const template = templates.find((item) => item.id === selectedTemplateId);

    if (!template) {
      return;
    }

    const confirmed = window.confirm(`Delete local template "${template.name}"?`);

    if (!confirmed) {
      return;
    }

    persistTemplates(templates.filter((item) => item.id !== template.id));
    setTemplateMessage(`Deleted "${template.name}".`);
  }

  function handleSubmit(eventObject: React.FormEvent<HTMLFormElement>) {
    eventObject.preventDefault();
    const formData = new FormData(eventObject.currentTarget);

    setError(null);
    formData.set("posterImage", posterImage);
    formData.set("disclaimerPdfUrl", disclaimerPdfUrl);
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
      <form ref={formRef} key={formVersion} onSubmit={handleSubmit} className="grid gap-4 sm:gap-5">
        {event ? <input type="hidden" name="id" value={event.id} /> : null}

        <section className="admin-card grid gap-3 p-3 sm:gap-4 sm:p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="admin-label">Templates</p>
              <h3 className="mt-1 text-base font-semibold tracking-tight text-ink sm:text-lg">Reuse event setup</h3>
            </div>
            {templateMessage ? (
              <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
                {templateMessage}
              </p>
            ) : null}
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select
                value={selectedTemplateId}
                onChange={(eventObject) => setSelectedTemplateId(eventObject.target.value)}
                className="rounded-xl border-slate/20 bg-white px-3 py-2 text-sm"
              >
                <option value="">Select a saved template</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </Select>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!selectedTemplateId}
                  onClick={handleLoadTemplate}
                  className="rounded-xl px-3 py-2 text-xs sm:text-sm"
                >
                  <Download className="h-4 w-4" />
                  Load
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={!selectedTemplateId}
                  onClick={handleDeleteTemplate}
                  className="rounded-xl px-3 py-2 text-xs sm:text-sm"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleResetTemplate}
                  className="rounded-xl px-3 py-2 text-xs sm:text-sm"
                >
                  <RotateCcw className="h-4 w-4" />
                  Reset template
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={templateName}
                onChange={(eventObject) => setTemplateName(eventObject.target.value)}
                placeholder="Template name (required)"
                className="rounded-xl border-slate/20 bg-white px-3 py-2 text-sm"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={handleSaveTemplate}
                disabled={!templateName.trim()}
                className="rounded-xl px-3 py-2 text-xs sm:text-sm"
              >
                <BookmarkPlus className="h-4 w-4" />
                Save as template
              </Button>
            </div>
          </div>
        </section>

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
                placeholder="Community Track Night"
                className="rounded-2xl border-slate/20 bg-white px-3.5 py-3"
              />
            </Field>
            <Field label="Slug" hint="Used in URLs">
              <Input
                name="slug"
                required
                defaultValue={event?.slug ?? ""}
                placeholder="community-track-night"
                className="rounded-2xl border-slate/20 bg-white px-3.5 py-3"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:gap-5 md:grid-cols-3">
            <Field label="Venue" hint="Optional">
              <Input
                name="venue"
                defaultValue={event?.venue ?? ""}
                placeholder="Main venue"
                className="rounded-2xl border-slate/20 bg-white px-3.5 py-3"
              />
            </Field>
            <Field label="Timezone">
              <Input
                name="timezone"
                required
                defaultValue={event?.timezone ?? ""}
                placeholder="Asia/Dubai"
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
              defaultValue={config.mapLink ?? ""}
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
                placeholder="Short attendee-facing summary"
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
              defaultValue={initialDescriptionText}
              placeholder="Describe what attendees can expect, who the event is for, and any important arrival details."
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
              defaultValue={event?.declaration_text ?? ""}
              placeholder="Enter the terms attendees must accept before registering."
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
                defaultValue={formatInputDateTimeInZone(event?.start_at ?? null, dateInputTimeZone)}
                className="rounded-2xl border-slate/20 bg-white px-3.5 py-3"
              />
            </Field>
            <Field label="Event end">
              <Input
                name="endAt"
                type="datetime-local"
                required
                defaultValue={formatInputDateTimeInZone(event?.end_at ?? null, dateInputTimeZone)}
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
                  dateInputTimeZone
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
                  dateInputTimeZone
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
          eyebrow={config.categoriesLabel || "Ticket types"}
          title="Define ticket types"
        >
          <Field label="Section label" hint="Optional — displayed to attendees as the heading for ticket types">
            <Input
              name="categoriesLabel"
              defaultValue={config.categoriesLabel ?? ""}
              placeholder="Ticket type"
              className="rounded-2xl border-slate/20 bg-white px-3.5 py-3"
            />
          </Field>
          <CategoriesEditor
            key={`categories-${formVersion}-${templateEditorVersion}`}
            initialCategories={templateCategories ?? config.categories ?? []}
          />
        </FormSection>

        <FormSection
          eyebrow={config.ticketOptionsLabel || "Activity categories"}
          title="Define activity categories"
        >
          <Field label="Section label" hint="Optional — displayed to attendees as the heading for activity categories">
            <Input
              name="ticketOptionsLabel"
              defaultValue={config.ticketOptionsLabel ?? ""}
              placeholder="Activity category"
              className="rounded-2xl border-slate/20 bg-white px-3.5 py-3"
            />
          </Field>
          <TicketOptionsEditor
            key={`ticket-options-${formVersion}-${templateEditorVersion}`}
            initialTickets={templateTicketOptions ?? config.ticketOptions ?? []}
          />
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

        <div className="admin-card flex flex-col gap-3 px-3 py-3 sm:px-6 sm:py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="admin-label">{event ? "Editing event" : "Create event"}</p>
            <p className="mt-0.5 hidden text-sm font-medium text-ink sm:block">{event ? "Ready to save changes." : "Ready to create the event."}</p>
          </div>
          <div className="flex w-full flex-col gap-3 lg:w-auto lg:flex-row lg:items-center">
            <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
              <Input
                value={templateName}
                onChange={(eventObject) => setTemplateName(eventObject.target.value)}
                placeholder="Template name (required)"
                aria-label="Template name for bottom save"
                className="w-full rounded-xl border-slate/20 bg-white px-3 py-2 text-sm sm:min-w-[220px] lg:w-64"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={handleSaveTemplate}
                disabled={!templateName.trim()}
                className="rounded-xl px-3 py-2 text-xs sm:text-sm"
              >
                <BookmarkPlus className="h-4 w-4" />
                Save template
              </Button>
            </div>
            <div className="flex shrink-0 items-center justify-end gap-2">
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
