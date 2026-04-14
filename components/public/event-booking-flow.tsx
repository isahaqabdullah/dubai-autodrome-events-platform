"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, CheckCircle2, Clock3, Download, FileText, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { EventRecord, RegistrationWindowState } from "@/lib/types";
import { mergeFormConfig } from "@/lib/utils";

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
  const [step, setStep] = useState<Step>("tickets");
  const [expandedDescription, setExpandedDescription] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(HOLD_DURATION_SECONDS);
  const [submissionState, setSubmissionState] = useState<SubmissionState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [otpState, setOtpState] = useState<OtpState>("idle");
  const [otpMessage, setOtpMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [emailVerified, setEmailVerified] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [completedRegistration, setCompletedRegistration] = useState<CompletedRegistration | null>(null);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    age: "",
    uaeResident: false,
    declarationAccepted: false,
    marketingOptIn: false,
    website: ""
  });



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
  const [selectedBootcampId, setSelectedBootcampId] = useState<string | null>(null);
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
        <div className="flex items-center justify-between border-b border-slate/10 px-4 py-3 sm:px-6">
          <div>
            {step === "details" && !completedRegistration ? (
              <button
                type="button"
                onClick={() => {
                  setStep("tickets");
                  setSubmissionState("idle");
                  setMessage(null);
                }}
                className="inline-flex items-center gap-2 rounded-2xl px-2 py-2 text-sm text-slate transition hover:bg-mist hover:text-ink"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            ) : (
              <div className="h-10" />
            )}
          </div>

          {step === "details" && !completedRegistration ? (
            <div className="rounded-2xl border border-slate/15 bg-white px-4 py-2 text-sm font-medium text-ink shadow-sm">
              Time remaining: {formatTimer(timeRemaining)}
            </div>
          ) : (
            <div />
          )}
        </div>

        <div className={contentLayoutClass}>
          <div className="px-4 py-5 sm:px-6 sm:py-7 lg:px-8 lg:py-8">
            {completedRegistration ? (
              <div className="mx-auto max-w-2xl">
                <div className="flex flex-col items-center pt-2 pb-8 text-center">
                  <CheckCircle2 className="h-12 w-12 text-[#2c7a86]" />
                  <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Registration complete!</h1>
                  <p className="mt-2 text-sm text-slate">A confirmation email will be sent to {completedRegistration.email}</p>
                  {message ? <p className="mt-3 text-sm text-slate">{message}</p> : null}
                </div>

                <div className="overflow-hidden rounded-2xl border border-slate/10 bg-white shadow-soft">
                  <div className="relative">
                    <img
                      src="/train-with-dubai-police-cover.png"
                      alt={event.title}
                      className="block w-full h-auto"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0c1723]/90 via-[#0c1723]/30 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 px-6 pb-5 sm:px-8 sm:pb-7">
                      <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/50 sm:text-xs">Your event ticket</p>
                      <h2 className="mt-1.5 text-lg font-semibold tracking-tight text-white sm:text-xl lg:text-2xl">{event.title}</h2>
                    </div>
                  </div>

                  <div className="px-6 py-6 sm:px-8 sm:py-8">
                    <div className="grid gap-6 sm:grid-cols-2">
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate/60">Attendee</p>
                        <p className="text-base font-semibold text-ink">{fullName}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate/60">Admission</p>
                        <p className="text-base font-semibold text-ink">{completedRegistration.ticketTitle}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate/60">Date & time</p>
                        <div className="flex items-start gap-2.5 text-[15px] text-ink">
                          <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-[#2c7a86]" />
                          <span>{formatEventDateTimeLine(event)}</span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate/60">Location</p>
                        <div className="flex items-start gap-2.5 text-[15px] text-ink">
                          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#2c7a86]" />
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

                    <div className="relative mt-8 pt-8">
                      <div className="absolute inset-x-0 top-0 flex items-center" aria-hidden="true">
                        <div className="absolute -left-6 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-[#fbfbfc] sm:-left-8" />
                        <div className="w-full border-t border-dashed border-slate/15" />
                        <div className="absolute -right-6 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-[#fbfbfc] sm:-right-8" />
                      </div>
                      <div className="flex flex-col items-center">
                        <div className="rounded-2xl border border-slate/10 bg-white p-3 shadow-sm">
                          <img
                            src={`/api/qr?token=${encodeURIComponent(completedRegistration.qrToken)}`}
                            alt="Ticket QR code"
                            className="block h-auto w-[180px] sm:w-[200px]"
                          />
                        </div>
                        <p className="mt-4 text-center text-sm font-medium text-slate">
                          Present this QR code at check-in
                        </p>
                        <button
                          type="button"
                          onClick={downloadTicket}
                          className="mt-5 inline-flex items-center gap-2 rounded-2xl border border-slate/20 bg-white px-5 py-2.5 text-sm font-semibold text-ink shadow-sm transition hover:bg-mist"
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
                <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{event.title}</h1>
                <p className="mt-1 text-sm text-slate sm:text-base">{TRAIN_WITH_DUBAI_POLICE_INTRO}</p>

                <div className="mt-2 space-y-1 text-[15px] leading-6 text-slate">
                  {visibleParagraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setExpandedDescription((current) => !current)}
                  className="mt-1 text-sm font-semibold text-[#2e768b] transition hover:text-[#205260]"
                >
                  {expandedDescription ? "Show less ^" : "Show more v"}
                </button>

                <div className="mt-10 space-y-3 border-t border-slate/10 pt-7 text-[15px] text-slate">
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

                <div className="mt-10 border-t border-slate/10 pt-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">Tickets</p>

                  <div className="mt-4 grid gap-0">
                    <div className="border-b border-slate/10 py-6">
                      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                        <div className="max-w-2xl">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl md:text-[28px]">{generalAdmission.title}</h2>
                          </div>
                          {generalAdmission.note ? <p className="mt-2 text-[15px] text-slate">{generalAdmission.note}</p> : null}
                        </div>
                        <div className="shrink-0">
                          {generalAdmission.soldOut ? (
                            <span className="inline-flex rounded-2xl border border-slate/15 bg-white px-4 py-3 text-sm font-medium text-slate">
                              Unavailable
                            </span>
                          ) : (
                            <span className="inline-flex min-w-[108px] items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                              Included
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {bootcampOptions.length > 0 ? (
                      <div className="border-b border-slate/10 py-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">Optional bootcamp add-on</p>
                        {bootcampOptions.length > 1 ? (
                          <p className="mt-1 text-sm text-slate">Select one bootcamp session to add to your admission.</p>
                        ) : null}
                      </div>
                    ) : null}

                    {bootcampOptions.map((ticket) => {
                      const isSelected = selectedBootcampId === ticket.id;

                      return (
                        <div key={ticket.id} className="border-b border-slate/10 py-6">
                          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                            <div className="max-w-2xl">
                              <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl md:text-[28px]">{ticket.title}</h2>
                                {ticket.badge ? (
                                  <span className="rounded-full border border-slate/15 px-3 py-1 text-xs font-medium text-slate">
                                    {ticket.badge}
                                  </span>
                                ) : null}
                              </div>
                              {ticket.note ? <p className="mt-2 text-[15px] text-slate">{ticket.note}</p> : null}
                            </div>

                            <div className="shrink-0">
                              {ticket.soldOut ? (
                                <span className="inline-flex rounded-2xl border border-slate/15 bg-white px-4 py-3 text-sm font-medium text-slate">
                                  Unavailable
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedBootcampId(isSelected ? null : ticket.id);
                                    setMessage(null);
                                  }}
                                  className={`inline-flex min-w-[108px] items-center justify-center rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
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
                    <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{registrationState.label}</p>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="max-w-3xl">
                <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{event.title}</h1>
                <p className="mt-3 text-sm text-slate sm:text-base">{formatEventDateTimeLine(event)}</p>

                <div className="mt-8 border-t border-slate/10 pt-7">
                  <p className="text-[15px] font-semibold uppercase tracking-[0.03em] text-ink">Contact information</p>

                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    <Field label="First name" hint="Required">
                      <Input
                        value={form.firstName}
                        onChange={(eventObject) =>
                          setForm((current) => ({ ...current, firstName: eventObject.target.value }))
                        }
                        className="rounded-2xl border-slate/25 px-3.5 py-3"
                      />
                    </Field>
                    <Field label="Last name" hint="Required">
                      <Input
                        value={form.lastName}
                        onChange={(eventObject) =>
                          setForm((current) => ({ ...current, lastName: eventObject.target.value }))
                        }
                        className="rounded-2xl border-slate/25 px-3.5 py-3"
                      />
                    </Field>
                  </div>

                  <div className="mt-5">
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
                        className="rounded-2xl border-slate/25 px-3.5 py-3"
                      />
                    </Field>
                    <p className="mt-2 text-sm text-slate">This will be used for your confirmation email.</p>
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

                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <Field label="Phone number" hint="Required">
                      <Input
                        value={form.phone}
                        onChange={(eventObject) =>
                          setForm((current) => ({ ...current, phone: eventObject.target.value }))
                        }
                        className="rounded-2xl border-slate/25 px-3.5 py-3"
                      />
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
                        className="rounded-2xl border-slate/25 px-3.5 py-3"
                      />
                    </Field>
                  </div>

                  <div className="mt-5">
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

                  <div className="mt-8 border-t border-slate/10 pt-7">
                    <div className="flex items-center justify-between">
                      <p className="text-[15px] font-semibold uppercase tracking-[0.03em] text-ink">Disclaimer</p>
                      <a
                        href="/disclaimer-dubai-autodrome.pdf"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-[#2e768b] transition hover:text-[#205260]"
                      >
                        <FileText className="h-4 w-4" />
                        Open full PDF
                      </a>
                    </div>
                    <p className="mt-2 text-sm text-slate">
                      Waiver of Liability and Declaration of Assumption of Risk — Dubai Autodrome
                    </p>

                    <div className="mt-4 overflow-hidden rounded-2xl border border-slate/15">
                      <iframe
                        src="/disclaimer-dubai-autodrome.pdf"
                        className="h-[400px] w-full"
                        title="Disclaimer document"
                      />
                    </div>
                  </div>

                  <div className="mt-8 space-y-5 border-t border-slate/10 pt-7 text-[15px] leading-8 text-slate">
                    <p>{event.declaration_text}</p>

                    <label className="flex items-start gap-3 text-[15px] leading-7 text-slate">
                      <Checkbox
                        checked={form.declarationAccepted}
                        onChange={(eventObject) =>
                          setForm((current) => ({ ...current, declarationAccepted: eventObject.target.checked }))
                        }
                        className="mt-1 rounded border-slate/35"
                      />
                      <span>I agree to the Terms & Conditions</span>
                    </label>

                    <label className="flex items-start gap-3 text-[15px] leading-7 text-slate">
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

                  {message ? (
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
            <aside className="border-t border-slate/10 bg-[#fbfbfc] px-4 py-6 sm:px-6 sm:py-8 md:border-l md:border-t-0 lg:px-8">
            <div className="lg:sticky lg:top-6">
              <div className="mx-auto max-w-[276px] overflow-hidden rounded-2xl border border-slate/10 bg-white">
                <div className="relative bg-white">
                  <img src="/train-with-dubai-police-cover.png" alt={event.title} className="block h-auto w-full" />
                </div>
              </div>

              <div className="mt-6">
                <h3 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl lg:text-[2rem]">Registration summary</h3>

                <div className="mt-6 space-y-4 text-[15px] text-slate">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-ink">{selectedTicketTitle}</p>
                      <div className="mt-3 space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4" />
                          <span>{event.venue ?? "Venue to be announced"}</span>
                        </div>
                        {mapLink ? (
                          <a
                            href={mapLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 font-medium text-[#2e768b] transition hover:text-[#205260]"
                          >
                            <MapPin className="h-4 w-4" />
                            <span>View on map</span>
                          </a>
                        ) : null}
                        <div className="flex items-center gap-2">
                          <Clock3 className="h-4 w-4" />
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
                            window.scrollTo({ top: 0, behavior: "auto" });
                          }
                          return;
                        }

                        void submitRegistration();
                      }}
                      disabled={
                        step === "tickets"
                          ? !canProceed
                          : submissionState === "submitting" ||
                            !emailVerified ||
                            !form.firstName.trim() ||
                            !form.lastName.trim() ||
                            !form.email.trim() ||
                            !form.phone.trim() ||
                            !form.age.trim() ||
                            !form.declarationAccepted ||
                            timeRemaining === 0
                      }
                      className="mt-6 w-full rounded-2xl bg-black py-3 text-base text-white hover:bg-black/90"
                    >
                      {step === "tickets"
                        ? "Continue"
                        : submissionState === "submitting"
                          ? "Completing registration..."
                          : "Complete registration"}
                    </Button>

                    {step === "details" && timeRemaining === 0 ? (
                      <p className="mt-3 text-sm text-rose-700">
                        Your hold expired. Go back and continue again to restart the session.
                      </p>
                    ) : step === "details" && !emailVerified && submissionState !== "submitting" ? (
                      <p className="mt-3 text-sm text-amber-600">
                        Please verify your email above to complete registration.
                      </p>
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
