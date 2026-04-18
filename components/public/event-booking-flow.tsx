"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, ChevronDown, ChevronUp, Clock3, FileText, MapPin } from "lucide-react";
import { EventTicketCard } from "@/components/public/event-ticket-card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { buildTicketAdmissionLabel, formatTicketDateTimeLine, getTicketPosterImageSrc } from "@/lib/ticket-presentation";
import type { EventRecord, EventTicketOption, RegistrationWindowState } from "@/lib/types";
import { isValidPhoneNumber, mergeFormConfig, PHONE_NUMBER_VALIDATION_MESSAGE, resolveCategories } from "@/lib/utils";
import { PdfViewer } from "@/components/public/pdf-viewer";

interface EventBookingFlowProps {
  event: EventRecord;
  registrationCount: number;
  registrationState: RegistrationWindowState;
  ticketCounts: Record<string, number>;
  categoryCounts: Record<string, number>;
}

type Step = "tickets" | "details";
type SubmissionState = "idle" | "submitting" | "success" | "error";
type OtpState = "idle" | "sending" | "sent";

interface CompletedAttendee {
  registrationId?: string;
  fullName: string;
  categoryTitle: string;
  ticketTitle: string | null;
  qrToken: string;
  manualCheckinCode?: string | null;
  email?: string;
}

interface CompletedRegistration {
  email: string;
  attendees: CompletedAttendee[];
}

interface SelectableOption extends EventTicketOption {
  isUnavailable: boolean;
  remaining: number | null;
}

const HOLD_DURATION_SECONDS = 25 * 60;
const DEFAULT_DISCLAIMER_PDF = "/disclaimer-dubai-autodrome.pdf";
const DEFAULT_INTRO = "Hit the track for free. Dubai Police has you covered!";
const DEFAULT_DESCRIPTION = [
  "Join us at Dubai Autodrome for the region's premier community fitness night! In a shared commitment to community health, wellness, and safety, we are thrilled to announce Train With Dubai Police.",
  "The best part? Dubai Police has your entry completely covered, making it 100% free for all participants. Join us on our Circuit under the lights for an unforgettable, high-energy evening of cycling, running, and specialized bootcamps.",
  "Registration is required, so secure your free spot today and let's hit the track!"
];
const INITIAL_FORM_STATE = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  age: "",
  uaeResident: false,
  declarationAccepted: false,
  marketingOptIn: false,
  website: ""
};
const BOOKING_SECTION_HEADING_CLASS = "font-title text-xl font-black italic leading-tight tracking-tight text-ink sm:text-2xl lg:text-[2rem]";

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number
) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
    if (lines.length >= maxLines) break;
  }

  if (lines.length < maxLines && current) {
    lines.push(current);
  }

  if (lines.length === maxLines && current && lines[lines.length - 1] !== current) {
    let truncated = lines[lines.length - 1];
    while (truncated.length > 0 && ctx.measureText(`${truncated}…`).width > maxWidth) {
      truncated = truncated.slice(0, -1);
    }
    lines[lines.length - 1] = `${truncated}…`;
  }

  lines.forEach((line, index) => {
    ctx.fillText(line, x, y + index * lineHeight);
  });
}

function formatTimer(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");

  return `${minutes}:${seconds}`;
}

function SelectionCard({
  title,
  description,
  note,
  meta,
  selected,
  disabled,
  onClick
}: {
  title: string;
  description?: string;
  note?: string;
  meta?: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={`w-full rounded-2xl border px-4 py-2.5 text-left transition sm:px-5 sm:py-3 ${
        selected
          ? "border-ink bg-ink text-white shadow-soft"
          : disabled
            ? "cursor-not-allowed border-slate/10 bg-slate-50 text-slate/60"
            : "border-ink/20 bg-white text-ink hover:border-ink/30 hover:bg-mist/60"
      }`}
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-display text-[15px] font-bold tracking-tight sm:text-lg">{title}</p>
          {description ? (
            <p className={`mt-0.5 text-[13px] leading-snug sm:text-sm ${selected ? "text-white/80" : "text-slate"}`}>
              {description}
            </p>
          ) : null}
          {note ? (
            <p className={`mt-0.5 text-[11px] italic sm:text-xs ${selected ? "text-white/70" : "text-slate/70"}`}>
              {note}
            </p>
          ) : null}
        </div>
        <span
          className={`inline-flex shrink-0 self-start rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] ${
            selected
              ? "bg-white/15 text-white"
              : disabled
                ? "bg-white text-slate/70"
                : "bg-slate-100 text-slate"
          }`}
        >
          {selected ? "Selected" : meta ?? "Available"}
        </span>
      </div>
    </button>
  );
}

function getAvailabilityMeta(option: SelectableOption) {
  if (option.isUnavailable) {
    return option.badge || "Unavailable";
  }
  if (option.remaining !== null) {
    return `${option.remaining} left`;
  }
  return option.badge || "Available";
}

