import type { EventFormConfig, EventRecord } from "@/lib/types";

export interface TicketPresentationAttendee {
  registrationId?: string | null;
  fullName: string;
  categoryTitle?: string | null;
  ticketTitle?: string | null;
  admissionLabel?: string | null;
  qrToken?: string | null;
  manualCheckinCode?: string | null;
}

export type TicketEventLike = Pick<EventRecord, "title" | "venue" | "start_at" | "end_at" | "timezone">;

export const DEFAULT_TICKET_POSTER_IMAGE = "/train-with-dubai-police-cover.png";

function splitAdmissionLabel(label: string | null | undefined) {
  if (!label) {
    return { categoryLabel: "Event Access", addOnLabel: null as string | null };
  }

  const [categoryLabel, ...rest] = label.split(" + ");
  const addOnLabel = rest.length > 0 ? rest.join(" + ") : null;

  return {
    categoryLabel: categoryLabel.trim() || "Event Access",
    addOnLabel: addOnLabel?.trim() || null
  };
}

export function getTicketPosterImageSrc(formConfig: EventFormConfig | null | undefined) {
  return formConfig?.posterImage?.trim() || DEFAULT_TICKET_POSTER_IMAGE;
}

export function buildTicketAdmissionLabel(attendee: TicketPresentationAttendee) {
  if (attendee.admissionLabel?.trim()) {
    return attendee.admissionLabel.trim();
  }

  const categoryTitle = attendee.categoryTitle?.trim();
  const ticketTitle = attendee.ticketTitle?.trim();

  if (categoryTitle && ticketTitle) {
    return `${categoryTitle} + ${ticketTitle}`;
  }

  return categoryTitle || ticketTitle || "General Admission";
}

export function formatTicketDateTimeLine(event: TicketEventLike) {
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

function buildTicketReference(attendee: TicketPresentationAttendee) {
  const source = attendee.registrationId?.replace(/[^a-z0-9]/gi, "")
    || attendee.qrToken?.replace(/[^a-z0-9]/gi, "")
    || "confirmed";

  return source.slice(0, 10).toUpperCase();
}

function buildVenueParts(venue: string | null) {
  const full = venue?.trim() || "Venue to be announced";
  const [short, ...rest] = full.split(",").map((part) => part.trim()).filter(Boolean);

  return {
    venueFull: full,
    venueShort: short || full,
    venueSecondary: rest.join(", ") || null
  };
}

export function buildTicketPresentation(event: TicketEventLike, attendee: TicketPresentationAttendee) {
  const admissionLabel = buildTicketAdmissionLabel(attendee);
  const derivedLabels = splitAdmissionLabel(admissionLabel);
  const start = new Date(event.start_at);
  const end = new Date(event.end_at);
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: event.timezone,
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(start);
  const dateBadge = new Intl.DateTimeFormat("en-US", {
    timeZone: event.timezone,
    month: "short",
    day: "numeric"
  }).format(start);
  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: event.timezone,
    hour: "numeric",
    minute: "2-digit"
  });
  const startTime = timeFormatter.format(start);
  const timeRange = `${startTime} - ${timeFormatter.format(end)}`;
  const venueParts = buildVenueParts(event.venue);

  return {
    title: event.title,
    attendeeName: attendee.fullName,
    admissionLabel,
    categoryLabel: attendee.categoryTitle?.trim() || derivedLabels.categoryLabel,
    addOnLabel: attendee.ticketTitle?.trim() || derivedLabels.addOnLabel,
    ticketReference: buildTicketReference(attendee),
    dateBadge,
    dateLabel,
    timeRange,
    startTime,
    dateTimeLine: formatTicketDateTimeLine(event),
    ...venueParts
  };
}
