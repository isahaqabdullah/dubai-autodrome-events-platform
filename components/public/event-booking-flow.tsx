"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CalendarDays, CheckCircle2, ChevronDown, ChevronUp, Clock3, Download, FileText, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { EventRecord, RegistrationWindowState } from "@/lib/types";
import { mergeFormConfig } from "@/lib/utils";
import { PdfViewer } from "@/components/public/pdf-viewer";

interface EventBookingFlowProps {
  event: EventRecord;
  registrationCount: number;
  registrationState: RegistrationWindowState;
  ticketCounts: Record<string, number>;
}

type Step = "tickets" | "details";
type SubmissionState = "idle" | "submitting" | "success" | "error";
type OtpState = "idle" | "sending" | "sent";

interface CompletedRegistration {
  email: string;
  qrToken: string;
  ticketTitle: string;
}

const HOLD_DURATION_SECONDS = 25 * 60;
const TRAIN_WITH_DUBAI_POLICE_INTRO = "Hit the track for free. Dubai Police has you covered!";
const TRAIN_WITH_DUBAI_POLICE_DESCRIPTION = [
  "Join us at Dubai Autodrome for the region's premier community fitness night! In a shared commitment to community health, wellness, and safety, we are thrilled to announce Train With Dubai Police.",
  "The best part? Dubai Police has your entry completely covered, making it 100% free for all participants. Join us on our Circuit under the lights for an unforgettable, high-energy evening of cycling, running, and specialized bootcamps.",
  "Registration is required, so secure your free spot today and let's hit the track!"
];

