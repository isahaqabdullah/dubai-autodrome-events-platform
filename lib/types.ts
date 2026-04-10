export type EventStatus = "draft" | "open" | "closed" | "live" | "archived";
export type RegistrationStatus = "registered" | "checked_in" | "cancelled" | "revoked";
export type CheckinResult =
  | "success"
  | "already_checked_in"
  | "invalid_token"
  | "revoked"
  | "wrong_event";
export type EmailJobKind = "verify_email" | "registration_confirmed" | "resend_qr";
export type EmailJobStatus = "queued" | "processing" | "sent" | "failed";
export type AppUserRole = "admin" | "staff";

export interface EventFormConfig {
  submitLabel?: string;
  introNote?: string;
  successMessage?: string;
  showCompanyField?: boolean;
  showEmergencyFields?: boolean;
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

export interface PendingRegistrationRecord {
  id: string;
  event_id: string;
  full_name: string;
  email_raw: string;
  email_normalized: string;
  phone: string | null;
  company: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  declaration_version: number;
  declaration_accepted: boolean;
  verification_token_hash: string;
  verification_expires_at: string;
  verified_at: string | null;
  source_ip: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface RegistrationRecord {
  id: string;
  event_id: string;
  full_name: string;
  email_raw: string;
  email_normalized: string;
  phone: string | null;
  company: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  declaration_version: number;
  declaration_accepted_at: string;
  email_verified_at: string;
  status: RegistrationStatus;
  qr_token_hash: string;
  qr_token_last_rotated_at: string;
  confirmation_email_sent_at: string | null;
  checked_in_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CheckinRecord {
  id: string;
  registration_id: string | null;
  event_id: string;
  result: CheckinResult;
  gate_name: string | null;
  device_id: string | null;
  staff_user_id: string | null;
  scanned_at: string;
}

export interface AuditLogRecord {
  id: string;
  actor_type: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  before_json: Record<string, unknown> | null;
  after_json: Record<string, unknown> | null;
  created_at: string;
}

export interface EmailJobRecord {
  id: string;
  kind: EmailJobKind;
  payload: Record<string, unknown>;
  status: EmailJobStatus;
  attempts: number;
  last_error: string | null;
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
  registration: Pick<RegistrationRecord, "id" | "full_name" | "email_raw" | "phone" | "status"> | null;
}
