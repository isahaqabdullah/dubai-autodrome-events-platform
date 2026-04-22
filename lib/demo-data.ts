import type { EventAnalyticsSummary, EventRecord, RecentScanActivity, RegistrationRecord } from "@/lib/types";

export const demoEvents: EventRecord[] = [
  {
    id: "6db7f8b7-4e20-410e-9a1d-78c7bfc2f101",
    slug: "dubai-autodrome-safety-orientation-may-2026",
    title: "Dubai Autodrome Safety Orientation · May 2026",
    description:
      "Recurring site safety orientation configured as an event edition, not a custom-coded landing page.",
    venue: "Dubai Autodrome Training Hall, Dubai",
    timezone: "Asia/Dubai",
    start_at: "2026-05-22T05:00:00.000Z",
    end_at: "2026-05-22T08:00:00.000Z",
    registration_opens_at: "2026-04-01T08:00:00.000Z",
    registration_closes_at: "2026-05-21T16:00:00.000Z",
    status: "open",
    capacity: 120,
    declaration_version: 1,
    declaration_text:
      "I confirm that my registration details are accurate, I will follow all event-day safety instructions, and I understand that my QR code is unique to this event edition.",
    form_config: {
      submitLabel: "Confirm attendance",
      ticketOptions: [
        {
          id: "bootcamp-1830",
          title: "Bootcamp Admission - 18:30",
          note: "Select ONE session only (18:30 OR 19:30). Do not select both.",
          description:
            "A unique bootcamp using functional training equipment made from real kart parts. Designed to build strength, endurance, and overall fitness in a dynamic group setting.",
          badge: "Maxed out",
          soldOut: true
        },
        {
          id: "bootcamp-1930",
          title: "Bootcamp Admission - 19:30",
          note: "Select ONE session only (18:30 OR 19:30). Do not select both.",
          description:
            "A unique bootcamp using functional training equipment made from real kart parts. Designed to build strength, endurance, and overall fitness in a dynamic group setting.",
          badge: "Maxed out",
          soldOut: true
        }
      ],
    },
    created_at: "2026-04-01T08:00:00.000Z",
    updated_at: "2026-04-01T08:00:00.000Z"
  },
  {
    id: "e0f850ba-f86d-4f47-85a4-b9dd602f95f5",
    slug: "dubai-autodrome-safety-orientation-june-2026",
    title: "Dubai Autodrome Safety Orientation · June 2026",
    description:
      "Second recurring edition using the exact same reusable registration flow, declaration handling, and check-in surface.",
    venue: "Dubai Autodrome Training Hall, Dubai",
    timezone: "Asia/Dubai",
    start_at: "2026-06-19T05:00:00.000Z",
    end_at: "2026-06-19T08:00:00.000Z",
    registration_opens_at: "2026-05-15T08:00:00.000Z",
    registration_closes_at: "2026-06-18T16:00:00.000Z",
    status: "draft",
    capacity: 140,
    declaration_version: 2,
    declaration_text:
      "I confirm that the information provided is accurate and that this declaration applies specifically to the selected event occurrence.",
    form_config: {
      submitLabel: "Reserve my place"
    },
    created_at: "2026-04-02T08:00:00.000Z",
    updated_at: "2026-04-02T08:00:00.000Z"
  }
];

export const demoRegistrations: Array<
  Pick<
    RegistrationRecord,
    | "id"
    | "event_id"
    | "full_name"
    | "email_raw"
    | "manual_checkin_code"
    | "phone"
    | "age"
    | "uae_resident"
    | "category_id"
    | "category_title"
    | "ticket_option_id"
    | "ticket_option_title"
    | "status"
    | "checked_in_at"
    | "created_at"
  >
> = [
  {
    id: "40d7d9e0-4e01-4c45-a807-bcb66ef67ba2",
    event_id: demoEvents[0].id,
    full_name: "Amina Rahman",
    email_raw: "amina.rahman@example.com",
    manual_checkin_code: "A7K3",
    phone: "+971-50-555-0198",
    age: 29,
    uae_resident: true,
    category_id: "general-admission",
    category_title: "General Admission",
    ticket_option_id: null,
    ticket_option_title: "General Admission",
    status: "checked_in",
    checked_in_at: "2026-05-22T05:18:00.000Z",
    created_at: "2026-04-09T09:00:00.000Z"
  },
  {
    id: "a59562d5-c7fa-4446-8aaf-bca6e0fd7af1",
    event_id: demoEvents[0].id,
    full_name: "Daniel Mensah",
    email_raw: "daniel.mensah@example.com",
    manual_checkin_code: "B4N8",
    phone: "+971-50-555-0129",
    age: 34,
    uae_resident: false,
    category_id: "general-admission",
    category_title: "General Admission",
    ticket_option_id: "bootcamp-1930",
    ticket_option_title: "General Admission with Bootcamp Admission - 19:30",
    status: "registered",
    checked_in_at: null,
    created_at: "2026-04-11T10:00:00.000Z"
  },
  {
    id: "d18aa83c-7c8d-409a-b8eb-59cf49e97741",
    event_id: demoEvents[0].id,
    full_name: "Leila Haddad",
    email_raw: "leila.haddad@example.com",
    manual_checkin_code: "C9R5",
    phone: "+971-50-555-0176",
    age: 26,
    uae_resident: true,
    category_id: "general-admission",
    category_title: "General Admission",
    ticket_option_id: null,
    ticket_option_title: "General Admission",
    status: "revoked",
    checked_in_at: null,
    created_at: "2026-04-13T11:00:00.000Z"
  }
];

export const demoRecentScans: RecentScanActivity[] = [
  {
    id: "1f0f46b8-4f01-4ff8-8f75-1d30c035e0ad",
    result: "success",
    gate_name: "Main gate",
    scanned_at: "2026-05-22T05:18:00.000Z",
    registration: {
      id: demoRegistrations[0].id,
      full_name: demoRegistrations[0].full_name,
      email_raw: demoRegistrations[0].email_raw,
      phone: demoRegistrations[0].phone,
      status: "checked_in",
      category_title: "General Admission"
    }
  },
  {
    id: "d1a72f97-f6d1-4d44-a50c-38672d4d27f0",
    result: "already_checked_in",
    gate_name: "Main gate",
    scanned_at: "2026-05-22T05:19:00.000Z",
    registration: {
      id: demoRegistrations[0].id,
      full_name: demoRegistrations[0].full_name,
      email_raw: demoRegistrations[0].email_raw,
      phone: demoRegistrations[0].phone,
      status: "checked_in",
      category_title: "General Admission"
    }
  },
  {
    id: "c7f342ef-3f52-4a79-9685-27bb7cdfdf1b",
    result: "invalid_token",
    gate_name: "North gate",
    scanned_at: "2026-05-22T05:23:00.000Z",
    registration: null
  }
];

export const demoAnalyticsSummary: EventAnalyticsSummary = {
  totalRegistered: 3,
  totalCheckedIn: 1,
  deskCheckedIn: 1,
  remaining: 2,
  totalScans: 3,
  duplicateScans: 1,
  invalidScans: 1
};
