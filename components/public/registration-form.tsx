"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { EventRecord } from "@/lib/types";
import { mergeFormConfig } from "@/lib/utils";

interface RegistrationFormProps {
  event: EventRecord;
}

type SubmissionState = "idle" | "submitting" | "success" | "error";

const initialForm = {
  fullName: "",
  email: "",
  phone: "",
  company: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  declarationAccepted: false,
  website: ""
};

export function RegistrationForm({ event }: RegistrationFormProps) {
  const config = useMemo(() => mergeFormConfig(event.form_config), [event.form_config]);
  const [form, setForm] = useState(initialForm);
  const [submissionState, setSubmissionState] = useState<SubmissionState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function submitTo(endpoint: "/api/register/start" | "/api/register/resend-verification") {
    setSubmissionState("submitting");
    setMessage(null);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        eventId: event.id,
        ...form
      })
    });

    const result = (await response.json()) as { message?: string };

    if (!response.ok) {
      setSubmissionState("error");
      setMessage(result.message ?? "Unable to process the request.");
      return;
    }

    setSubmissionState("success");
    setMessage(result.message ?? config.successMessage ?? "Check your inbox for the next step.");
  }

  return (
    <div className="card-panel p-4 sm:p-6">
      <div className="mb-4 space-y-1.5 sm:mb-5 sm:space-y-2">
        <p className="section-title">Register</p>
        <h3 className="heading-lg">Reserve a place for this edition</h3>
        <p className="text-sm text-slate">{config.introNote}</p>
      </div>

      <form
        className="grid gap-4"
        onSubmit={async (eventObject) => {
          eventObject.preventDefault();
          await submitTo("/api/register/start");
        }}
      >
        <input type="hidden" name="eventId" value={event.id} />
        <Field label="Full name">
          <Input
            required
            value={form.fullName}
            onChange={(eventObject) => setForm((current) => ({ ...current, fullName: eventObject.target.value }))}
          />
        </Field>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Email address">
            <Input
              type="email"
              required
              value={form.email}
              onChange={(eventObject) => setForm((current) => ({ ...current, email: eventObject.target.value }))}
            />
          </Field>
          <Field label="Phone number">
            <Input
              required
              value={form.phone}
              onChange={(eventObject) => setForm((current) => ({ ...current, phone: eventObject.target.value }))}
            />
          </Field>
        </div>

        {config.showCompanyField ? (
          <Field label="Company or organization" hint="Optional">
            <Input
              value={form.company}
              onChange={(eventObject) => setForm((current) => ({ ...current, company: eventObject.target.value }))}
            />
          </Field>
        ) : null}

        {config.showEmergencyFields ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Emergency contact name" hint="Optional">
              <Input
                value={form.emergencyContactName}
                onChange={(eventObject) =>
                  setForm((current) => ({ ...current, emergencyContactName: eventObject.target.value }))
                }
              />
            </Field>
            <Field label="Emergency contact phone" hint="Optional">
              <Input
                value={form.emergencyContactPhone}
                onChange={(eventObject) =>
                  setForm((current) => ({ ...current, emergencyContactPhone: eventObject.target.value }))
                }
              />
            </Field>
          </div>
        ) : null}

        <Field label="Declaration preview">
          <Textarea value={event.declaration_text} disabled className="min-h-[160px] bg-mist" />
        </Field>

        <label className="flex items-start gap-3 rounded-2xl border border-slate/15 bg-mist/60 p-4 text-sm text-slate">
          <Checkbox
            checked={form.declarationAccepted}
            onChange={(eventObject) =>
              setForm((current) => ({ ...current, declarationAccepted: eventObject.target.checked }))
            }
          />
          <span>I confirm that I have read and accepted the declaration for this event edition.</span>
        </label>

        <input
          tabIndex={-1}
          autoComplete="off"
          className="hidden"
          name="website"
          value={form.website}
          onChange={(eventObject) => setForm((current) => ({ ...current, website: eventObject.target.value }))}
        />

        {message ? (
          <div
            className={`rounded-2xl px-4 py-3 text-sm ${
              submissionState === "error" ? "bg-rose-100 text-rose-900" : "bg-emerald-100 text-emerald-900"
            }`}
          >
            {message}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={submissionState === "submitting" || !form.declarationAccepted}>
            {submissionState === "submitting" ? "Submitting..." : config.submitLabel}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={!form.fullName || !form.email || submissionState === "submitting"}
            onClick={async () => {
              await submitTo("/api/register/resend-verification");
            }}
          >
            Resend verification
          </Button>
        </div>
      </form>
    </div>
  );
}