export function EventBookingFlow({
  event,
  registrationCount,
  registrationState,
  ticketCounts,
  categoryCounts
}: EventBookingFlowProps) {
  const router = useRouter();
  const config = useMemo(() => mergeFormConfig(event.form_config), [event.form_config]);
  const storageKey = `booking-draft-${event.id}`;
  const [hydrated, setHydrated] = useState(false);

  const categories = useMemo<SelectableOption[]>(() => {
    return resolveCategories(config).map((category) => {
      const count = categoryCounts[category.id] ?? 0;
      const isFull = category.capacity ? count >= category.capacity : false;
      return {
        ...category,
        isUnavailable: Boolean(category.soldOut || isFull),
        remaining: category.capacity ? Math.max(category.capacity - count, 0) : null
      };
    });
  }, [config, categoryCounts]);

  const additionalCategories = useMemo<SelectableOption[]>(() => {
    return (config.ticketOptions ?? []).map((ticket) => {
      const count = ticketCounts[ticket.id] ?? 0;
      const isFull = ticket.capacity ? count >= ticket.capacity : false;
      return {
        ...ticket,
        isUnavailable: Boolean(ticket.soldOut || isFull),
        remaining: ticket.capacity ? Math.max(ticket.capacity - count, 0) : null
      };
    });
  }, [config.ticketOptions, ticketCounts]);

  const [step, setStep] = useState<Step>("tickets");
  const [expandedDescription, setExpandedDescription] = useState(false);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(true);
  const [termsExpanded, setTermsExpanded] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(HOLD_DURATION_SECONDS);
  const [submissionState, setSubmissionState] = useState<SubmissionState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpState, setOtpState] = useState<OtpState>("idle");
  const [otpMessage, setOtpMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [emailVerified, setEmailVerified] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [completedRegistration, setCompletedRegistration] = useState<CompletedRegistration | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedAdditionalCategoryId, setSelectedAdditionalCategoryId] = useState<string | null>(null);

  const [form, setForm] = useState(INITIAL_FORM_STATE);

  const emailInputId = useId();
  const uaeResidentSelectId = useId();

  useEffect(() => {
    setSelectedCategoryId((current) => {
      if (categories.some((category) => category.id === current && !category.isUnavailable)) {
        return current;
      }
      return null;
    });
  }, [categories]);

  useEffect(() => {
    setSelectedAdditionalCategoryId((current) => {
      if (!current) {
        return null;
      }
      return additionalCategories.some((category) => category.id === current && !category.isUnavailable)
        ? current
        : null;
    });
  }, [additionalCategories]);

  const saveDraft = useCallback(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({
        form,
        step,
        emailVerified,
        selectedCategoryId,
        selectedAdditionalCategoryId
      }));
    } catch {
      // Ignore storage quota issues in the draft experience.
    }
  }, [form, step, emailVerified, selectedCategoryId, selectedAdditionalCategoryId, storageKey]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft.step) setStep(draft.step);
        if (draft.emailVerified) setEmailVerified(draft.emailVerified);
        if (draft.selectedCategoryId) setSelectedCategoryId(draft.selectedCategoryId);
        if (draft.selectedAdditionalCategoryId !== undefined) setSelectedAdditionalCategoryId(draft.selectedAdditionalCategoryId);
        if (draft.form) {
          setForm((current) => ({
            ...current,
            firstName: draft.form.firstName ?? "",
            lastName: draft.form.lastName ?? "",
            email: draft.form.email ?? "",
            phone: draft.form.phone ?? "",
            age: draft.form.age ?? "",
            uaeResident: draft.form.uaeResident ?? false,
            declarationAccepted: draft.form.declarationAccepted ?? false,
            marketingOptIn: draft.form.marketingOptIn ?? false
          }));
        }
      }
    } catch {
      // Ignore malformed draft payloads.
    }
    setHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (hydrated) saveDraft();
  }, [hydrated, saveDraft]);

  const canProceed = registrationState.state === "open";
  const fullName = `${form.firstName} ${form.lastName}`.trim();
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());
  const showFieldErrors = step === "details" && submitAttempted && submissionState !== "submitting" && !completedRegistration;

  const selectedCategory = categories.find((category) => category.id === selectedCategoryId) ?? null;
  const selectedAdditionalCategory = selectedAdditionalCategoryId
    ? additionalCategories.find((category) => category.id === selectedAdditionalCategoryId) ?? null
    : null;

  const selectionDisplayLabel = selectedCategory
    ? selectedAdditionalCategory
      ? `${selectedCategory.title} + ${selectedAdditionalCategory.title}`
      : selectedCategory.title
    : "Select a category";
  const requestSelectedTicketId = selectedAdditionalCategory?.id ?? "general-admission";
  const requestSelectedTicketTitle = selectedAdditionalCategory?.title ?? "General Admission";

  const requiredErrors = useMemo(() => {
    if (!showFieldErrors) {
      return {
        firstName: false,
        lastName: false,
        email: false,
        emailVerified: false,
        phone: false,
        age: false,
        declarationAccepted: false
      };
    }

    return {
      firstName: !form.firstName.trim(),
      lastName: !form.lastName.trim(),
      email: !form.email.trim() || !isValidEmail,
      emailVerified: !emailVerified,
      phone: !form.phone.trim(),
      age: !form.age.trim(),
      declarationAccepted: !form.declarationAccepted
    };
  }, [emailVerified, form, isValidEmail, showFieldErrors]);

  const phoneErrorMessage = useMemo(() => {
    if (!showFieldErrors) {
      return null;
    }

    if (!form.phone.trim()) {
      return "Phone number is required.";
    }

    if (!isValidPhoneNumber(form.phone)) {
      return PHONE_NUMBER_VALIDATION_MESSAGE;
    }

    return null;
  }, [form.phone, showFieldErrors]);

  const mapLink = config.mapLink ?? null;
  const posterImage = getTicketPosterImageSrc(config);
  const introLine = config.introLine || DEFAULT_INTRO;
  const descriptionParagraphs = config.descriptionParagraphs?.length ? config.descriptionParagraphs : DEFAULT_DESCRIPTION;
  const disclaimerPdfUrl = config.disclaimerPdfUrl === null ? null : (config.disclaimerPdfUrl || DEFAULT_DISCLAIMER_PDF);
  const hasPdf = Boolean(disclaimerPdfUrl);
  const visibleParagraphs = expandedDescription ? descriptionParagraphs : descriptionParagraphs.slice(0, 2);
  const contentLayoutClass = completedRegistration
    ? "block"
    : "grid gap-0 md:grid-cols-[minmax(0,1fr)_300px] lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_360px]";

  useEffect(() => {
    if (step !== "details" || completedRegistration) return;
    setTimeRemaining(HOLD_DURATION_SECONDS);
    const timer = window.setInterval(() => {
      setTimeRemaining((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [step, completedRegistration]);

  async function sendOtp(endpoint: "/api/register/start" | "/api/register/resend-verification") {
    if (!selectedCategory) {
      setOtpMessage({ text: "Select a category before requesting a code.", error: true });
      return;
    }

    if (!form.firstName.trim() || !form.lastName.trim()) {
      setOtpMessage({ text: "Enter your first and last name before requesting a code.", error: true });
      return;
    }

    if (!form.email.trim() || !isValidEmail || !canProceed) {
      setOtpMessage({ text: "Enter a valid email before requesting a code.", error: true });
      return;
    }

    if (form.phone.trim() && !isValidPhoneNumber(form.phone)) {
      setOtpMessage({ text: `Phone number looks invalid. ${PHONE_NUMBER_VALIDATION_MESSAGE}`, error: true });
      return;
    }

    setOtpState("sending");
    setOtpMessage(null);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: event.id,
        selectedTicketId: requestSelectedTicketId,
        selectedTicketTitle: requestSelectedTicketTitle,
        categoryId: selectedCategory.id,
        categoryTitle: selectedCategory.title,
        fullName,
        email: form.email,
        phone: form.phone || undefined,
        ...(form.age.trim() ? { age: Number(form.age) } : {}),
        uaeResident: form.uaeResident,
        website: form.website
      })
    });

    const result = (await response.json()) as {
      outcome?: "pending_verification" | "already_verified";
      message?: string;
      warning?: string;
    };

    if (!response.ok) {
      setOtpState("idle");
      setOtpMessage({ text: result.message ?? "Unable to send verification code.", error: true });
      return;
    }

    const otpText = result.warning
      ? `${result.message ?? "Verification code sent."} Note: ${result.warning}`
      : result.message ?? "Verification code sent.";

    if (result.outcome === "already_verified") {
      setEmailVerified(true);
      setOtpState("idle");
      setOtp("");
      setOtpMessage({ text: otpText, error: false });
      return;
    }

    setOtpState("sent");
    setOtpMessage({ text: otpText, error: false });
  }

  async function verifyOtpCode() {
    if (!otp.trim()) return;
    setVerifyingOtp(true);
    setOtpMessage(null);
    try {
      const response = await fetch("/api/register/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: event.id, email: form.email, otp })
      });
      const result = (await response.json()) as { valid?: boolean; message?: string };
      if (response.ok && result.valid) {
        setEmailVerified(true);
        setOtpMessage(null);
      } else {
        setOtpMessage({ text: result.message ?? "Invalid verification code.", error: true });
      }
    } finally {
      setVerifyingOtp(false);
    }
  }

  async function downloadTicketForAttendee(attendee: CompletedAttendee) {
    const qrSrc = `/api/qr?token=${encodeURIComponent(attendee.qrToken)}`;
    const logoSrc = "/autodrome-header-logo.svg";
    const dateLine = formatTicketDateTimeLine(event);
    const venue = event.venue ?? "Venue to be announced";
    const ticketLabel = buildTicketAdmissionLabel(attendee);
    const manualCheckinCode = attendee.manualCheckinCode?.trim().toUpperCase() || null;

    const logoImage = new window.Image();
    logoImage.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      logoImage.onload = () => resolve();
      logoImage.onerror = () => reject(new Error("logo load failed"));
      logoImage.src = logoSrc;
    }).catch(() => null);

    const qrImage = new window.Image();
    qrImage.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      qrImage.onload = () => resolve();
      qrImage.onerror = () => reject(new Error("qr load failed"));
      qrImage.src = qrSrc;
    }).catch(() => null);

    const W = 900;
    const H = 1300;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#f4f5f7";
    ctx.fillRect(0, 0, W, H);

    const cardX = 50;
    const cardY = 50;
    const cardW = W - 100;
    const cardH = H - 100;
    const radius = 28;

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(cardX + radius, cardY);
    ctx.arcTo(cardX + cardW, cardY, cardX + cardW, cardY + cardH, radius);
    ctx.arcTo(cardX + cardW, cardY + cardH, cardX, cardY + cardH, radius);
    ctx.arcTo(cardX, cardY + cardH, cardX, cardY, radius);
    ctx.arcTo(cardX, cardY, cardX + cardW, cardY, radius);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#0c1723";
    ctx.beginPath();
    ctx.moveTo(cardX + radius, cardY);
    ctx.lineTo(cardX + cardW - radius, cardY);
    ctx.arcTo(cardX + cardW, cardY, cardX + cardW, cardY + radius, radius);
    ctx.lineTo(cardX + cardW, cardY + 200);
    ctx.lineTo(cardX, cardY + 200);
    ctx.lineTo(cardX, cardY + radius);
    ctx.arcTo(cardX, cardY, cardX + radius, cardY, radius);
    ctx.closePath();
    ctx.fill();

    const font = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    let ticketLabelX = cardX + 40;
    if (logoImage.complete && logoImage.naturalWidth > 0) {
      const logoMaxW = 156;
      const logoScale = logoMaxW / logoImage.naturalWidth;
      const logoW = logoMaxW;
      const logoH = Math.max(28, logoImage.naturalHeight * logoScale);
      const logoX = cardX + 40;
      const logoY = cardY + 34;
      ctx.drawImage(logoImage, logoX, logoY, logoW, logoH);
      ticketLabelX = logoX + logoW + 24;
    }

    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = `bold 16px ${font}`;
    ctx.textBaseline = "top";
    ctx.fillText("YOUR EVENT TICKET", ticketLabelX, cardY + 55);

    ctx.fillStyle = "#ffffff";
    ctx.font = `bold 36px ${font}`;
    drawWrappedText(ctx, event.title, cardX + 40, cardY + 95, cardW - 80, 44, 2);

    const rows: Array<[string, string]> = [
      ["ATTENDEE", attendee.fullName],
      ["ADMISSION", ticketLabel],
      ["DATE & TIME", dateLine],
      ["LOCATION", venue]
    ];

    let y = cardY + 250;
    for (let i = 0; i < rows.length; i += 2) {
      const colW = (cardW - 80) / 2;
      for (let c = 0; c < 2 && i + c < rows.length; c++) {
        const [label, value] = rows[i + c];
        const x = cardX + 40 + c * colW;
        ctx.fillStyle = "rgba(15,23,42,0.55)";
        ctx.font = `bold 13px ${font}`;
        ctx.fillText(label, x, y);
        ctx.fillStyle = "#0c1723";
        ctx.font = `600 20px ${font}`;
        drawWrappedText(ctx, value, x, y + 24, colW - 20, 26, 2);
      }
      y += 100;
    }

    const dashY = y + 10;
    ctx.strokeStyle = "rgba(15,23,42,0.2)";
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.moveTo(cardX + 40, dashY);
    ctx.lineTo(cardX + cardW - 40, dashY);
    ctx.stroke();
    ctx.setLineDash([]);

    const qrSize = 360;
    const qrX = cardX + (cardW - qrSize) / 2;
    const qrY = dashY + 40;
    if (qrImage.complete && qrImage.naturalWidth > 0) {
      ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);
    } else {
      ctx.strokeStyle = "rgba(15,23,42,0.2)";
      ctx.strokeRect(qrX, qrY, qrSize, qrSize);
    }

    ctx.fillStyle = "rgba(15,23,42,0.6)";
    ctx.font = `500 18px ${font}`;
    ctx.textAlign = "center";
    ctx.fillText("Present this QR code at check-in", cardX + cardW / 2, qrY + qrSize + 30);
    if (manualCheckinCode) {
      ctx.fillStyle = "rgba(15,23,42,0.55)";
      ctx.font = `bold 14px ${font}`;
      ctx.fillText("MANUAL CODE", cardX + cardW / 2, qrY + qrSize + 64);
      ctx.fillStyle = "#0c1723";
      ctx.font = `800 36px ${font}`;
      ctx.fillText(manualCheckinCode, cardX + cardW / 2, qrY + qrSize + 88);
    }
    ctx.textAlign = "start";

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((result) => resolve(result), "image/png")
    );
    if (!blob) return;

    const safeName = event.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "event";
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeName}-${attendee.fullName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-ticket.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function submitRegistration() {
    if (
      !selectedCategory ||
      !fullName ||
      !form.email ||
      !form.phone ||
      !isValidPhoneNumber(form.phone) ||
      !form.age.trim() ||
      !form.declarationAccepted ||
      !canProceed
    ) {
      return;
    }

    setSubmissionState("submitting");
    setMessage(null);

    const response = await fetch("/api/register/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: event.id,
        selectedTicketId: requestSelectedTicketId,
        selectedTicketTitle: requestSelectedTicketTitle,
        fullName,
        email: form.email,
        phone: form.phone,
        age: Number(form.age),
        uaeResident: form.uaeResident,
        declarationAccepted: true,
        ...(otp.trim() ? { otp } : {}),
        website: form.website,
        categoryId: selectedCategory.id,
        categoryTitle: selectedCategory.title
      })
    });

    const result = (await response.json()) as {
      message?: string;
      registrationId?: string;
      email?: string;
      qrToken?: string;
      manualCheckinCode?: string;
      attendees?: Array<{
        registrationId: string;
        fullName: string;
        qrToken: string;
        manualCheckinCode: string;
        categoryTitle: string;
        ticketTitle: string | null;
        email?: string;
      }>;
    };

    if (!response.ok) {
      setSubmissionState("error");
      setMessage(result.message ?? "Unable to complete the registration.");
      return;
    }

    setSubmissionState("success");
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      // Ignore storage cleanup failures.
    }

    if (result.attendees && result.attendees.length > 0) {
      setCompletedRegistration({
        email: result.email ?? form.email,
        attendees: result.attendees.map((attendee) => ({
          registrationId: attendee.registrationId,
          fullName: attendee.fullName,
          categoryTitle: attendee.categoryTitle,
          ticketTitle: attendee.ticketTitle,
          qrToken: attendee.qrToken,
          manualCheckinCode: attendee.manualCheckinCode,
          email: attendee.email
        }))
      });
    } else {
      setCompletedRegistration({
        email: result.email ?? form.email,
        attendees: [{
          registrationId: result.registrationId,
          fullName,
          categoryTitle: selectedCategory.title,
          ticketTitle: selectedAdditionalCategory?.title ?? null,
          qrToken: result.qrToken ?? "demo",
          manualCheckinCode: result.manualCheckinCode ?? null,
          email: form.email
        }]
      });
    }

    setMessage(result.message ?? "Your ticket QR code has been emailed.");
  }

  function handleBookAgain() {
    setStep("tickets");
    setTimeRemaining(HOLD_DURATION_SECONDS);
    setSubmissionState("idle");
    setMessage(null);
    setSubmitAttempted(false);
    setOtp("");
    setOtpState("idle");
    setOtpMessage(null);
    setEmailVerified(false);
    setCompletedRegistration(null);
    setSelectedCategoryId(null);
    setSelectedAdditionalCategoryId(null);
    setForm(INITIAL_FORM_STATE);

    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      // Ignore storage cleanup failures.
    }

    router.refresh();

    if (typeof window !== "undefined") {
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: "auto" });
      });
    }
  }

  const confirmedAttendee = completedRegistration?.attendees[0] ?? null;
  const canContinueFromTickets = canProceed;
  const categorySectionTitle = config.categoriesLabel || "Category";
  const additionalSectionTitle = config.ticketOptionsLabel || "Additional category";

  return (
    <div className="w-full">
      <div className="overflow-hidden rounded-2xl border border-slate/10 bg-white shadow-soft">
        <div className="flex items-center justify-between border-b border-slate/10 px-3 py-2 sm:px-6 sm:py-3">
          <div>
            {step === "details" && !completedRegistration ? (
              <button
                type="button"
                onClick={() => {
                  setStep("tickets");
                  setSubmissionState("idle");
                  setMessage(null);
                  setOtpState("idle");
                  setOtp("");
                  setOtpMessage(null);
                  setEmailVerified(false);
                }}
                className="inline-flex items-center gap-2 rounded-xl p-1.5 text-sm text-slate transition hover:bg-mist hover:text-ink sm:rounded-2xl sm:px-2 sm:py-2"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            ) : (
              <div className="h-8 sm:h-10" />
            )}
          </div>

          {step === "details" && !completedRegistration ? (
            <div className="rounded-xl border border-slate/15 bg-white px-3 py-1.5 text-xs font-medium text-ink shadow-sm sm:rounded-2xl sm:px-4 sm:py-2 sm:text-sm">
              Time remaining: {formatTimer(timeRemaining)}
            </div>
          ) : (
            <div />
          )}
        </div>

        <div className={contentLayoutClass}>
          <div className="px-3.5 py-4 sm:px-6 sm:py-7 lg:px-8 lg:py-8">
            {completedRegistration && confirmedAttendee ? (
              <div className="mx-auto max-w-5xl">
                <div className="flex flex-col items-center pb-6 pt-1 text-center sm:pb-8 sm:pt-2">
                  <CheckCircle2 className="h-10 w-10 text-[#2c7a86] sm:h-12 sm:w-12" />
                  <h1 className="mt-3 font-title text-xl font-black italic leading-tight tracking-tight text-ink sm:mt-4 sm:text-3xl">
                    Registration complete!
                  </h1>
                  <Button
                    type="button"
                    onClick={handleBookAgain}
                    className="mt-3 rounded-2xl px-5 sm:mt-4"
                  >
                    Book again
                  </Button>
                  <p className="mt-1.5 text-[13px] text-slate sm:mt-2 sm:text-sm">
                    A confirmation email will be sent to {completedRegistration.email}
                  </p>
                  {message ? <p className="mt-2 text-[13px] text-slate sm:mt-3 sm:text-sm">{message}</p> : null}
                </div>
                <EventTicketCard
                  event={event}
                  attendee={confirmedAttendee}
                  qrSrc={`/api/qr?token=${encodeURIComponent(confirmedAttendee.qrToken)}`}
                  mapLink={mapLink}
                  onDownload={() => downloadTicketForAttendee(confirmedAttendee)}
                />
              </div>
            ) : step === "tickets" ? (
              <div className="max-w-3xl">
                <h1 className="font-title text-3xl font-black italic leading-[1.1] tracking-tight text-ink sm:text-5xl">{event.title}</h1>
                <p className="mt-2 font-body text-sm leading-relaxed text-slate sm:mt-3 sm:text-lg">{introLine}</p>

                <div className="mt-3 space-y-1.5 font-body text-[13px] leading-relaxed text-slate sm:text-[15px]">
                  {visibleParagraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setExpandedDescription((current) => !current)}
                  className="mt-1.5 font-display text-[13px] font-bold text-[#2e768b] transition hover:text-[#205260] sm:text-sm"
                >
                  {expandedDescription ? "Show less ^" : "Show more v"}
                </button>

                <div className="mt-6 space-y-2.5 border-t border-slate/10 pt-5 font-body text-[13px] text-slate sm:mt-10 sm:space-y-3 sm:pt-7 sm:text-[15px]">
                  <p>
                    <span className="font-display font-bold tracking-tight text-ink">Location:</span> {event.venue ?? "Venue to be announced"}
                    {mapLink ? (
                      <>
                        {" — "}
                        <a
                          href={mapLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-display font-bold text-[#2e768b] transition hover:text-[#205260]"
                        >
                          <MapPin className="inline h-3.5 w-3.5" />
                          View on map
                        </a>
                      </>
                    ) : null}
                  </p>
                  <p>
                    <span className="font-display font-bold tracking-tight text-ink">Date and time:</span> {formatTicketDateTimeLine(event)}
                  </p>
                </div>

                <div className="mt-6 border-t border-slate/10 pt-5 sm:mt-10 sm:pt-7">
                  <p className="font-display text-[11px] font-bold uppercase tracking-[0.2em] text-slate sm:text-xs">Booking</p>

                  <div className="mt-4 space-y-6 sm:mt-6 sm:space-y-8">
                    <div className="rounded-[1.75rem] border border-slate/10 bg-white/70 px-4 py-4 sm:px-5 sm:py-5">
                      <div className="space-y-2.5">
                        <p className={BOOKING_SECTION_HEADING_CLASS}>{categorySectionTitle}</p>
                        <p className="font-body text-[13px] leading-relaxed text-slate sm:text-sm">
                          Select a category.
                        </p>
                      </div>

                      <div className="mt-3 space-y-2.5 sm:mt-4">
                        {categories.map((category) => (
                          <SelectionCard
                            key={category.id}
                            title={category.title}
                            description={category.description}
                            note={category.note}
                            meta={getAvailabilityMeta(category)}
                            selected={selectedCategoryId === category.id}
                            disabled={category.isUnavailable}
                            onClick={() => {
                              setSelectedCategoryId(category.id);
                              setMessage(null);
                            }}
                          />
                        ))}
                      </div>
                    </div>

                    {additionalCategories.length > 0 ? (
                      <div className="rounded-[1.75rem] border border-slate/10 bg-white/70 px-4 py-4 sm:px-5 sm:py-5">
                        <div className="space-y-2.5">
                          <p className={BOOKING_SECTION_HEADING_CLASS}>{additionalSectionTitle}</p>
                          <p className="font-body text-[13px] leading-relaxed text-slate sm:text-sm">
                            Optional. Add one extra session if you want one.
                          </p>
                        </div>

                        <div className="mt-3 space-y-2.5 sm:mt-4">
                          {additionalCategories.map((category) => (
                            <SelectionCard
                              key={category.id}
                              title={category.title}
                              description={category.description}
                              note={category.note}
                              meta={getAvailabilityMeta(category)}
                              selected={selectedAdditionalCategoryId === category.id}
                              disabled={category.isUnavailable}
                              onClick={() => {
                                setSelectedAdditionalCategoryId((current) => current === category.id ? null : category.id);
                                setMessage(null);
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {registrationState.state !== "open" ? (
                    <p className="mt-3 rounded-xl bg-rose-50 px-3.5 py-2.5 text-[13px] text-rose-700 sm:mt-4 sm:rounded-2xl sm:px-4 sm:py-3 sm:text-sm">
                      {registrationState.label}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="max-w-3xl">
                <h1 className="font-title text-2xl font-black italic leading-tight tracking-tight text-ink sm:text-4xl">{event.title}</h1>
                <p className="mt-1 text-[13px] leading-snug text-slate sm:mt-2 sm:text-base">{formatTicketDateTimeLine(event)}</p>

                {selectedCategory ? (
                  <div className="mt-5 rounded-2xl border border-slate/10 bg-[#fbfbfc] px-4 py-3 sm:mt-7 sm:px-5 sm:py-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate">Selected admission</p>
                    <div className="mt-2 rounded-2xl border border-slate/10 bg-white px-4 py-3">
                      <p className="font-display text-[15px] font-bold tracking-tight text-ink sm:text-base">
                        {selectionDisplayLabel}
                      </p>
                    </div>
                  </div>
                ) : null}

                <div className="mt-5 border-t border-slate/10 pt-5 sm:mt-8 sm:pt-7">
                  <p className="text-[13px] font-semibold uppercase tracking-[0.03em] text-ink sm:text-[15px]">Contact information</p>

                  <div className="mt-4 grid gap-3 sm:mt-6 sm:gap-4 sm:grid-cols-2">
                    <Field label="First name" hint="Required">
                      <Input
                        value={form.firstName}
                        onChange={(e) => setForm((current) => ({ ...current, firstName: e.target.value }))}
                        aria-invalid={requiredErrors.firstName}
                        className={`rounded-2xl px-3.5 py-3 ${requiredErrors.firstName ? "border-rose-400 focus-visible:ring-rose-400" : "border-slate/25"}`}
                      />
                      {requiredErrors.firstName ? <p className="mt-2 text-sm text-rose-700">First name is required.</p> : null}
                    </Field>
                    <Field label="Last name" hint="Required">
                      <Input
                        value={form.lastName}
                        onChange={(e) => setForm((current) => ({ ...current, lastName: e.target.value }))}
                        aria-invalid={requiredErrors.lastName}
                        className={`rounded-2xl px-3.5 py-3 ${requiredErrors.lastName ? "border-rose-400 focus-visible:ring-rose-400" : "border-slate/25"}`}
                      />
                      {requiredErrors.lastName ? <p className="mt-2 text-sm text-rose-700">Last name is required.</p> : null}
                    </Field>
                  </div>

                  <div className="mt-3 sm:mt-5">
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                      <Field label="Email address" hint="Required" htmlFor={emailInputId}>
                        <Input
                          id={emailInputId}
                          type="email"
                          value={form.email}
                          onChange={(e) => {
                            const newEmail = e.target.value;
                            setForm((current) => ({ ...current, email: newEmail }));
                            if (emailVerified) {
                              setEmailVerified(false);
                              setOtpState("idle");
                              setOtp("");
                              setOtpMessage(null);
                            }
                          }}
                          aria-invalid={requiredErrors.email || requiredErrors.emailVerified}
                          className={`rounded-2xl px-3.5 py-3 ${
                            requiredErrors.email || requiredErrors.emailVerified
                              ? "border-rose-400 focus-visible:ring-rose-400"
                              : "border-slate/25"
                          }`}
                        />
                      </Field>

                      {!emailVerified && otpState !== "sent" ? (
                        <Button
                          type="button"
                          onClick={async () => { await sendOtp("/api/register/start"); }}
                          disabled={otpState === "sending" || !form.firstName.trim() || !form.lastName.trim() || !form.email.trim() || !isValidEmail}
                          className="h-[46px] rounded-2xl px-5"
                        >
                          {otpState === "sending" ? "Sending..." : "Verify email"}
                        </Button>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm text-slate">This will be used for your confirmation email.</p>
                    {requiredErrors.email ? (
                      <p className="mt-2 text-sm text-rose-700">Enter a valid email address.</p>
                    ) : requiredErrors.emailVerified ? (
                      <p className="mt-2 text-sm text-rose-700">Please verify your email.</p>
                    ) : null}
                    {emailVerified ? (
                      <div className="mt-4 flex items-center gap-2 text-sm font-medium text-emerald-600">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Email verified</span>
                      </div>
                    ) : otpState === "sent" ? (
                      <div className="mt-4 space-y-3">
                        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                          <Input
                            value={otp}
                            onChange={(e) => setOtp(e.target.value)}
                            placeholder="Enter 6-digit code"
                            className="rounded-2xl border-slate/25 px-3.5 py-3"
                          />
                          <Button
                            type="button"
                            onClick={() => { void verifyOtpCode(); }}
                            disabled={verifyingOtp || !otp.trim()}
                            className="rounded-2xl px-5 py-3"
                          >
                            {verifyingOtp ? "Verifying..." : "Verify OTP"}
                          </Button>
                        </div>
                        <button
                          type="button"
                          onClick={async () => { await sendOtp("/api/register/resend-verification"); }}
                          disabled={verifyingOtp}
                          className="text-sm font-medium text-[#2e768b] transition hover:text-[#205260]"
                        >
                          Didn&apos;t receive a code? Resend OTP
                        </button>
                      </div>
                    ) : null}
                    {otpMessage ? (
                      <p className={`mt-2 text-sm ${otpMessage.error ? "text-rose-600" : "text-slate"}`}>
                        {otpMessage.text}
                      </p>
                    ) : null}
                  </div>

                  <div className="mt-3 grid gap-3 sm:mt-5 sm:gap-4 sm:grid-cols-2">
                    <Field label="Phone number" hint="Required">
                      <Input
                        value={form.phone}
                        onChange={(e) => setForm((current) => ({ ...current, phone: e.target.value }))}
                        aria-invalid={Boolean(phoneErrorMessage)}
                        className={`rounded-2xl px-3.5 py-3 ${phoneErrorMessage ? "border-rose-400 focus-visible:ring-rose-400" : "border-slate/25"}`}
                      />
                      {phoneErrorMessage ? <p className="mt-2 text-sm text-rose-700">{phoneErrorMessage}</p> : null}
                    </Field>
                    <Field label="Age" hint="Required">
                      <Input
                        type="number"
                        min={1}
                        max={120}
                        value={form.age}
                        onChange={(e) => setForm((current) => ({ ...current, age: e.target.value }))}
                        aria-invalid={requiredErrors.age}
                        className={`rounded-2xl px-3.5 py-3 ${requiredErrors.age ? "border-rose-400 focus-visible:ring-rose-400" : "border-slate/25"}`}
                      />
                      {requiredErrors.age ? <p className="mt-2 text-sm text-rose-700">Age is required.</p> : null}
                    </Field>
                  </div>

                  <div className="mt-3 grid gap-3 sm:mt-5 sm:gap-4 sm:grid-cols-2">
                    <Field
                      label={`UAE resident — ${form.uaeResident ? "Yes" : "No"}`}
                      hint="Required"
                      htmlFor={uaeResidentSelectId}
                    >
                      <Select
                        id={uaeResidentSelectId}
                        value={form.uaeResident ? "yes" : "no"}
                        onChange={(e) => setForm((current) => ({ ...current, uaeResident: e.target.value === "yes" }))}
                        className="rounded-md border-slate/25 bg-white px-3 py-2 text-sm focus:border-ink focus:ring-1 focus:ring-ink"
                      >
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </Select>
                    </Field>
                  </div>
                </div>

                <div className="mt-5 space-y-3 border-t border-slate/10 pt-5 text-[13px] leading-relaxed text-slate text-justify sm:mt-8 sm:space-y-4 sm:pt-7 sm:text-[15px]">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[13px] font-semibold uppercase tracking-[0.03em] text-ink sm:text-[15px]">
                      Terms & Conditions
                    </p>
                    {hasPdf ? (
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setPdfPreviewOpen((value) => !value)}
                          className="text-sm font-medium text-[#2e768b] transition hover:text-[#205260]"
                        >
                          {pdfPreviewOpen ? "Hide preview" : "Show preview"}
                        </button>
                        <a
                          href={disclaimerPdfUrl!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hidden items-center gap-1.5 text-sm font-medium text-[#2e768b] transition hover:text-[#205260] sm:inline-flex"
                        >
                          <FileText className="h-4 w-4" />
                          Open full PDF
                        </a>
                      </div>
                    ) : null}
                  </div>
                  {hasPdf && pdfPreviewOpen ? (
                    <div className="mt-1">
                      <div
                        className="relative overflow-auto rounded-2xl border border-slate/15 [-webkit-overflow-scrolling:touch]"
                        style={{ maxHeight: "60vh" }}
                      >
                        <PdfViewer src={disclaimerPdfUrl!} className="w-full" />
                      </div>

                      <a
                        href={disclaimerPdfUrl!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm font-semibold text-ink shadow-sm transition active:bg-mist sm:hidden"
                      >
                        <FileText className="h-4 w-4 text-[#2e768b]" />
                        View full PDF
                      </a>
                    </div>
                  ) : null}
                  <div>
                    <p className={termsExpanded ? "" : "line-clamp-5"}>
                      {event.declaration_text}
                    </p>
                    {event.declaration_text && event.declaration_text.length > 120 ? (
                      <button
                        type="button"
                        onClick={() => setTermsExpanded((value) => !value)}
                        className="mt-1 text-sm font-medium text-[#2e768b] transition hover:text-[#205260]"
                      >
                        {termsExpanded ? (
                          <>View less <ChevronUp className="inline h-4 w-4" /></>
                        ) : (
                          <>View more <ChevronDown className="inline h-4 w-4" /></>
                        )}
                      </button>
                    ) : null}
                  </div>

                  <label className="flex items-start gap-3 text-[15px] leading-snug text-slate">
                    <Checkbox
                      checked={form.declarationAccepted}
                      onChange={(e) => setForm((current) => ({ ...current, declarationAccepted: e.target.checked }))}
                      className="mt-1 rounded border-slate/35"
                    />
                    <span className={requiredErrors.declarationAccepted ? "text-rose-700" : ""}>
                      I agree to the Terms & Conditions
                    </span>
                  </label>
                  {requiredErrors.declarationAccepted ? (
                    <p className="text-sm text-rose-700">You must accept the Terms & Conditions.</p>
                  ) : null}

                  <label className="flex items-start gap-3 text-[15px] leading-snug text-slate">
                    <Checkbox
                      checked={form.marketingOptIn}
                      onChange={(e) => setForm((current) => ({ ...current, marketingOptIn: e.target.checked }))}
                      className="mt-1 rounded border-slate/35"
                    />
                    <span>I would like to receive your marketing emails.</span>
                  </label>
                </div>

                <input
                  tabIndex={-1}
                  autoComplete="off"
                  className="hidden"
                  name="website"
                  value={form.website}
                  onChange={(e) => setForm((current) => ({ ...current, website: e.target.value }))}
                />

                {message && (submissionState === "error" || submissionState === "success") ? (
                  <div
                    className={`mt-6 rounded-2xl px-4 py-3 text-sm ${
                      submissionState === "error" ? "bg-rose-100 text-rose-900" : "bg-emerald-100 text-emerald-900"
                    }`}
                  >
                    {message}
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {!completedRegistration ? (
            <aside className="border-t border-slate/10 bg-[linear-gradient(180deg,#fbfbfc_0%,#f3f9fc_100%)] px-3.5 py-4 sm:px-6 sm:py-8 md:border-l md:border-t-0 lg:px-8">
              <div className="lg:sticky lg:top-6">
                <div className="mx-auto hidden max-w-[276px] overflow-hidden rounded-2xl border border-slate/10 bg-white sm:block">
                  <div className="relative bg-white">
                    <img src={posterImage} alt={event.title} className="block h-auto w-full" loading="lazy" decoding="async" />
                  </div>
                </div>

                <div className="mt-2 rounded-[1.75rem] border border-white/70 bg-white/80 p-4 shadow-soft backdrop-blur-sm sm:mt-6 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
                  <h3 className="font-title text-xl font-black italic leading-tight tracking-tight text-ink sm:text-2xl lg:text-[2rem]">Registration summary</h3>

                  <div className="mt-3 rounded-[1.5rem] border border-slate/10 bg-white px-4 py-4 shadow-sm sm:mt-6 sm:space-y-4 sm:px-5 sm:py-5">
                    <div className="border-b border-slate/10 pb-3 font-body text-[13px] text-slate sm:text-[15px]">
                      <p className="font-display font-bold tracking-tight text-ink">Selected admission</p>
                      <p className="mt-1 text-sm text-slate">{selectionDisplayLabel}</p>
                    </div>

                    <div className="mt-3 space-y-1.5 font-body text-[12px] sm:space-y-2 sm:text-sm">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        <span className="line-clamp-1">{event.venue ?? "Venue to be announced"}</span>
                      </div>
                      {mapLink ? (
                        <a
                          href={mapLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 font-medium text-[#2e768b] transition hover:text-[#205260]"
                        >
                          <MapPin className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                          <span>View on map</span>
                        </a>
                      ) : null}
                      <div className="flex items-center gap-2">
                        <Clock3 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        <span>{formatTicketDateTimeLine(event)}</span>
                      </div>
                    </div>
                  </div>

                    <Button
                      type="button"
                      onClick={() => {
                        if (step === "tickets") {
                          if (!canProceed) return;
                          if (!selectedCategory) {
                            setMessage("Please select a category to continue.");
                            return;
                          }
                          if (selectedCategory.isUnavailable) {
                            setMessage("That category is no longer available. Please choose another one.");
                            return;
                          }
                          setStep("details");
                          setMessage(null);
                          if (typeof window !== "undefined") {
                            requestAnimationFrame(() => {
                              window.scrollTo({ top: 0, behavior: "auto" });
                          });
                        }
                        return;
                      }

                      if (submissionState === "submitting") return;
                      setSubmitAttempted(true);

                      if (timeRemaining === 0) {
                        setMessage("Your hold expired. Go back and continue again to restart the session.");
                        return;
                      }
                      if (!selectedCategory) {
                        setMessage("Please select a category.");
                        return;
                      }
                      if (!form.firstName.trim() || !form.lastName.trim()) {
                        setMessage("Please enter your first and last name.");
                        return;
                      }
                      if (!form.email.trim()) {
                        setMessage("Please enter your email address.");
                        return;
                      }
                      if (!emailVerified) {
                        setMessage("Please verify your email above to complete registration.");
                        return;
                      }
                      if (!form.phone.trim()) {
                        setMessage("Please enter your phone number.");
                        return;
                      }
                      if (!form.age.trim()) {
                        setMessage("Please enter your age.");
                        return;
                      }
                      if (!form.declarationAccepted) {
                        setMessage("Please accept the Terms & Conditions.");
                        return;
                      }

                      void submitRegistration();
                    }}
                    disabled={step === "tickets" ? !canContinueFromTickets : submissionState === "submitting"}
                    className="mt-4 w-full rounded-xl bg-black py-2.5 font-display text-[14px] font-bold tracking-tight text-white shadow-[0_18px_40px_-24px_rgba(15,23,42,0.45)] hover:bg-black/90 sm:mt-6 sm:rounded-2xl sm:py-3.5 sm:text-base"
                  >
                    {step === "tickets"
                      ? "Continue"
                      : submissionState === "submitting"
                        ? "Completing registration..."
                        : "Complete registration"}
                  </Button>

                  {message && submissionState !== "submitting" ? (
                    <p className="mt-3 text-sm text-rose-700">{message}</p>
                  ) : null}
                </div>
              </div>
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  );
}
