export type EventStatus = "draft" | "open" | "closed" | "live" | "archived";
export type RegistrationStatus = "registered" | "checked_in" | "cancelled" | "revoked";
export type CheckinResult =
  | "success"
  | "already_checked_in"
  | "invalid_token"
  | "revoked"
  | "wrong_event";
export type EmailJobKind = "verify_email" | "registration_confirmed" | "resend_qr";
export type AppUserRole = "admin" | "staff";

export interface EventTicketOption {
  id: string;
  title: string;
  description: string;
  note?: string;
  badge?: string;
  capacity?: number | null;
  soldOut?: boolean;
}

export interface EventFormConfig {
  submitLabel?: string;
  mapLink?: string;
  categoriesLabel?: string;
  ticketOptionsLabel?: string;
  categories?: EventTicketOption[];
  ticketOptions?: EventTicketOption[];
  posterImage?: string;
  introLine?: string;
  descriptionParagraphs?: string[];
  emailIntroLine?: string;
  emailDescriptionParagraphs?: string[];
  disclaimerPdfUrl?: string | null;
  disclaimerHeading?: string;
}

export interface EventRecord {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  venue: string | null;
  timezone: string;
  start_at: string;
  end_at: string;
  registration_opens_at: string | null;
  registration_closes_at: string | null;
  status: EventStatus;
  capacity: number | null;
  declaration_version: number;
  declaration_text: string;
  form_config: EventFormConfig | null;
  created_at: string;
  updated_at: string;
}

export interface RegistrationRecord {
  id: string;
  event_id: string;
  full_name: string;
  email_raw: string;
  email_normalized: string;
  manual_checkin_code: string;
  phone: string | null;
  age: number | null;
  uae_resident: boolean;

  category_id: string | null;
  category_title: string | null;
  ticket_option_id: string | null;
  ticket_option_title: string | null;
  declaration_version: number;
  declaration_accepted_at: string;
  email_verified_at: string;
  status: RegistrationStatus;
  qr_token_hash: string;
  qr_token_last_rotated_at: string;
  confirmation_email_sent_at: string | null;
  checked_in_at: string | null;
  booking_id: string | null;
  is_primary: boolean;
  registered_by_email: string | null;
  created_at: string;
  updated_at: string;
}

export interface RegistrationWindowState {
  state: "not_open_yet" | "open" | "closed";
  label: string;
}

export interface EventAnalyticsSummary {
  totalRegistered: number;
  totalCheckedIn: number;
  deskCheckedIn: number;
  remaining: number;
  totalScans: number;
  duplicateScans: number;
  invalidScans: number;
}

export interface RecentScanActivity {
  id: string;
  result: CheckinResult;
  gate_name: string | null;
  scanned_at: string;
  registration: Pick<RegistrationRecord, "id" | "full_name" | "email_raw" | "phone" | "status" | "category_title"> | null;
}