function formatEventDateTimeLine(event: EventRecord) {
  const start = new Date(event.start_at);
  const end = new Date(event.end_at);
  const datePart = new Intl.DateTimeFormat("en-US", {
    timeZone: event.timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(start);
  const timePart = new Intl.DateTimeFormat("en-US", {
    timeZone: event.timezone,
    hour: "numeric",
    minute: "2-digit"
  });

  return `${datePart} ${timePart.format(start)} - ${timePart.format(end)}`;
}

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

export function EventBookingFlow({
  event,
  registrationCount,
  registrationState,
  ticketCounts
}: EventBookingFlowProps) {
  const config = useMemo(() => mergeFormConfig(event.form_config), [event.form_config]);
  const storageKey = `booking-draft-${event.id}`;
  const hydrated = useRef(false);

  function loadDraft() {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return null;
  }

  const draft = hydrated.current ? null : loadDraft();

  const [step, setStep] = useState<Step>(draft?.step ?? "tickets");
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
  const [emailVerified, setEmailVerified] = useState(draft?.emailVerified ?? false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [completedRegistration, setCompletedRegistration] = useState<CompletedRegistration | null>(null);
  const [form, setForm] = useState({
    firstName: draft?.form?.firstName ?? "",
    lastName: draft?.form?.lastName ?? "",
    email: draft?.form?.email ?? "",
    phone: draft?.form?.phone ?? "",
    age: draft?.form?.age ?? "",
    uaeResident: draft?.form?.uaeResident ?? false,
    declarationAccepted: draft?.form?.declarationAccepted ?? false,
    marketingOptIn: draft?.form?.marketingOptIn ?? false,
    website: ""
  });
  const [selectedBootcampId, setSelectedBootcampId] = useState<string | null>(draft?.selectedBootcampId ?? null);

  const saveDraft = useCallback(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({
        form, step, emailVerified, selectedBootcampId
      }));
    } catch { /* quota exceeded — ignore */ }
  }, [form, step, emailVerified, selectedBootcampId, storageKey]);

  useEffect(() => {
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (hydrated.current) saveDraft();
  }, [saveDraft]);



  const ticketOptions = useMemo(
    () => {
      const bootcamps = (config.ticketOptions ?? []).map((ticket) => {
        const count = ticketCounts[ticket.id] ?? 0;
        const isMaxed = ticket.capacity ? count >= ticket.capacity : false;
        const isSoldOut = ticket.soldOut || isMaxed;

        return {
          ...ticket,
          badge: isSoldOut ? (ticket.badge || "Maxed out") : ticket.badge,
          soldOut: isSoldOut
        };
      });

      return [
        {
          id: "general-admission",
          title: "General Admission",
          description:
            "Admission is free and valid for one attendee. Complete registration to secure your place for this event edition.",
          note: `One attendee per submission. Remaining places: ${
            event.capacity ? Math.max(event.capacity - registrationCount, 0) : "Open"
          }`,
          badge: undefined as string | undefined,
          soldOut: registrationState.state !== "open"
        },
        ...bootcamps
      ];
    },
    [config.ticketOptions, event.capacity, registrationCount, registrationState.state, ticketCounts]
  );
  const generalAdmission = ticketOptions[0];
  const bootcampOptions = ticketOptions.slice(1);
  const selectedBootcamp = selectedBootcampId
    ? bootcampOptions.find((ticket) => ticket.id === selectedBootcampId) ?? null
    : null;
  const selectedTicketId = selectedBootcamp ? selectedBootcamp.id : "general-admission";
  const selectedTicketTitle = selectedBootcamp
    ? `General Admission with ${selectedBootcamp.title}`
    : "General Admission";
  const canProceed = registrationState.state === "open" && !generalAdmission.soldOut;
  const fullName = `${form.firstName} ${form.lastName}`.trim();
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());
  const showFieldErrors = step === "details" && submitAttempted && submissionState !== "submitting" && !completedRegistration;
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
  const mapLink = config.mapLink ?? null;
  const descriptionParagraphs = TRAIN_WITH_DUBAI_POLICE_DESCRIPTION;
  const visibleParagraphs = expandedDescription ? descriptionParagraphs : descriptionParagraphs.slice(0, 2);
  const contentLayoutClass = completedRegistration
    ? "block"
    : "grid gap-0 md:grid-cols-[minmax(0,1fr)_300px] lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_360px]";

  useEffect(() => {
    if (step !== "details" || completedRegistration) {
      return;
    }

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
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim() || !isValidEmail || !canProceed) {
      setOtpMessage({ text: "Enter first name, last name, and a valid email before requesting a code.", error: true });
      return;
    }

    setOtpState("sending");
    setOtpMessage(null);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        eventId: event.id,
        selectedTicketId,
        selectedTicketTitle,
        fullName,
        email: form.email,
        phone: form.phone || undefined,
        ...(form.age.trim() ? { age: Number(form.age) } : {}),
        uaeResident: form.uaeResident,
        website: form.website
      })
    });

    const result = (await response.json()) as { message?: string };

    if (!response.ok) {
      setOtpState("idle");
      setOtpMessage({ text: result.message ?? "Unable to send verification code.", error: true });
      return;
    }

    setOtpState("sent");
    setOtpMessage({ text: result.message ?? "Verification code sent.", error: false });
  }

  async function verifyOtpCode() {
    if (!otp.trim()) return;

    setVerifyingOtp(true);
    setOtpMessage(null);

    try {
      const response = await fetch("/api/register/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: event.id,
          email: form.email,
          otp
        })
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

  async function downloadTicket() {
    if (!completedRegistration) {
      return;
    }

    const qrSrc = `/api/qr?token=${encodeURIComponent(completedRegistration.qrToken)}`;
    const dateLine = formatEventDateTimeLine(event);
    const venue = event.venue ?? "Venue to be announced";

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
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = `bold 16px ${font}`;
    ctx.textBaseline = "top";
    ctx.fillText("YOUR EVENT TICKET", cardX + 40, cardY + 55);

    ctx.fillStyle = "#ffffff";
    ctx.font = `bold 36px ${font}`;
    drawWrappedText(ctx, event.title, cardX + 40, cardY + 95, cardW - 80, 44, 2);

    const rows: Array<[string, string]> = [
      ["ATTENDEE", fullName],
      ["ADMISSION", completedRegistration.ticketTitle],
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
    ctx.textAlign = "start";

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((result) => resolve(result), "image/png")
    );
    if (!blob) return;

    const safeName = event.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "event";
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeName}-ticket.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function submitRegistration() {
    if (!fullName || !form.email || !form.phone || !form.age.trim() || !form.declarationAccepted || !canProceed || !otp.trim()) {
      return;
    }

    setSubmissionState("submitting");
    setMessage(null);

    const response = await fetch("/api/register/confirm", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        eventId: event.id,
        selectedTicketId,
        selectedTicketTitle,
        fullName,
        email: form.email,
        phone: form.phone,
        age: Number(form.age),
        uaeResident: form.uaeResident,
        declarationAccepted: true,
        otp,
        website: form.website
      })
    });

    const result = (await response.json()) as {
      message?: string;
      email?: string;
      qrToken?: string;
      ticketTitle?: string;
    };

    if (!response.ok) {
      setSubmissionState("error");
      setMessage(result.message ?? "Unable to complete the registration.");
      return;
    }

    setSubmissionState("success");
    try { sessionStorage.removeItem(storageKey); } catch { /* ignore */ }
    setCompletedRegistration({
      email: result.email ?? form.email,
      qrToken: result.qrToken ?? "demo",
      ticketTitle: result.ticketTitle ?? selectedTicketTitle
    });
    setMessage(result.message ?? "Your ticket QR code has been emailed.");
  }

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
            {completedRegistration ? (
              <div className="mx-auto max-w-2xl">
                <div className="flex flex-col items-center pb-6 pt-1 text-center sm:pb-8 sm:pt-2">
                  <CheckCircle2 className="h-10 w-10 text-[#2c7a86] sm:h-12 sm:w-12" />
                  <h1 className="mt-3 font-title text-xl font-black italic leading-tight tracking-tight text-ink sm:mt-4 sm:text-3xl">Registration complete!</h1>
                  <p className="mt-1.5 text-[13px] text-slate sm:mt-2 sm:text-sm">A confirmation email will be sent to {completedRegistration.email}</p>
                  {message ? <p className="mt-2 text-[13px] text-slate sm:mt-3 sm:text-sm">{message}</p> : null}
                </div>

                <div className="overflow-hidden rounded-2xl border border-slate/10 bg-white shadow-soft">
                  <div className="relative">
                    <img
                      src="/train-with-dubai-police-cover.png"
                      alt={event.title}
                      className="block w-full h-auto"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0c1723]/90 via-[#0c1723]/30 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 px-4 pb-4 sm:px-8 sm:pb-7">
                      <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-white/50 sm:text-xs">Your event ticket</p>
                      <h2 className="mt-1 font-title text-base font-black italic leading-tight tracking-tight text-white sm:mt-1.5 sm:text-xl lg:text-2xl">{event.title}</h2>
                    </div>
                  </div>

                  <div className="px-4 py-4 sm:px-8 sm:py-8">
                    <div className="grid gap-4 sm:gap-6 sm:grid-cols-2">
                      <div className="space-y-0.5 sm:space-y-1">
                        <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate/60 sm:text-[10px]">Attendee</p>
                        <p className="text-[13px] font-semibold text-ink sm:text-base">{fullName}</p>
                      </div>
                      <div className="space-y-0.5 sm:space-y-1">
                        <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate/60 sm:text-[10px]">Admission</p>
                        <p className="text-[13px] font-semibold text-ink sm:text-base">{completedRegistration.ticketTitle}</p>
                      </div>
                      <div className="space-y-0.5 sm:space-y-1">
                        <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate/60 sm:text-[10px]">Date & time</p>
                        <div className="flex items-start gap-2 text-[13px] text-ink sm:gap-2.5 sm:text-[15px]">
                          <CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#2c7a86] sm:h-4 sm:w-4" />
                          <span>{formatEventDateTimeLine(event)}</span>
                        </div>
                      </div>
                      <div className="space-y-0.5 sm:space-y-1">
                        <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate/60 sm:text-[10px]">Location</p>
                        <div className="flex items-start gap-2 text-[13px] text-ink sm:gap-2.5 sm:text-[15px]">
                          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#2c7a86] sm:h-4 sm:w-4" />
                          <span>{event.venue ?? "Venue to be announced"}</span>
                        </div>
                        {mapLink ? (
                          <a
                            href={mapLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1.5 inline-flex items-center gap-1.5 text-sm font-medium text-[#2e768b] transition hover:text-[#205260]"
                          >
                            <MapPin className="h-3.5 w-3.5" />
                            View on map
                          </a>
                        ) : null}
                      </div>
                    </div>

                    <div className="relative mt-6 pt-6 sm:mt-8 sm:pt-8">
                      <div className="absolute inset-x-0 top-0 flex items-center" aria-hidden="true">
                        <div className="absolute -left-4 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-[#fbfbfc] sm:-left-8" />
                        <div className="w-full border-t border-dashed border-slate/15" />
                        <div className="absolute -right-4 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-[#fbfbfc] sm:-right-8" />
                      </div>
                      <div className="flex flex-col items-center">
                        <div className="rounded-xl border border-slate/10 bg-white p-2.5 shadow-sm sm:rounded-2xl sm:p-3">
                          <img
                            src={`/api/qr?token=${encodeURIComponent(completedRegistration.qrToken)}`}
                            alt="Ticket QR code"
                            className="block h-auto w-[160px] sm:w-[200px]"
                          />
                        </div>
                        <p className="mt-3 text-center text-[13px] font-medium text-slate sm:mt-4 sm:text-sm">
                          Present this QR code at check-in
                        </p>
                        <button
                          type="button"
                          onClick={downloadTicket}
                          className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate/20 bg-white px-4 py-2 text-[13px] font-semibold text-ink shadow-sm transition hover:bg-mist sm:mt-5 sm:rounded-2xl sm:px-5 sm:py-2.5 sm:text-sm"
                        >
                          <Download className="h-4 w-4" />
                          Download ticket
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : step === "tickets" ? (
              <div className="max-w-3xl">
                <h1 className="font-title text-2xl font-black italic leading-tight tracking-tight text-ink sm:text-4xl">{event.title}</h1>
                <p className="mt-1 text-[13px] leading-snug text-slate sm:text-base">{TRAIN_WITH_DUBAI_POLICE_INTRO}</p>

                <div className="mt-2 space-y-0.5 text-[13px] leading-snug text-slate sm:text-[15px]">
                  {visibleParagraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setExpandedDescription((current) => !current)}
                  className="mt-1 text-[13px] font-semibold text-[#2e768b] transition hover:text-[#205260] sm:text-sm"
                >
                  {expandedDescription ? "Show less ^" : "Show more v"}
                </button>

                <div className="mt-6 space-y-2 border-t border-slate/10 pt-5 text-[13px] text-slate sm:mt-10 sm:space-y-3 sm:pt-7 sm:text-[15px]">
                  <p>
                    <span className="font-semibold text-ink">Location:</span> {event.venue ?? "Venue to be announced"}
                    {mapLink ? (
                      <>
                        {" — "}
                        <a
                          href={mapLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-medium text-[#2e768b] transition hover:text-[#205260]"
                        >
                          <MapPin className="inline h-3.5 w-3.5" />
                          View on map
                        </a>
                      </>
                    ) : null}
                  </p>
                  <p>
                    <span className="font-semibold text-ink">Date and time:</span> {formatEventDateTimeLine(event)}
                  </p>
                </div>

                <div className="mt-6 border-t border-slate/10 pt-4 sm:mt-10 sm:pt-6">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate sm:text-xs">Tickets</p>

                  <div className="mt-3 grid gap-0 sm:mt-4">
                    <div className="border-b border-slate/10 py-4 sm:py-6">
                      <div className="flex items-start justify-between gap-3 sm:flex-row">
                        <div className="min-w-0">
                          <h2 className="font-title text-lg font-black italic leading-tight tracking-tight text-ink sm:text-2xl md:text-[28px]">{generalAdmission.title}</h2>
                          {generalAdmission.note ? <p className="mt-1.5 text-[13px] text-slate sm:mt-2 sm:text-[15px]">{generalAdmission.note}</p> : null}
                        </div>
                        <div className="shrink-0">
                          {generalAdmission.soldOut ? (
                            <span className="inline-flex rounded-xl border border-slate/15 bg-white px-3 py-2 text-xs font-medium text-slate sm:rounded-2xl sm:px-4 sm:py-3 sm:text-sm">
                              Unavailable
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 sm:min-w-[108px] sm:rounded-2xl sm:px-4 sm:py-3 sm:text-sm">
                              Included
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {bootcampOptions.length > 0 ? (
                      <div className="border-b border-slate/10 py-3 sm:py-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate sm:text-xs">Optional bootcamp add-on</p>
                        {bootcampOptions.length > 1 ? (
                          <p className="mt-0.5 text-[13px] text-slate sm:mt-1 sm:text-sm">Select one bootcamp session to add to your admission.</p>
                        ) : null}
                      </div>
                    ) : null}

                    {bootcampOptions.map((ticket) => {
                      const isSelected = selectedBootcampId === ticket.id;

                      return (
                        <div key={ticket.id} className="border-b border-slate/10 py-4 sm:py-6">
                          <div className="flex items-start justify-between gap-3 sm:flex-row">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                                <h2 className="font-title text-lg font-black italic leading-tight tracking-tight text-ink sm:text-2xl md:text-[28px]">{ticket.title}</h2>
                                {ticket.badge ? (
                                  <span className="rounded-full border border-slate/15 px-2 py-0.5 text-[11px] font-medium text-slate sm:px-3 sm:py-1 sm:text-xs">
                                    {ticket.badge}
                                  </span>
                                ) : null}
                              </div>
                              {ticket.note ? <p className="mt-1.5 text-[13px] text-slate sm:mt-2 sm:text-[15px]">{ticket.note}</p> : null}
                            </div>

                            <div className="shrink-0">
                              {ticket.soldOut ? (
                                <span className="inline-flex rounded-xl border border-slate/15 bg-white px-3 py-2 text-xs font-medium text-slate sm:rounded-2xl sm:px-4 sm:py-3 sm:text-sm">
                                  Unavailable
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedBootcampId(isSelected ? null : ticket.id);
                                    setMessage(null);
                                  }}
                                  className={`inline-flex items-center justify-center rounded-xl border px-3 py-2 text-xs font-semibold transition sm:min-w-[108px] sm:rounded-2xl sm:px-4 sm:py-3 sm:text-sm ${
                                    isSelected
                                      ? "border-ink bg-ink text-white"
                                      : "border-slate/20 bg-white text-ink hover:bg-mist"
                                  }`}
                                >
                                  {isSelected ? "Added" : "Add"}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {registrationState.state !== "open" ? (
                    <p className="mt-3 rounded-xl px-3.5 py-2.5 text-[13px] text-rose-700 bg-rose-50 sm:mt-4 sm:rounded-2xl sm:px-4 sm:py-3 sm:text-sm">{registrationState.label}</p>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="max-w-3xl">
                <h1 className="font-title text-2xl font-black italic leading-tight tracking-tight text-ink sm:text-4xl">{event.title}</h1>
                <p className="mt-1 text-[13px] leading-snug text-slate sm:mt-2 sm:text-base">{formatEventDateTimeLine(event)}</p>

                <div className="mt-5 border-t border-slate/10 pt-5 sm:mt-8 sm:pt-7">
                  <p className="text-[13px] font-semibold uppercase tracking-[0.03em] text-ink sm:text-[15px]">Contact information</p>

                  <div className="mt-4 grid gap-3 sm:mt-6 sm:gap-4 sm:grid-cols-2">
                    <Field label="First name" hint="Required">
                      <Input
                        value={form.firstName}
                        onChange={(eventObject) =>
                          setForm((current) => ({ ...current, firstName: eventObject.target.value }))
                        }
                        aria-invalid={requiredErrors.firstName}
                        className={`rounded-2xl px-3.5 py-3 ${requiredErrors.firstName ? "border-rose-400 focus-visible:ring-rose-400" : "border-slate/25"}`}
                      />
                      {requiredErrors.firstName ? (
                        <p className="mt-2 text-sm text-rose-700">First name is required.</p>
                      ) : null}
                    </Field>
                    <Field label="Last name" hint="Required">
                      <Input
                        value={form.lastName}
                        onChange={(eventObject) =>
                          setForm((current) => ({ ...current, lastName: eventObject.target.value }))
                        }
                        aria-invalid={requiredErrors.lastName}
                        className={`rounded-2xl px-3.5 py-3 ${requiredErrors.lastName ? "border-rose-400 focus-visible:ring-rose-400" : "border-slate/25"}`}
                      />
                      {requiredErrors.lastName ? (
                        <p className="mt-2 text-sm text-rose-700">Last name is required.</p>
                      ) : null}
                    </Field>
                  </div>

                  <div className="mt-3 sm:mt-5">
                    <Field label="Email address" hint="Required">
                      <Input
                        type="email"
                        value={form.email}
                        onChange={(eventObject) => {
                          const newEmail = eventObject.target.value;
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
                    ) : otpState !== "sent" ? (
                      <div className="mt-4">
                        <Button
                          type="button"
                          onClick={async () => {
                            await sendOtp("/api/register/start");
                          }}
                          disabled={otpState === "sending" || !form.email.trim() || !isValidEmail || !form.firstName.trim() || !form.lastName.trim()}
                          className="rounded-2xl px-5 py-3"
                        >
                          {otpState === "sending" ? "Sending..." : "Send OTP"}
                        </Button>
                      </div>
                    ) : (
                      <div className="mt-4 space-y-3">
                        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                          <Input
                            value={otp}
                            onChange={(eventObject) => setOtp(eventObject.target.value)}
                            placeholder="Enter 6-digit code"
                            className="rounded-2xl border-slate/25 px-3.5 py-3"
                          />
                          <Button
                            type="button"
                            onClick={() => {
                              void verifyOtpCode();
                            }}
                            disabled={verifyingOtp || !otp.trim()}
                            className="rounded-2xl px-5 py-3"
                          >
                            {verifyingOtp ? "Verifying..." : "Verify OTP"}
                          </Button>
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            await sendOtp("/api/register/resend-verification");
                          }}
                          disabled={verifyingOtp}
                          className="text-sm font-medium text-[#2e768b] transition hover:text-[#205260]"
                        >
                          Didn&apos;t receive a code? Resend OTP
                        </button>
                      </div>
                    )}
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
                        onChange={(eventObject) =>
                          setForm((current) => ({ ...current, phone: eventObject.target.value }))
                        }
                        aria-invalid={requiredErrors.phone}
                        className={`rounded-2xl px-3.5 py-3 ${requiredErrors.phone ? "border-rose-400 focus-visible:ring-rose-400" : "border-slate/25"}`}
                      />
                      {requiredErrors.phone ? (
                        <p className="mt-2 text-sm text-rose-700">Phone number is required.</p>
                      ) : null}
                    </Field>
                    <Field label="Age" hint="Required">
                      <Input
                        type="number"
                        min={1}
                        max={120}
                        value={form.age}
                        onChange={(eventObject) =>
                          setForm((current) => ({ ...current, age: eventObject.target.value }))
                        }
                        aria-invalid={requiredErrors.age}
                        className={`rounded-2xl px-3.5 py-3 ${requiredErrors.age ? "border-rose-400 focus-visible:ring-rose-400" : "border-slate/25"}`}
                      />
                      {requiredErrors.age ? (
                        <p className="mt-2 text-sm text-rose-700">Age is required.</p>
                      ) : null}
                    </Field>
                  </div>

                  <div className="mt-3 sm:mt-5">
                    <Field label="UAE resident" hint="Required">
                      <select
                        value={form.uaeResident ? "yes" : "no"}
                        onChange={(eventObject) =>
                          setForm((current) => ({ ...current, uaeResident: eventObject.target.value === "yes" }))
                        }
                        className="w-full rounded-2xl border border-slate/25 bg-white px-3.5 py-3 text-sm text-ink outline-none transition focus:border-ink focus:ring-1 focus:ring-ink"
                      >
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                    </Field>
                  </div>

                  <div className="mt-5 border-t border-slate/10 pt-5 sm:mt-8 sm:pt-7">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[13px] font-semibold uppercase tracking-[0.03em] text-ink sm:text-[15px]">Disclaimer</p>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setPdfPreviewOpen((v) => !v)}
                          className="text-sm font-medium text-[#2e768b] transition hover:text-[#205260]"
                        >
                          {pdfPreviewOpen ? "Hide preview" : "Show preview"}
                        </button>
                        <a
                          href="/disclaimer-dubai-autodrome.pdf"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hidden items-center gap-1.5 text-sm font-medium text-[#2e768b] transition hover:text-[#205260] sm:inline-flex"
                        >
                          <FileText className="h-4 w-4" />
                          Open full PDF
                        </a>
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-slate">
                      Waiver of Liability and Declaration of Assumption of Risk — Dubai Autodrome
                    </p>

                    {pdfPreviewOpen && (
                      <div className="mt-4">
                        <div
                          className="relative overflow-auto rounded-2xl border border-slate/15 [-webkit-overflow-scrolling:touch]"
                          style={{ maxHeight: "60vh" }}
                        >
                        <PdfViewer src="/disclaimer-dubai-autodrome.pdf" className="w-full" />
                        </div>

                        <a
                          href="/disclaimer-dubai-autodrome.pdf"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm font-semibold text-ink shadow-sm transition active:bg-mist sm:hidden"
                        >
                          <FileText className="h-4 w-4 text-[#2e768b]" />
                          View full PDF
                        </a>
                      </div>
                    )}
                  </div>

                  <div className="mt-5 space-y-3 border-t border-slate/10 pt-5 text-[13px] leading-relaxed text-slate text-justify sm:mt-8 sm:space-y-4 sm:pt-7 sm:text-[15px]">
                    <div>
                      <p className={termsExpanded ? "" : "line-clamp-5"}>
                        {event.declaration_text}
                      </p>
                      {event.declaration_text && event.declaration_text.length > 120 && (
                        <button
                          type="button"
                          onClick={() => setTermsExpanded((v) => !v)}
                          className="mt-1 text-sm font-medium text-[#2e768b] transition hover:text-[#205260]"
                        >
                          {termsExpanded ? (
                            <>View less <ChevronUp className="inline h-4 w-4" /></>
                          ) : (
                            <>View more <ChevronDown className="inline h-4 w-4" /></>
                          )}
                        </button>
                      )}
                    </div>

                    <label className="flex items-start gap-3 text-[15px] leading-snug text-slate">
                      <Checkbox
                        checked={form.declarationAccepted}
                        onChange={(eventObject) =>
                          setForm((current) => ({ ...current, declarationAccepted: eventObject.target.checked }))
                        }
                        className="mt-1 rounded border-slate/35"
                      />
                      <span className={requiredErrors.declarationAccepted ? "text-rose-700" : ""}>I agree to the Terms & Conditions</span>
                    </label>
                    {requiredErrors.declarationAccepted ? (
                      <p className="text-sm text-rose-700">You must accept the Terms & Conditions.</p>
                    ) : null}

                    <label className="flex items-start gap-3 text-[15px] leading-snug text-slate">
                      <Checkbox
                        checked={form.marketingOptIn}
                        onChange={(eventObject) =>
                          setForm((current) => ({ ...current, marketingOptIn: eventObject.target.checked }))
                        }
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
                    onChange={(eventObject) =>
                      setForm((current) => ({ ...current, website: eventObject.target.value }))
                    }
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
              </div>
            )}
          </div>

          {!completedRegistration ? (
            <aside className="border-t border-slate/10 bg-[#fbfbfc] px-3.5 py-4 sm:px-6 sm:py-8 md:border-l md:border-t-0 lg:px-8">
            <div className="lg:sticky lg:top-6">
              <div className="mx-auto hidden max-w-[276px] overflow-hidden rounded-2xl border border-slate/10 bg-white sm:block">
                <div className="relative bg-white">
                  <img src="/train-with-dubai-police-cover.png" alt={event.title} className="block h-auto w-full" />
                </div>
              </div>

              <div className="sm:mt-6">
                <h3 className="font-title text-lg font-black italic leading-tight tracking-tight text-ink sm:text-2xl lg:text-[2rem]">Registration summary</h3>

                <div className="mt-3 space-y-3 text-[13px] text-slate sm:mt-6 sm:space-y-4 sm:text-[15px]">
                  <div className="flex items-start justify-between gap-3 sm:gap-4">
                    <div>
                      <p className="text-ink">{selectedTicketTitle}</p>
                      <div className="mt-2 space-y-1.5 text-[12px] sm:mt-3 sm:space-y-2 sm:text-sm">
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
                          <span>{formatEventDateTimeLine(event)}</span>
                        </div>
                      </div>
                    </div>
                    <span className="text-ink">x1</span>
                  </div>
                </div>

                {!completedRegistration ? (
                  <>
                    <Button
                      type="button"
                      onClick={() => {
                        if (step === "tickets") {
                          if (!canProceed) {
                            return;
                          }

                          setStep("details");
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
                      disabled={
                        step === "tickets"
                          ? !canProceed
                          : submissionState === "submitting"
                      }
                      className="mt-4 w-full rounded-xl py-2.5 text-[13px] text-white bg-black hover:bg-black/90 sm:mt-6 sm:rounded-2xl sm:py-3 sm:text-base"
                    >
                      {step === "tickets"
                        ? "Continue"
                        : submissionState === "submitting"
                          ? "Completing registration..."
                          : "Complete registration"}
                    </Button>

                    {step === "details" && message && submissionState !== "submitting" ? (
                      <p className="mt-3 text-sm text-rose-700">{message}</p>
                    ) : null}
                  </>
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
