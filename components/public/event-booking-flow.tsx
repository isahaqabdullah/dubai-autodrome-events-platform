"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, ChevronDown, ChevronUp, Clock3, FileText, Loader2, MapPin, Minus, Plus } from "lucide-react";
import { TicketWallet } from "@/components/public/ticket-wallet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatTicketDateTimeLine, getTicketPosterImageSrc } from "@/lib/ticket-presentation";
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
type PaymentPreparationState = "idle" | "preparing" | "ready" | "error";

interface AttendeeDraft {
  id: string;
  firstName: string;
  lastName: string;
  age: string;
  categoryId: string;
  ticketTypeManuallySelected: boolean;
  activityCategoryId: string;
}

interface CompletedAttendee {
  registrationId: string;
  fullName: string;
  categoryTitle: string;
  ticketTitle: string | null;
  qrToken: string;
  manualCheckinCode: string;
  email?: string;
}

interface CompletedRegistration {
  email: string;
  attendees: CompletedAttendee[];
  ticketToken?: string;
  ticketUrl?: string;
}

type CreatePaymentResult = {
  outcome?: "redirect" | "fulfilled" | "payment_pending";
  message?: string;
  registrationId?: string;
  email?: string;
  qrToken?: string;
  manualCheckinCode?: string;
  paymentUrl?: string;
  checkoutToken?: string;
  ticketToken?: string;
  ticketUrl?: string;
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

type CreatePaymentResponse = {
  ok: boolean;
  result: CreatePaymentResult;
};

interface SelectableOption extends EventTicketOption {
  isUnavailable: boolean;
  remaining: number | null;
}

const HOLD_DURATION_SECONDS = 25 * 60;
const MAX_ATTENDEES = 5;
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
const CHECKOUT_DRAFT_CLEAR_KEY = "checkout-drafts-clear-at";
const FORM_CONTROL_CLASS = "h-11 rounded-xl border-slate/25 bg-white px-3.5 py-2.5 text-sm";
const FORM_CONTROL_ERROR_CLASS = "border-rose-400 focus-visible:ring-rose-400";
const SELECT_CHEVRON_LIGHT = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24"><path stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="m6 9 6 6 6-6"/></svg>`
);

function createAttendeeDraft(index: number): AttendeeDraft {
  return {
    id: `attendee-${index}`,
    firstName: "",
    lastName: "",
    age: "",
    categoryId: "",
    ticketTypeManuallySelected: false,
    activityCategoryId: ""
  };
}

function normalizeSavedAttendees(value: unknown): AttendeeDraft[] {
  if (!Array.isArray(value)) return [];

  return value.slice(0, MAX_ATTENDEES).map((attendee, index) => {
    const row = attendee && typeof attendee === "object" ? attendee as Record<string, unknown> : {};
    return {
      id: typeof row.id === "string" && row.id.trim() ? row.id : `attendee-${index + 1}`,
      firstName: typeof row.firstName === "string" ? row.firstName : "",
      lastName: typeof row.lastName === "string" ? row.lastName : "",
      age: typeof row.age === "string" ? row.age : row.age == null ? "" : String(row.age),
      categoryId: typeof row.categoryId === "string" ? row.categoryId : "",
      ticketTypeManuallySelected: typeof row.ticketTypeManuallySelected === "boolean" ? row.ticketTypeManuallySelected : false,
      activityCategoryId: typeof row.activityCategoryId === "string" ? row.activityCategoryId : ""
    };
  });
}

function normalizeSavedTicketQuantities(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, number>>((acc, [id, quantity]) => {
    const parsed = typeof quantity === "number" ? quantity : Number(quantity);
    if (id && Number.isFinite(parsed) && parsed > 0) {
      acc[id] = Math.min(Math.floor(parsed), MAX_ATTENDEES);
    }
    return acc;
  }, {});
}

function getAttendeeName(attendee: Pick<AttendeeDraft, "firstName" | "lastName">) {
  const firstName = attendee.firstName.trim();
  const lastName = attendee.lastName.trim();
  if (!firstName || !lastName) return "";
  return `${firstName} ${lastName}`;
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

function splitDescriptionParagraphs(description: string | null | undefined) {
  if (!description?.trim()) {
    return [];
  }

  return description.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
}

function formatPrice(amountMinor?: number, currencyCode = "AED") {
  const amount = amountMinor ?? 0;
  if (amount <= 0) {
    return "Free";
  }
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 2
  }).format(amount / 100);
}

function isEmbeddedPaymentHost(userAgent: string) {
  return /Instagram|FBAN|FBAV|FB_IAB|WhatsApp|TikTok|LinkedInApp/i.test(userAgent);
}

function SelectionCard({
  title,
  description,
  note,
  meta,
  price,
  selected,
  disabled,
  fitContent,
  onClick
}: {
  title: string;
  description?: string;
  note?: string;
  meta?: string;
  price?: string;
  selected: boolean;
  disabled?: boolean;
  fitContent?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={`${fitContent ? "inline-block w-fit max-w-full" : "w-full"} rounded-2xl border px-4 py-2.5 text-left transition sm:px-5 sm:py-3 ${
        selected
          ? "border-ink/30 bg-[#f7f9fb] text-ink shadow-sm"
          : disabled
            ? "cursor-not-allowed border-slate/10 bg-slate-50 text-slate/60"
            : "border-ink/20 bg-white text-ink hover:border-ink/30 hover:bg-mist/60"
      }`}
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-display text-[15px] font-bold tracking-tight sm:text-lg">{title}</p>
          {description ? (
            <p className="mt-0.5 text-[13px] leading-snug text-slate sm:text-sm">
              {description}
            </p>
          ) : null}
          {note ? (
            <p className="mt-0.5 text-[11px] italic text-slate/70 sm:text-xs">
              {note}
            </p>
          ) : null}
          {price ? (
            <p className="mt-1 text-[12px] font-bold text-ink sm:text-sm">
              {price}
            </p>
          ) : null}
        </div>
        <span
          className={`inline-flex shrink-0 self-start rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] ${
            selected
              ? "bg-ink/10 text-ink"
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
      return {
        ...ticket,
        isUnavailable: Boolean(ticket.soldOut),
        remaining: null
      };
    });
  }, [config.ticketOptions]);

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
  const [checkoutToken, setCheckoutToken] = useState<string | null>(null);
  const [paymentPreparationState, setPaymentPreparationState] = useState<PaymentPreparationState>("idle");
  const [paymentPreparationMessage, setPaymentPreparationMessage] = useState<string | null>(null);
  const [preparedPayment, setPreparedPayment] = useState<{ key: string; result: CreatePaymentResult } | null>(null);
  const [paymentRedirectElapsed, setPaymentRedirectElapsed] = useState(0);
  const [ticketQuantities, setTicketQuantities] = useState<Record<string, number>>({});
  const [attendees, setAttendees] = useState<AttendeeDraft[]>([createAttendeeDraft(1)]);
  const paymentPreparationRequestRef = useRef<{
    key: string;
    controller: AbortController;
    promise: Promise<CreatePaymentResponse>;
  } | null>(null);

  const [form, setForm] = useState(INITIAL_FORM_STATE);

  const emailInputId = useId();
  const uaeResidentSelectId = useId();

  useEffect(() => {
    setTicketQuantities((current) => {
      let selectedTotal = 0;
      let changed = false;
      const next: Record<string, number> = {};

      for (const category of categories) {
        const currentQuantity = Math.max(0, Math.floor(current[category.id] ?? 0));
        if (currentQuantity === 0) continue;

        const maxByCapacity = category.isUnavailable ? 0 : category.remaining ?? MAX_ATTENDEES;
        const maxByTotal = Math.max(MAX_ATTENDEES - selectedTotal, 0);
        const nextQuantity = Math.min(currentQuantity, maxByCapacity, maxByTotal);
        if (nextQuantity > 0) {
          next[category.id] = nextQuantity;
          selectedTotal += nextQuantity;
        }
        if (nextQuantity !== currentQuantity) {
          changed = true;
        }
      }

      if (Object.keys(current).some((id) => !Object.prototype.hasOwnProperty.call(next, id) && (current[id] ?? 0) > 0)) {
        changed = true;
      }

      return changed ? next : current;
    });

    setAttendees((current) =>
      current.map((attendee) =>
        attendee.categoryId && !categories.some((category) => category.id === attendee.categoryId && !category.isUnavailable)
          ? { ...attendee, categoryId: "", ticketTypeManuallySelected: false }
          : attendee
      )
    );
  }, [categories]);

  useEffect(() => {
    setAttendees((current) =>
      current.map((attendee) =>
        attendee.activityCategoryId &&
          !additionalCategories.some((category) => category.id === attendee.activityCategoryId && !category.isUnavailable)
          ? { ...attendee, activityCategoryId: "" }
          : attendee
      )
    );
  }, [additionalCategories]);

  function clearCheckoutSession() {
    setEmailVerified(false);
    setCheckoutToken(null);
    setOtpState("idle");
    setOtp("");
    setOtpMessage(null);
    setSubmissionState("idle");
    setPaymentPreparationState("idle");
    setPaymentPreparationMessage(null);
    setPreparedPayment(null);
  }

  const buildTicketCategorySlots = useCallback((quantities: Record<string, number>) => {
    return categories.flatMap((category) =>
      Array.from(
        { length: Math.max(0, Math.floor(quantities[category.id] ?? 0)) },
        () => category.id
      )
    ).slice(0, MAX_ATTENDEES);
  }, [categories]);

  const buildReservationAttendeeRows = useCallback(() => {
    return buildTicketCategorySlots(ticketQuantities).map((categoryId) => ({ categoryId }));
  }, [buildTicketCategorySlots, ticketQuantities]);

  const normalizeAttendeesForTicketQuantities = useCallback((
    currentAttendees: AttendeeDraft[],
    quantities: Record<string, number>
  ) => {
    const categorySlots = buildTicketCategorySlots(quantities);
    const uniqueCategoryIds = new Set(categorySlots);
    const canAutoAssignTicketType = uniqueCategoryIds.size === 1;
    const remainingAssignments = categorySlots.reduce<Map<string, number>>((acc, categoryId) => {
      acc.set(categoryId, (acc.get(categoryId) ?? 0) + 1);
      return acc;
    }, new Map());

    return categorySlots.map((_, index) => {
      const current = currentAttendees[index] ?? createAttendeeDraft(index + 1);

      let categoryId = current.ticketTypeManuallySelected || canAutoAssignTicketType ? current.categoryId : "";
      const availableForCurrentCategory = categoryId ? remainingAssignments.get(categoryId) ?? 0 : 0;
      let ticketTypeManuallySelected = current.ticketTypeManuallySelected;

      if (categoryId && availableForCurrentCategory > 0) {
        remainingAssignments.set(categoryId, availableForCurrentCategory - 1);
      } else {
        categoryId = "";
        ticketTypeManuallySelected = false;
      }

      if (!categoryId && canAutoAssignTicketType) {
        categoryId = categorySlots[0] ?? "";
        ticketTypeManuallySelected = false;
        remainingAssignments.set(categoryId, Math.max((remainingAssignments.get(categoryId) ?? 1) - 1, 0));
      }

      return {
        ...current,
        id: `attendee-${index + 1}`,
        categoryId,
        ticketTypeManuallySelected
      };
    });
  }, [buildTicketCategorySlots]);

  useEffect(() => {
    setAttendees((current) => normalizeAttendeesForTicketQuantities(current, ticketQuantities));
  }, [ticketQuantities, normalizeAttendeesForTicketQuantities]);

  useEffect(() => {
    const availableActivityCategories = additionalCategories.filter((category) => !category.isUnavailable);
    if (availableActivityCategories.length !== 1) return;

    const onlyActivityCategoryId = availableActivityCategories[0].id;
    setAttendees((current) =>
      current.map((attendee) =>
        attendee.activityCategoryId ? attendee : { ...attendee, activityCategoryId: onlyActivityCategoryId }
      )
    );
  }, [additionalCategories]);

  function updateTicketQuantity(category: SelectableOption, delta: number) {
    setTicketQuantities((current) => {
      const currentQuantity = Math.max(0, Math.floor(current[category.id] ?? 0));
      const currentTotal = Object.values(current).reduce((sum, quantity) => sum + Math.max(0, Math.floor(quantity)), 0);
      const maxByCapacity = category.isUnavailable ? 0 : category.remaining ?? MAX_ATTENDEES;
      const maxByTotal = currentQuantity + Math.max(MAX_ATTENDEES - (currentTotal - currentQuantity), 0);
      const nextQuantity = Math.min(Math.max(currentQuantity + delta, 0), maxByCapacity, maxByTotal);
      const next = { ...current };

      if (nextQuantity > 0) {
        next[category.id] = nextQuantity;
      } else {
        delete next[category.id];
      }

      return next;
    });
    clearCheckoutSession();
    setMessage(null);
  }

  function updateAttendee(attendeeId: string, patch: Partial<AttendeeDraft>) {
    setAttendees((current) =>
      current.map((attendee) =>
        attendee.id === attendeeId
          ? {
              ...attendee,
              ...patch,
              ...(Object.prototype.hasOwnProperty.call(patch, "categoryId")
                ? { ticketTypeManuallySelected: Boolean(patch.categoryId) }
                : {})
            }
          : attendee
      )
    );
    setMessage(null);
  }

  const resetBookingDraftState = useCallback(() => {
    setStep("tickets");
    setTimeRemaining(HOLD_DURATION_SECONDS);
    setSubmissionState("idle");
    setMessage(null);
    setSubmitAttempted(false);
    setOtp("");
    setOtpState("idle");
    setOtpMessage(null);
    setEmailVerified(false);
    setVerifyingOtp(false);
    setCompletedRegistration(null);
    setCheckoutToken(null);
    setPaymentPreparationState("idle");
    setPaymentPreparationMessage(null);
    setPreparedPayment(null);
    setTicketQuantities({});
    setAttendees([createAttendeeDraft(1)]);
    setForm(INITIAL_FORM_STATE);

    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      // Ignore storage cleanup failures.
    }
  }, [storageKey]);

  const saveDraft = useCallback(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({
        savedAt: Date.now(),
        form,
        step,
        emailVerified,
        checkoutToken,
        otpState,
        ticketQuantities,
        attendees
      }));
    } catch {
      // Ignore storage quota issues in the draft experience.
    }
  }, [form, step, emailVerified, checkoutToken, otpState, ticketQuantities, attendees, storageKey]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const draft = JSON.parse(raw);
        const clearedAt = Number(localStorage.getItem(CHECKOUT_DRAFT_CLEAR_KEY) ?? 0);
        const savedAt = Number(draft.savedAt ?? 0);
        if (clearedAt > 0 && (!savedAt || savedAt <= clearedAt)) {
          sessionStorage.removeItem(storageKey);
          setHydrated(true);
          return;
        }
        if (draft.step) setStep(draft.step);
        const savedCheckoutToken = typeof draft.checkoutToken === "string" && draft.checkoutToken.length > 0
          ? draft.checkoutToken
          : null;
        if (savedCheckoutToken) {
          setCheckoutToken(savedCheckoutToken);
        }
        if (draft.emailVerified && savedCheckoutToken) {
          setEmailVerified(true);
        }
        if (draft.otpState === "sent" && savedCheckoutToken && !draft.emailVerified) {
          setOtpState("sent");
        }
        const savedAttendees = normalizeSavedAttendees(draft.attendees);
        const savedTicketQuantities = normalizeSavedTicketQuantities(draft.ticketQuantities);
        if (Object.keys(savedTicketQuantities).length > 0) {
          setTicketQuantities(savedTicketQuantities);
        } else if (savedAttendees.length > 0) {
          setTicketQuantities(savedAttendees.reduce<Record<string, number>>((acc, attendee) => {
            if (attendee.categoryId) {
              acc[attendee.categoryId] = (acc[attendee.categoryId] ?? 0) + 1;
            }
            return acc;
          }, {}));
        } else if (draft.selectedCategoryId) {
          setTicketQuantities({ [draft.selectedCategoryId]: 1 });
        }
        if (savedAttendees.length > 0) {
          setAttendees(savedAttendees);
        } else if (draft.selectedCategoryId || draft.form) {
          setAttendees([{
            id: "attendee-1",
            firstName: draft.form?.firstName ?? "",
            lastName: draft.form?.lastName ?? "",
            age: draft.form?.age ?? "",
            categoryId: draft.selectedCategoryId ?? "",
            ticketTypeManuallySelected: Boolean(draft.selectedCategoryId),
            activityCategoryId: draft.selectedAdditionalCategoryId ?? ""
          }]);
        }
        if (draft.form) {
          setForm((current) => ({
            ...current,
            email: draft.form.email ?? "",
            phone: draft.form.phone ?? "",
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
    function handleCheckoutDraftClear(event: StorageEvent) {
      if (event.key === CHECKOUT_DRAFT_CLEAR_KEY) {
        resetBookingDraftState();
      }
    }

    window.addEventListener("storage", handleCheckoutDraftClear);
    return () => window.removeEventListener("storage", handleCheckoutDraftClear);
  }, [resetBookingDraftState]);

  useEffect(() => {
    if (hydrated) saveDraft();
  }, [hydrated, saveDraft]);

  const primaryAttendee = attendees[0] ?? createAttendeeDraft(1);
  const canProceed = registrationState.state === "open";
  const fullName = `${primaryAttendee.firstName} ${primaryAttendee.lastName}`.trim();
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());
  const showFieldErrors = step === "details" && submitAttempted && submissionState !== "submitting" && !completedRegistration;
  const ticketQuantityRows = useMemo(
    () => categories.map((category) => ({
      category,
      quantity: Math.max(0, Math.floor(ticketQuantities[category.id] ?? 0))
    })),
    [categories, ticketQuantities]
  );
  const selectedTicketTypeRows = useMemo(
    () => ticketQuantityRows.filter((row) => row.quantity > 0),
    [ticketQuantityRows]
  );
  const selectedTicketCount = selectedTicketTypeRows.reduce((sum, row) => sum + row.quantity, 0);
  const selectedTicketSubtotalMinor = selectedTicketTypeRows.reduce(
    (sum, row) => sum + (row.category.priceMinor ?? 0) * row.quantity,
    0
  );
  const paymentRedirectInProgress = step === "details" && submissionState === "submitting" && selectedTicketSubtotalMinor > 0;
  const paymentRedirectIsSlow = paymentRedirectElapsed >= 8;
  const selectedTicketCurrencyCode =
    selectedTicketTypeRows.find((row) => row.category.currencyCode)?.category.currencyCode ?? "AED";
  const selectedTicketTypeIds = useMemo(
    () => new Set(selectedTicketTypeRows.map((row) => row.category.id)),
    [selectedTicketTypeRows]
  );

  useEffect(() => {
    if (!paymentRedirectInProgress) {
      setPaymentRedirectElapsed(0);
      return;
    }

    const timer = window.setInterval(() => {
      setPaymentRedirectElapsed((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [paymentRedirectInProgress]);

  const attendeeSelections = attendees.map((attendee) => {
    const ticketType = categories.find((category) => category.id === attendee.categoryId) ?? null;
    const activityCategory = additionalCategories.find((category) => category.id === attendee.activityCategoryId) ?? null;
    return {
      attendee,
      ticketType,
      activityCategory,
      totalMinor: ticketType?.priceMinor ?? 0
    };
  });
  const completedSelectionCount = attendeeSelections.filter(
    (selection) => selection.ticketType && selection.activityCategory
  ).length;
  const selectionDisplayLabel = completedSelectionCount === attendees.length
    ? `${attendees.length} attendee${attendees.length === 1 ? "" : "s"} selected`
    : "Complete attendee selections";
  const contactComplete = emailVerified && Boolean(form.phone.trim()) && isValidPhoneNumber(form.phone);
  const attendeesComplete = !validateAttendeeDrafts();
  const termsComplete = form.declarationAccepted;
  const readyForPayment = contactComplete && attendeesComplete && termsComplete && Boolean(checkoutToken);
  const createPaymentPayload = useMemo(() => {
    if (!checkoutToken || !form.declarationAccepted) return null;

    return {
      checkoutToken,
      declarationAccepted: true,
      phone: form.phone,
      uaeResident: form.uaeResident,
      marketingOptIn: form.marketingOptIn,
      attendees: attendees.map((attendee) => ({
        firstName: attendee.firstName,
        lastName: attendee.lastName,
        age: Number(attendee.age),
        categoryId: attendee.categoryId,
        addonId: attendee.activityCategoryId
      }))
    };
  }, [attendees, checkoutToken, form.declarationAccepted, form.marketingOptIn, form.phone, form.uaeResident]);
  const paymentPreparationKey = useMemo(() => {
    return createPaymentPayload
      ? JSON.stringify({ ...createPaymentPayload, termsAccepted: form.declarationAccepted })
      : "";
  }, [createPaymentPayload, form.declarationAccepted]);
  const preparedPaymentReady = Boolean(
    preparedPayment &&
    preparedPayment.key === paymentPreparationKey &&
    preparedPayment.result.outcome === "redirect" &&
    preparedPayment.result.paymentUrl
  );
  const startPaymentPreparationRequest = useCallback((payload: NonNullable<typeof createPaymentPayload>, key: string) => {
    const activeRequest = paymentPreparationRequestRef.current;
    if (activeRequest?.key === key) {
      return activeRequest;
    }

    activeRequest?.controller.abort();

    const controller = new AbortController();
    const request = {
      key,
      controller,
      promise: fetch("/api/checkout/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal
      }).then(async (response) => {
        const result = (await response.json().catch(() => ({}))) as CreatePaymentResult;
        return { ok: response.ok, result };
      })
    };

    paymentPreparationRequestRef.current = request;
    const clearRequest = () => {
      if (paymentPreparationRequestRef.current === request) {
        paymentPreparationRequestRef.current = null;
      }
    };
    request.promise.then(clearRequest, clearRequest);

    return request;
  }, []);
  const requiredErrors = useMemo(() => {
    if (!showFieldErrors) {
      return {
        email: false,
        emailVerified: false,
        phone: false,
        declarationAccepted: false
      };
    }

    return {
      email: !form.email.trim() || !isValidEmail,
      emailVerified: !emailVerified,
      phone: !form.phone.trim(),
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

  function countOtherAttendeeSelections(field: "categoryId" | "activityCategoryId", optionId: string, attendeeId: string) {
    return attendees.filter((attendee) => attendee.id !== attendeeId && attendee[field] === optionId).length;
  }

  function isTicketTypeBlockedForAttendee(category: SelectableOption, attendee: AttendeeDraft) {
    if (category.isUnavailable || !selectedTicketTypeIds.has(category.id)) {
      return true;
    }

    if (attendee.categoryId === category.id) {
      return false;
    }

    const quota = Math.max(0, Math.floor(ticketQuantities[category.id] ?? 0));
    return countOtherAttendeeSelections("categoryId", category.id, attendee.id) >= quota;
  }

  function getDraftAdjustedMeta(
    option: SelectableOption,
    field: "categoryId" | "activityCategoryId",
    attendeeId: string
  ) {
    if (field === "activityCategoryId") {
      return option.isUnavailable ? option.badge || "Unavailable" : option.badge || undefined;
    }

    if (option.isUnavailable || option.remaining === null) {
      return getAvailabilityMeta(option);
    }

    const remaining = Math.max(option.remaining - countOtherAttendeeSelections(field, option.id, attendeeId), 0);
    return `${remaining} left`;
  }

  function isOptionBlockedForAttendee(
    option: SelectableOption,
    field: "categoryId" | "activityCategoryId",
    attendeeId: string
  ) {
    if (option.isUnavailable) {
      return true;
    }

    if (field === "activityCategoryId") {
      return false;
    }

    if (option.remaining === null) {
      return false;
    }

    return countOtherAttendeeSelections(field, option.id, attendeeId) >= option.remaining;
  }

  function validateTicketQuantities() {
    if (categories.length === 0) {
      return "This event is missing ticket types. Please contact the organizer.";
    }

    if (selectedTicketCount < 1) {
      return "Select at least one ticket before continuing.";
    }

    if (selectedTicketCount > MAX_ATTENDEES) {
      return `You can book up to ${MAX_ATTENDEES} attendees at once.`;
    }

    for (const { category, quantity } of selectedTicketTypeRows) {
      if (category.isUnavailable) {
        return `${category.title} is no longer available.`;
      }
      if (category.remaining !== null && quantity > category.remaining) {
        return `Only ${category.remaining} spot${category.remaining === 1 ? "" : "s"} left for ${category.title}.`;
      }
    }

    return null;
  }

  function validateAttendeeDrafts(options: { requireIdentity?: boolean; requireActivity?: boolean } = {}) {
    const requireIdentity = options.requireIdentity ?? true;
    const requireActivity = options.requireActivity ?? true;
    const ticketError = validateTicketQuantities();
    if (ticketError) {
      return ticketError;
    }

    if (attendees.length < 1) {
      return "Add at least one attendee.";
    }

    if (attendees.length > MAX_ATTENDEES) {
      return `You can book up to ${MAX_ATTENDEES} attendees at once.`;
    }

    if (attendees.length !== selectedTicketCount) {
      return "Your attendee list no longer matches the selected tickets. Go back and continue again.";
    }

    if (categories.length === 0) {
      return "This event is missing ticket types. Please contact the organizer.";
    }

    if (requireActivity && additionalCategories.length === 0) {
      return "This event is missing activity categories. Please contact the organizer.";
    }

    const categoryCounts = new Map<string, number>();
    const activityCounts = new Map<string, number>();

    for (let index = 0; index < attendees.length; index++) {
      const attendee = attendees[index];
      const label = `Attendee ${index + 1}`;
      if (requireIdentity && (!attendee.firstName.trim() || !attendee.lastName.trim())) {
        return `${label}: enter first and last name.`;
      }
      if (requireIdentity && !attendee.age.trim()) {
        return `${label}: enter age.`;
      }
      if (!attendee.categoryId) {
        return `${label}: select a ticket type.`;
      }
      if (requireActivity && !attendee.activityCategoryId) {
        return `${label}: select an activity category.`;
      }

      const ticketType = categories.find((category) => category.id === attendee.categoryId);
      const activityCategory = requireActivity
        ? additionalCategories.find((category) => category.id === attendee.activityCategoryId)
        : null;

      if (!ticketType || ticketType.isUnavailable) {
        return `${label}: selected ticket type is no longer available.`;
      }
      if (!selectedTicketTypeIds.has(ticketType.id)) {
        return `${label}: select one of the ticket types chosen on the previous step.`;
      }
      if (requireActivity && (!activityCategory || activityCategory.isUnavailable)) {
        return `${label}: selected activity category is no longer available.`;
      }

      categoryCounts.set(ticketType.id, (categoryCounts.get(ticketType.id) ?? 0) + 1);
      if (activityCategory) {
        activityCounts.set(activityCategory.id, (activityCounts.get(activityCategory.id) ?? 0) + 1);
      }
    }

    for (const option of categories) {
      const requested = categoryCounts.get(option.id) ?? 0;
      if (option.remaining !== null && requested > option.remaining) {
        return `Only ${option.remaining} spot${option.remaining === 1 ? "" : "s"} left for ${option.title}.`;
      }
    }

    for (const { category, quantity } of selectedTicketTypeRows) {
      const assigned = categoryCounts.get(category.id) ?? 0;
      if (assigned !== quantity) {
        return `Assign ${quantity} attendee${quantity === 1 ? "" : "s"} to ${category.title}.`;
      }
    }

    return null;
  }

  function validateReservationDrafts() {
    return validateTicketQuantities();
  }

  const mapLink = config.mapLink ?? null;
  const posterImage = getTicketPosterImageSrc(config);
  const introLine = config.introLine?.trim() ?? "";
  const descriptionParagraphs = config.descriptionParagraphs?.length
    ? config.descriptionParagraphs
    : splitDescriptionParagraphs(event.description);
  const disclaimerPdfUrl = config.disclaimerPdfUrl?.trim() || null;
  const hasPdf = Boolean(disclaimerPdfUrl);
  const visibleParagraphs = expandedDescription ? descriptionParagraphs : descriptionParagraphs.slice(0, 2);
  const contentLayoutClass = completedRegistration
    ? "block"
    : "grid min-w-0 grid-cols-[minmax(0,1fr)] gap-0 md:grid-cols-[minmax(0,1fr)_300px] lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_360px]";

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

  useEffect(() => {
    if (
      !readyForPayment ||
      selectedTicketSubtotalMinor <= 0 ||
      !createPaymentPayload ||
      !paymentPreparationKey ||
      completedRegistration
    ) {
      setPaymentPreparationState("idle");
      setPaymentPreparationMessage(null);
      setPreparedPayment(null);
      const activeRequest = paymentPreparationRequestRef.current;
      if (activeRequest) {
        activeRequest.controller.abort();
        paymentPreparationRequestRef.current = null;
      }
      return;
    }

    if (
      preparedPayment &&
      preparedPayment.key === paymentPreparationKey &&
      preparedPayment.result.outcome === "redirect" &&
      preparedPayment.result.paymentUrl
    ) {
      setPaymentPreparationState("ready");
      setPaymentPreparationMessage(null);
      return;
    }

    const timer = window.setTimeout(() => {
      setPaymentPreparationState("preparing");
      setPaymentPreparationMessage("Getting secure payment ready in the background.");

      const request = startPaymentPreparationRequest(createPaymentPayload, paymentPreparationKey);
      void request.promise
        .then(({ ok, result }) => {
          if (!ok) {
            setPaymentPreparationState("error");
            setPaymentPreparationMessage(result.message ?? "Payment will be prepared when you continue.");
            setPreparedPayment(null);
            return;
          }

          if (result.outcome === "redirect" && result.paymentUrl) {
            setPreparedPayment({ key: paymentPreparationKey, result });
            setPaymentPreparationState("ready");
            setPaymentPreparationMessage(null);
            return;
          }

          if (result.outcome === "payment_pending") {
            setPaymentPreparationState("preparing");
            setPaymentPreparationMessage(result.message ?? "Getting secure payment ready in the background.");
            return;
          }

          setPaymentPreparationState("idle");
          setPaymentPreparationMessage(null);
        })
        .catch((error) => {
          if (error instanceof Error && error.name === "AbortError") return;
          setPaymentPreparationState("error");
          setPaymentPreparationMessage("Payment will be prepared when you continue.");
          setPreparedPayment(null);
        });
    }, 50);

    return () => {
      window.clearTimeout(timer);
      const activeRequest = paymentPreparationRequestRef.current;
      if (activeRequest?.key === paymentPreparationKey) {
        activeRequest.controller.abort();
        paymentPreparationRequestRef.current = null;
      }
    };
  }, [
    completedRegistration,
    createPaymentPayload,
    paymentPreparationKey,
    preparedPayment,
    readyForPayment,
    selectedTicketSubtotalMinor,
    startPaymentPreparationRequest
  ]);

  async function sendOtp(endpoint: "/api/checkout/start" | "/api/checkout/resend-otp") {
    const attendeeError = validateReservationDrafts();
    if (attendeeError) {
      setOtpMessage({ text: attendeeError, error: true });
      return;
    }

    const reservationAttendees = buildReservationAttendeeRows();
    const primary = reservationAttendees[0];

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

    if (endpoint === "/api/checkout/resend-otp" && !checkoutToken) {
      setOtpState("idle");
      setOtpMessage({ text: "Request a new verification code before resending.", error: true });
      return;
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(endpoint === "/api/checkout/resend-otp"
        ? { checkoutToken }
        : {
          eventId: event.id,
          categoryId: primary?.categoryId ?? "",
          email: form.email,
          phone: form.phone || undefined,
          uaeResident: form.uaeResident,
          website: form.website,
          attendees: reservationAttendees
        })
    });

    const result = (await response.json()) as {
      outcome?: "otp_sent";
      message?: string;
      warning?: string;
      checkoutToken?: string;
    };

    if (!response.ok) {
      setOtpState("idle");
      setOtpMessage({ text: result.message ?? "Unable to send verification code.", error: true });
      return;
    }

    const otpText = result.warning
      ? `${result.message ?? "Verification code sent."} Note: ${result.warning}`
      : result.message ?? "Verification code sent.";

    if (result.checkoutToken) {
      setCheckoutToken(result.checkoutToken);
    }

    setOtpState("sent");
    setOtpMessage({ text: otpText, error: false });
  }

  async function verifyOtpCode() {
    if (!otp.trim()) return;
    if (!checkoutToken) {
      setOtpMessage({ text: "Request a new verification code before continuing.", error: true });
      return;
    }
    setVerifyingOtp(true);
    setOtpMessage(null);
    try {
      const response = await fetch("/api/checkout/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkoutToken, otp })
      });
      const result = (await response.json()) as { outcome?: string; message?: string; checkoutToken?: string };
      if (response.ok && (result.outcome === "email_verified" || result.outcome === "fulfilled")) {
        if (result.checkoutToken) {
          setCheckoutToken(result.checkoutToken);
        }
        setEmailVerified(true);
        setOtpMessage(null);
      } else {
        setOtpMessage({ text: result.message ?? "Invalid verification code.", error: true });
      }
    } finally {
      setVerifyingOtp(false);
    }
  }

  function redirectToPayment(result: CreatePaymentResult) {
    if (result.outcome !== "redirect" || !result.paymentUrl) {
      return false;
    }

    const ua = window.navigator.userAgent;
    if (isEmbeddedPaymentHost(ua)) {
      const continueInWebview = window.confirm(
        "This payment may fail inside an in-app browser. Open this page in your system browser if 3DS does not complete. Continue to payment now?"
      );
      if (!continueInWebview) {
        setSubmissionState("idle");
        setMessage("Payment is ready. Open this page in your system browser, then continue again.");
        return true;
      }
    }

    window.location.assign(result.paymentUrl);
    return true;
  }

  async function submitRegistration() {
    const attendeeError = validateAttendeeDrafts();
    if (
      attendeeError ||
      !fullName ||
      !form.email ||
      !form.phone ||
      !isValidPhoneNumber(form.phone) ||
      !form.declarationAccepted ||
      !checkoutToken ||
      !canProceed
    ) {
      if (attendeeError) {
        setMessage(attendeeError);
      }
      return;
    }

    if (selectedTicketSubtotalMinor > 0 && preparedPaymentReady && preparedPayment) {
      if (preparedPayment.result.checkoutToken) {
        setCheckoutToken(preparedPayment.result.checkoutToken);
      }
      if (redirectToPayment(preparedPayment.result)) {
        return;
      }
    }

    if (!createPaymentPayload) {
      setMessage("Please request a new verification code before continuing.");
      return;
    }

    setSubmissionState("submitting");
    setMessage(null);

    const activePaymentRequest =
      selectedTicketSubtotalMinor > 0 && paymentPreparationRequestRef.current?.key === paymentPreparationKey
        ? paymentPreparationRequestRef.current
        : null;
    const paymentRequestController = activePaymentRequest ? null : new AbortController();
    const paymentRequestTimeout = window.setTimeout(() => {
      if (activePaymentRequest) {
        activePaymentRequest.controller.abort();
      } else {
        paymentRequestController?.abort();
      }
    }, 45000);

    let paymentResponse: CreatePaymentResponse;
    let result: CreatePaymentResult;

    try {
      paymentResponse = activePaymentRequest
        ? await activePaymentRequest.promise
        : await fetch("/api/checkout/create-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(createPaymentPayload),
          signal: paymentRequestController?.signal
        }).then(async (response) => {
          const responseResult = (await response.json().catch(() => ({}))) as CreatePaymentResult;
          return { ok: response.ok, result: responseResult };
        });
      result = paymentResponse.result;
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      setSubmissionState("error");
      setMessage(
        aborted
          ? "Payment preparation is taking longer than expected. Please try again."
          : "Unable to prepare payment. Please check your connection and try again."
      );
      return;
    } finally {
      window.clearTimeout(paymentRequestTimeout);
    }

    if (!paymentResponse.ok) {
      setSubmissionState("error");
      setMessage(result.message ?? "Unable to complete the registration.");
      return;
    }

    if (result.checkoutToken) {
      setCheckoutToken(result.checkoutToken);
    }

    if (result.outcome === "redirect" && result.paymentUrl) {
      redirectToPayment(result);
      return;
    }

    if (result.outcome === "payment_pending") {
      setSubmissionState("idle");
      setMessage(result.message ?? "Payment is being prepared. Try again in a moment.");
      return;
    }

    if (result.outcome !== "fulfilled") {
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
        ticketToken: result.ticketToken,
        ticketUrl: result.ticketUrl,
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
      const firstSelection = attendeeSelections[0];
      setCompletedRegistration({
        email: result.email ?? form.email,
        ticketToken: result.ticketToken,
        ticketUrl: result.ticketUrl,
        attendees: [{
          registrationId: result.registrationId ?? "ticket-1",
          fullName,
          categoryTitle: firstSelection?.ticketType?.title ?? "",
          ticketTitle: firstSelection?.activityCategory?.title ?? null,
          qrToken: result.qrToken ?? "demo",
          manualCheckinCode: result.manualCheckinCode ?? "",
          email: form.email
        }]
      });
    }

    setMessage(result.message ?? "Your tickets are ready and we are emailing a copy.");
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
    setCheckoutToken(null);
    setPaymentPreparationState("idle");
    setPaymentPreparationMessage(null);
    setPreparedPayment(null);
    setTicketQuantities({});
    setAttendees([createAttendeeDraft(1)]);
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

  const canContinueFromTickets = canProceed;
  const categorySectionTitle = config.categoriesLabel || "Ticket type";
  const additionalSectionTitle = config.ticketOptionsLabel || "Activity category";

  function renderTicketQuantityPicker() {
    return (
      <section className="mt-6 border-t border-slate/10 pt-5 sm:mt-10 sm:pt-7">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className={BOOKING_SECTION_HEADING_CLASS}>Tickets</p>
            <p className="mt-1 font-body text-[13px] leading-relaxed text-slate sm:text-sm">
              Select the number of attendees per ticket type. You can book up to {MAX_ATTENDEES} tickets.
            </p>
          </div>
          <p className="text-sm font-bold text-ink">
            {selectedTicketCount} / {MAX_ATTENDEES} selected
          </p>
        </div>

        {categories.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            This event is missing ticket types. Please contact the organizer.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {ticketQuantityRows.map(({ category, quantity }) => {
              const capacityReached = category.remaining !== null && quantity >= category.remaining;
              const incrementDisabled = !canProceed || category.isUnavailable || selectedTicketCount >= MAX_ATTENDEES || capacityReached;
              const decrementDisabled = !canProceed || quantity <= 0;

              return (
                <div
                  key={category.id}
                  className={`rounded-2xl border px-4 py-3 sm:px-5 sm:py-4 ${
                    category.isUnavailable
                      ? "border-slate/10 bg-slate-50 text-slate/60"
                      : quantity > 0
                        ? "border-ink/30 bg-white text-ink shadow-sm"
                        : "border-slate/10 bg-white/80 text-ink"
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 [overflow-wrap:anywhere]">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-display text-base font-bold tracking-tight text-ink sm:text-lg">{category.title}</p>
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate">
                          {getAvailabilityMeta(category)}
                        </span>
                      </div>
                      {category.description ? (
                        <p className="mt-1 text-sm leading-snug text-slate">{category.description}</p>
                      ) : null}
                      {category.note ? (
                        <p className="mt-1 text-xs italic text-slate/70">{category.note}</p>
                      ) : null}
                      <p className="mt-1 text-sm font-bold text-ink">{formatPrice(category.priceMinor, category.currencyCode)}</p>
                    </div>

                    <div className="grid w-full grid-cols-[2.75rem_minmax(3rem,1fr)_2.75rem] items-center overflow-hidden rounded-2xl border border-slate/15 bg-white sm:w-36 sm:shrink-0">
                      <button
                        type="button"
                        onClick={() => updateTicketQuantity(category, -1)}
                        disabled={decrementDisabled}
                        aria-label={`Remove one ${category.title} ticket`}
                        title={`Remove one ${category.title} ticket`}
                        className="flex h-11 items-center justify-center text-ink transition hover:bg-mist disabled:cursor-not-allowed disabled:text-slate/35"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="flex h-11 items-center justify-center border-x border-slate/10 text-base font-black text-ink">
                        {quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateTicketQuantity(category, 1)}
                        disabled={incrementDisabled}
                        aria-label={`Add one ${category.title} ticket`}
                        title={`Add one ${category.title} ticket`}
                        className="flex h-11 items-center justify-center text-ink transition hover:bg-mist disabled:cursor-not-allowed disabled:text-slate/35"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {selectedTicketCount > 0 ? (
          <div className="mt-4 rounded-2xl border border-slate/10 bg-[#fbfbfc] px-4 py-3 text-sm text-slate">
            <div className="flex items-center justify-between gap-3">
              <span>Ticket subtotal</span>
              <span className="font-bold text-ink">{formatPrice(selectedTicketSubtotalMinor, selectedTicketCurrencyCode)}</span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate/80">
              Activity categories are assigned to each attendee on the next step and do not change the ticket total.
            </p>
          </div>
        ) : null}
      </section>
    );
  }

  function renderPrimaryContactFields() {
    return (
      <div className="mt-5 border-t border-slate/10 pt-5">
        <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-slate">
          Primary contact information
        </p>

        <div className="mt-3">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem] sm:items-end">
            <Field label="Email address" hint="Required" htmlFor={emailInputId}>
              <Input
                id={emailInputId}
                type="email"
                value={form.email}
                onChange={(e) => {
                  const newEmail = e.target.value;
                  setForm((current) => ({ ...current, email: newEmail }));
                  clearCheckoutSession();
                }}
                aria-invalid={requiredErrors.email || requiredErrors.emailVerified}
                className={`${FORM_CONTROL_CLASS} ${
                  requiredErrors.email || requiredErrors.emailVerified
                    ? FORM_CONTROL_ERROR_CLASS
                    : ""
                }`}
              />
            </Field>

            {!emailVerified && otpState !== "sent" ? (
              <Button
                type="button"
                onClick={async () => { await sendOtp("/api/checkout/start"); }}
                disabled={otpState === "sending" || !form.email.trim() || !isValidEmail}
                className="h-11 rounded-xl px-4 text-sm"
              >
                {otpState === "sending" ? "Sending..." : "Verify email"}
              </Button>
            ) : null}
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-slate">This will be used for your confirmation email.</p>
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
                  className={FORM_CONTROL_CLASS}
                />
                <Button
                  type="button"
                  onClick={() => { void verifyOtpCode(); }}
                  disabled={verifyingOtp || !otp.trim()}
                  className="h-11 rounded-xl px-4 text-sm"
                >
                  {verifyingOtp ? "Verifying..." : "Verify OTP"}
                </Button>
              </div>
              <button
                type="button"
                onClick={async () => { await sendOtp("/api/checkout/resend-otp"); }}
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

        <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,0.75fr)]">
          <Field label="Phone number" hint="Required">
            <Input
              value={form.phone}
              onChange={(e) => {
                setForm((current) => ({ ...current, phone: e.target.value }));
              }}
              aria-invalid={Boolean(phoneErrorMessage)}
              className={`${FORM_CONTROL_CLASS} ${phoneErrorMessage ? FORM_CONTROL_ERROR_CLASS : ""}`}
            />
            {phoneErrorMessage ? <p className="mt-2 text-sm text-rose-700">{phoneErrorMessage}</p> : null}
          </Field>

          <Field
            label={`UAE resident — ${form.uaeResident ? "Yes" : "No"}`}
            hint="Required"
            htmlFor={uaeResidentSelectId}
          >
            <Select
              id={uaeResidentSelectId}
              value={form.uaeResident ? "yes" : "no"}
              onChange={(e) => {
                setForm((current) => ({ ...current, uaeResident: e.target.value === "yes" }));
              }}
              className={`${FORM_CONTROL_CLASS} pr-10 focus:border-ink focus:ring-1 focus:ring-ink`}
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Select>
          </Field>
        </div>
      </div>
    );
  }

  function renderAssignmentSelect({
    label,
    value,
    placeholder,
    selected,
    invalid,
    onChange,
    children
  }: {
    label: string;
    value: string;
    placeholder: string;
    selected: boolean;
    invalid: boolean;
    onChange: (value: string) => void;
    children: React.ReactNode;
  }) {
    return (
      <div className="relative max-w-full sm:max-w-[24rem]">
        <Select
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`h-[50px] truncate rounded-xl py-3 pl-4 font-display text-[15px] font-bold tracking-tight shadow-none ${
            selected
              ? "!border-ink/30 !bg-[#f7f9fb] pr-10 !text-ink shadow-sm"
              : "!border-slate/15 !bg-white pr-10 !text-ink"
          } ${invalid ? "!border-rose-400 focus:!border-rose-400 focus:shadow-[0_0_0_4px_rgba(244,63,94,0.1)]" : ""}`}
          style={{
            backgroundImage: `url("data:image/svg+xml,${SELECT_CHEVRON_LIGHT}")`
          }}
        >
          <option value="">{placeholder}</option>
          {children}
        </Select>
      </div>
    );
  }

  function renderTicketTypeAssignmentControl(attendee: AttendeeDraft, showAttendeeErrors: boolean) {
    const invalid = showAttendeeErrors && !attendee.categoryId;

    if (selectedTicketTypeRows.length > 1) {
      return renderAssignmentSelect({
        label: `${categorySectionTitle} for attendee`,
        value: attendee.categoryId,
        placeholder: `Select ${categorySectionTitle.toLowerCase()}`,
        selected: Boolean(attendee.categoryId),
        invalid,
        onChange: (categoryId) => updateAttendee(attendee.id, { categoryId }),
        children: selectedTicketTypeRows.map(({ category }) => {
          const blocked = isTicketTypeBlockedForAttendee(category, attendee);
          return (
            <option key={category.id} value={category.id} disabled={blocked}>
              {category.title}
            </option>
          );
        })
      });
    }

    return (
      <div className="space-y-2.5">
        {selectedTicketTypeRows.map(({ category }) => {
          const blocked = isTicketTypeBlockedForAttendee(category, attendee);
          return (
            <SelectionCard
              key={category.id}
              title={category.title}
              description={category.description}
              note={category.note}
              selected={attendee.categoryId === category.id}
              disabled={blocked}
              fitContent
              onClick={() => updateAttendee(attendee.id, { categoryId: category.id })}
            />
          );
        })}
      </div>
    );
  }

  function renderActivityCategoryAssignmentControl(attendee: AttendeeDraft, showAttendeeErrors: boolean) {
    const invalid = showAttendeeErrors && !attendee.activityCategoryId;

    if (additionalCategories.length > 1) {
      return renderAssignmentSelect({
        label: `${additionalSectionTitle} for attendee`,
        value: attendee.activityCategoryId,
        placeholder: `Select ${additionalSectionTitle.toLowerCase()}`,
        selected: Boolean(attendee.activityCategoryId),
        invalid,
        onChange: (activityCategoryId) => updateAttendee(attendee.id, { activityCategoryId }),
        children: additionalCategories.map((category) => {
          const blocked = isOptionBlockedForAttendee(category, "activityCategoryId", attendee.id);
          return (
            <option key={category.id} value={category.id} disabled={blocked}>
              {category.title}
            </option>
          );
        })
      });
    }

    return (
      <div className="space-y-2.5">
        {additionalCategories.map((category) => {
          const blocked = isOptionBlockedForAttendee(category, "activityCategoryId", attendee.id);
          return (
            <SelectionCard
              key={category.id}
              title={category.title}
              description={category.description}
              note={category.note}
              meta={getDraftAdjustedMeta(category, "activityCategoryId", attendee.id)}
              selected={attendee.activityCategoryId === category.id}
              disabled={blocked}
              onClick={() => updateAttendee(attendee.id, { activityCategoryId: category.id })}
            />
          );
        })}
      </div>
    );
  }

  function renderAttendeeSelection(showAttendeeErrors: boolean) {
    return (
      <div className="space-y-3 sm:space-y-4">
        <div className="px-1">
          <p className={BOOKING_SECTION_HEADING_CLASS}>Attendee details</p>
          <p className="mt-1 font-body text-[13px] leading-relaxed text-slate sm:text-sm">
            Add details for each selected ticket. Activity category is a preference and does not change capacity.
          </p>
        </div>

        {additionalCategories.length === 0 ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            This event is missing activity categories. Please contact the organizer.
          </div>
        ) : null}

        {attendees.map((attendee, index) => {
          const selectedTicketType = categories.find((category) => category.id === attendee.categoryId);
          const selectedActivityCategory = additionalCategories.find((category) => category.id === attendee.activityCategoryId);
          const attendeeComplete = Boolean(
            getAttendeeName(attendee) &&
            attendee.age.trim() &&
            selectedTicketType &&
            selectedActivityCategory
          );

          return (
            <section key={attendee.id} className="rounded-2xl border border-slate/10 bg-[#fbfbfc]/70 px-4 py-4 sm:px-5 sm:py-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <p className="break-words font-display text-lg font-bold tracking-tight text-ink sm:text-xl">
                    {getAttendeeName(attendee) || `Attendee ${index + 1}`}
                  </p>
                </div>
                <span
                  className={`inline-flex w-fit rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    attendeeComplete
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-slate-100 text-slate"
                  }`}
                >
                  {attendeeComplete ? "Ready" : "Incomplete"}
                </span>
              </div>

              <div className="mt-4 space-y-5 border-t border-slate/10 pt-4">
                <div>
                  <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-slate">
                    Identity
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_8rem]">
                    <Field label="First name" hint="Required">
                      <Input
                        value={attendee.firstName}
                        onChange={(event) => updateAttendee(attendee.id, { firstName: event.target.value })}
                        aria-invalid={showAttendeeErrors && !attendee.firstName.trim()}
                        className={`${FORM_CONTROL_CLASS} ${
                          showAttendeeErrors && !attendee.firstName.trim()
                            ? FORM_CONTROL_ERROR_CLASS
                            : ""
                        }`}
                      />
                    </Field>
                    <Field label="Last name" hint="Required">
                      <Input
                        value={attendee.lastName}
                        onChange={(event) => updateAttendee(attendee.id, { lastName: event.target.value })}
                        aria-invalid={showAttendeeErrors && !attendee.lastName.trim()}
                        className={`${FORM_CONTROL_CLASS} ${
                          showAttendeeErrors && !attendee.lastName.trim()
                            ? FORM_CONTROL_ERROR_CLASS
                            : ""
                        }`}
                      />
                    </Field>
                    <Field label="Age" hint="Required">
                      <Input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={attendee.age}
                        onChange={(event) => updateAttendee(attendee.id, { age: event.target.value })}
                        aria-invalid={showAttendeeErrors && !attendee.age.trim()}
                        className={`${FORM_CONTROL_CLASS} ${
                          showAttendeeErrors && !attendee.age.trim()
                            ? FORM_CONTROL_ERROR_CLASS
                            : ""
                        }`}
                      />
                    </Field>
                  </div>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <div>
                    <div className="space-y-1.5">
                      <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-slate">{categorySectionTitle}</p>
                      {showAttendeeErrors && !selectedTicketType ? (
                        <p className="text-sm text-rose-700">Select a ticket type.</p>
                      ) : null}
                    </div>
                    <div className="mt-3">
                      {renderTicketTypeAssignmentControl(attendee, showAttendeeErrors)}
                    </div>
                  </div>

                  <div>
                    <div className="space-y-1.5">
                      <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-slate">{additionalSectionTitle}</p>
                      {showAttendeeErrors && !selectedActivityCategory ? (
                        <p className="text-sm text-rose-700">Select an activity category.</p>
                      ) : null}
                    </div>
                    <div className="mt-3">
                      {renderActivityCategoryAssignmentControl(attendee, showAttendeeErrors)}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>
    );
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
                  setOtpState("idle");
                  setOtp("");
                  setOtpMessage(null);
                  setEmailVerified(false);
                  setCheckoutToken(null);
                  setPaymentPreparationState("idle");
                  setPaymentPreparationMessage(null);
                  setPreparedPayment(null);
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
          <div className="min-w-0 px-3.5 py-4 sm:px-6 sm:py-7 lg:px-8 lg:py-8">
            {completedRegistration && completedRegistration.attendees.length > 0 ? (
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
                <TicketWallet
                  event={event}
                  attendees={completedRegistration.attendees}
                  ticketToken={completedRegistration.ticketToken}
                  ticketUrl={completedRegistration.ticketUrl}
                  mapLink={mapLink}
                  showHeader={false}
                />
              </div>
            ) : step === "tickets" ? (
              <div className="max-w-3xl">
                <h1 className="font-title text-3xl font-black italic leading-[1.1] tracking-tight text-ink sm:text-5xl">{event.title}</h1>
                {introLine ? (
                  <p className="mt-2 font-body text-sm leading-relaxed text-slate sm:mt-3 sm:text-lg">{introLine}</p>
                ) : null}

                {visibleParagraphs.length > 0 ? (
                  <div className="mt-3 space-y-1.5 font-body text-[13px] leading-relaxed text-slate sm:text-[15px]">
                    {visibleParagraphs.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                ) : null}

                {descriptionParagraphs.length > 2 ? (
                  <button
                    type="button"
                    onClick={() => setExpandedDescription((current) => !current)}
                    className="mt-1.5 font-display text-[13px] font-bold text-[#2e768b] transition hover:text-[#205260] sm:text-sm"
                  >
                    {expandedDescription ? "Show less ^" : "Show more v"}
                  </button>
                ) : null}

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

                {renderTicketQuantityPicker()}

                {registrationState.state !== "open" ? (
                  <p className="mt-6 rounded-xl bg-rose-50 px-3.5 py-2.5 text-[13px] text-rose-700 sm:mt-10 sm:rounded-2xl sm:px-4 sm:py-3 sm:text-sm">
                    {registrationState.label}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="max-w-3xl">
                <h1 className="font-title text-2xl font-black italic leading-tight tracking-tight text-ink sm:text-4xl">{event.title}</h1>
                <p className="mt-1 text-[13px] leading-snug text-slate sm:mt-2 sm:text-base">{formatTicketDateTimeLine(event)}</p>

                {renderPrimaryContactFields()}

                <div className="mt-5 border-t border-slate/10 pt-5 sm:mt-8 sm:pt-7">
                  {renderAttendeeSelection(showFieldErrors)}
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
                {posterImage ? (
                  <div className="mx-auto hidden max-w-[276px] overflow-hidden rounded-2xl border border-slate/10 bg-white sm:block">
                    <div className="relative bg-white">
                      <img src={posterImage} alt={event.title} className="block h-auto w-full" loading="lazy" decoding="async" />
                    </div>
                  </div>
                ) : null}

                <div className={`${posterImage ? "mt-2 sm:mt-6" : "mt-0"} rounded-[1.75rem] border border-white/70 bg-white/80 p-4 shadow-soft backdrop-blur-sm sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none`}>
                  <h3 className="font-title text-xl font-black italic leading-tight tracking-tight text-ink sm:text-2xl lg:text-[2rem]">Registration summary</h3>

                  <div className="mt-3 rounded-[1.5rem] border border-slate/10 bg-white px-4 py-4 shadow-sm sm:mt-6 sm:space-y-4 sm:px-5 sm:py-5">
                    <div className="border-b border-slate/10 pb-3 font-body text-[13px] text-slate sm:text-[15px]">
                      {step === "details" ? (
                        <>
                          <p className="font-display font-bold tracking-tight text-ink">Booking progress</p>
                          <p className="mt-1 text-sm text-slate">{selectedTicketCount} attendee{selectedTicketCount === 1 ? "" : "s"} selected</p>
                          <div className="mt-3 space-y-2">
                            {([
                              ["Contact", contactComplete],
                              ["Attendees", attendeesComplete],
                              ["Terms", termsComplete]
                            ] as Array<[string, boolean]>).map(([label, complete]) => (
                              <div key={label} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate">
                                <span className="font-semibold text-ink">{label}</span>
                                <span className={complete ? "font-semibold text-emerald-700" : "text-slate"}>
                                  {complete ? "Complete" : "Pending"}
                                </span>
                              </div>
                            ))}
                          </div>
                          <p className="mt-2 text-sm font-bold text-ink">{formatPrice(selectedTicketSubtotalMinor, selectedTicketCurrencyCode)}</p>
                        </>
                      ) : (
                        <>
                          <p className="font-display font-bold tracking-tight text-ink">Selected tickets</p>
                          {selectedTicketTypeRows.length > 0 ? (
                            <>
                              <div className="mt-2 space-y-1.5">
                                {selectedTicketTypeRows.map(({ category, quantity }) => (
                                  <div key={category.id} className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate">
                                    <span className="font-semibold text-ink">{category.title}</span>
                                    <span className="shrink-0">{quantity}x</span>
                                  </div>
                                ))}
                              </div>
                              <p className="mt-2 text-sm font-bold text-ink">{formatPrice(selectedTicketSubtotalMinor, selectedTicketCurrencyCode)}</p>
                            </>
                          ) : (
                            <p className="mt-1 text-sm text-slate">Choose tickets by ticket type to continue.</p>
                          )}
                        </>
                      )}
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
                        const ticketError = validateTicketQuantities();
                        if (ticketError) {
                          setMessage(ticketError);
                          return;
                        }
                        setSubmitAttempted(false);
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
                      const attendeeError = validateAttendeeDrafts();
                      if (attendeeError) {
                        setMessage(attendeeError);
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
                      if (!checkoutToken) {
                        setMessage("Please request a new verification code before continuing.");
                        return;
                      }
                      if (!form.phone.trim()) {
                        setMessage("Please enter your phone number.");
                        return;
                      }
                      if (!form.declarationAccepted) {
                        setMessage("Please accept the Terms & Conditions.");
                        return;
                      }

                      void submitRegistration();
                    }}
                    disabled={step === "tickets" ? !canContinueFromTickets : submissionState === "submitting" || !readyForPayment}
                    className="mt-4 w-full rounded-xl bg-black py-2.5 font-display text-[14px] font-bold tracking-tight text-white shadow-[0_18px_40px_-24px_rgba(15,23,42,0.45)] hover:bg-black/90 sm:mt-6 sm:rounded-2xl sm:py-3.5 sm:text-base"
                  >
                    {step === "tickets"
                      ? "Continue"
                      : submissionState === "submitting"
                        ? selectedTicketSubtotalMinor > 0 ? "Opening secure payment..." : "Completing registration..."
                        : !emailVerified ? "Verify email to continue"
                          : !attendeesComplete ? "Complete attendee details"
                            : !termsComplete ? "Accept terms to continue"
                              : selectedTicketSubtotalMinor > 0 ? "Continue to payment" : "Complete registration"}
                  </Button>

                  {step === "details" && selectedTicketSubtotalMinor > 0 && readyForPayment && (preparedPaymentReady || paymentPreparationMessage) ? (
                    <p className={`mt-3 text-sm ${preparedPaymentReady ? "text-emerald-700" : "text-slate"}`}>
                      {preparedPaymentReady ? "Secure payment is ready." : paymentPreparationMessage}
                    </p>
                  ) : null}

                  {message && submissionState !== "submitting" ? (
                    <p className="mt-3 text-sm text-rose-700">{message}</p>
                  ) : null}
                </div>
              </div>
            </aside>
          ) : null}
        </div>
      </div>

      {paymentRedirectInProgress ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 px-4 text-center text-ink backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          <div className="w-full max-w-md rounded-[28px] border border-white/20 bg-white px-5 py-6 shadow-[0_28px_90px_rgba(0,0,0,0.32)] sm:px-7 sm:py-8">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#2c7a86]/10 text-[#2c7a86]">
              <Loader2 className="h-7 w-7 animate-spin" />
            </div>
            <h2 className="mt-5 font-title text-2xl font-black italic leading-tight tracking-tight sm:text-3xl">
              {paymentRedirectIsSlow ? "Still opening secure payment" : "Opening secure payment"}
            </h2>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-slate sm:text-base">
              {paymentRedirectIsSlow
                ? "This is taking longer than usual. Please keep this page open while we connect to the secure payment page."
                : "Please keep this page open. We are connecting you to the secure payment page now."}
            </p>
            <p className="mt-5 rounded-2xl bg-mist px-3 py-2 text-xs font-semibold text-slate">
              {paymentRedirectIsSlow ? "If this fails, you can try again without re-entering your details." : "Do not refresh or close this page."}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
