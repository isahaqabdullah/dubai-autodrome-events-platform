import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { demoAnalyticsSummary, demoRecentScans, demoRegistrations } from "@/lib/demo-data";
import { isDemoMode } from "@/lib/demo-mode";
import { hashOpaqueToken } from "@/lib/tokens";
import type { EventAnalyticsSummary, RecentScanActivity } from "@/lib/types";
import { blankToNull } from "@/lib/utils";

interface PerformScanInput {
  eventId: string;
  token: string;
  gateName?: string | null;
  deviceId?: string | null;
  staffUserId?: string | null;
}

interface ManualCheckinInput {
  eventId: string;
  registrationId: string;
  gateName?: string | null;
  deviceId?: string | null;
  staffUserId?: string | null;
}

export async function performCheckinScan(input: PerformScanInput) {
  if (isDemoMode()) {
    if (input.token.trim().toUpperCase() === "DEMO-VALID") {
      return {
        result: "success",
        registration_id: demoRegistrations[1]?.id ?? null,
        full_name: demoRegistrations[1]?.full_name ?? null,
        event_id: input.eventId,
        checked_in_at: new Date().toISOString(),
        registration_status: "checked_in",
        message: "Demo mode: check-in accepted."
      };
    }

    if (input.token.trim().toUpperCase() === "DEMO-DUPLICATE") {
      return {
        result: "already_checked_in",
        registration_id: demoRegistrations[0]?.id ?? null,
        full_name: demoRegistrations[0]?.full_name ?? null,
        event_id: input.eventId,
        checked_in_at: demoRegistrations[0]?.checked_in_at ?? null,
        registration_status: "checked_in",
        message: "Demo mode: attendee already checked in."
      };
    }

    return {
      result: "invalid_token",
      registration_id: null,
      full_name: null,
      event_id: input.eventId,
      checked_in_at: null,
      registration_status: null,
      message: "Demo mode: token not recognized."
    };
  }

  const supabase = createAdminSupabaseClient();

  const { data, error } = await supabase.rpc("perform_checkin_scan", {
    p_event_id: input.eventId,
    p_qr_token_hash: hashOpaqueToken(input.token.trim()),
    p_gate_name: blankToNull(input.gateName),
    p_device_id: blankToNull(input.deviceId),
    p_staff_user_id: input.staffUserId ?? null
  });

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data[0] : null;
}

export async function manualCheckin(input: ManualCheckinInput) {
  if (isDemoMode()) {
    const registration = demoRegistrations.find((row) => row.id === input.registrationId);

    return {
      result: "success",
      registration_id: registration?.id ?? null,
      full_name: registration?.full_name ?? null,
      event_id: input.eventId,
      checked_in_at: new Date().toISOString(),
      registration_status: "checked_in",
      message: "Demo mode: manual check-in accepted."
    };
  }

  const supabase = createAdminSupabaseClient();

  const { data, error } = await supabase.rpc("manual_checkin_registration", {
    p_event_id: input.eventId,
    p_registration_id: input.registrationId,
    p_gate_name: blankToNull(input.gateName),
    p_device_id: blankToNull(input.deviceId),
    p_staff_user_id: input.staffUserId ?? null
  });

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data[0] : null;
}

export async function searchRegistrationsForEvent(eventId: string, query: string) {
  if (isDemoMode()) {
    const needle = query.trim().toLowerCase();

    if (!needle) {
      return [];
    }

    return demoRegistrations
      .filter((row) => row.event_id === eventId)
      .filter(
        (row) =>
          row.full_name.toLowerCase().includes(needle) ||
          row.email_raw.toLowerCase().includes(needle) ||
          (row.phone ?? "").toLowerCase().includes(needle)
      );
  }

  const supabase = createAdminSupabaseClient();
  const needle = query.trim();

  if (!needle) {
    return [];
  }

  const { data, error } = await supabase
    .from("registrations")
    .select("id, full_name, email_raw, phone, company, status, checked_in_at, created_at")
    .eq("event_id", eventId)
    .or(`full_name.ilike.%${needle}%,email_raw.ilike.%${needle}%,phone.ilike.%${needle}%`)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function getRecentCheckins(eventId: string, limit = 10) {
  if (isDemoMode()) {
    return demoRecentScans.filter((row) => row.registration?.id || row.result).slice(0, limit);
  }

  const supabase = createAdminSupabaseClient();

  const { data, error } = await supabase
    .from("checkins")
    .select(
      "id, result, gate_name, scanned_at, registration:registrations(id, full_name, email_raw, phone, status)"
    )
    .eq("event_id", eventId)
    .order("scanned_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    result: row.result as RecentScanActivity["result"],
    gate_name: (row.gate_name as string | null) ?? null,
    scanned_at: row.scanned_at as string,
    registration: Array.isArray(row.registration)
      ? ((row.registration[0] as RecentScanActivity["registration"]) ?? null)
      : ((row.registration as RecentScanActivity["registration"]) ?? null)
  }));
}

function countByHour(timestamps: string[]) {
  const buckets = new Map<string, number>();

  timestamps.forEach((value) => {
    const date = new Date(value);
    const bucket = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
      date.getUTCDate()
    ).padStart(2, "0")} ${String(date.getUTCHours()).padStart(2, "0")}:00`;
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
  });

  return Array.from(buckets.entries())
    .map(([label, count]) => ({
      label,
      count
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function countByGate(gates: Array<string | null>) {
  const buckets = new Map<string, number>();

  gates.forEach((gate) => {
    const key = gate ?? "Unspecified gate";
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  });

  return Array.from(buckets.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count);
}

export async function getScanAnalytics(eventId: string) {
  if (isDemoMode()) {
    return {
      summary: demoAnalyticsSummary,
      scansByGate: [
        { name: "Main gate", count: 2 },
        { name: "North gate", count: 1 }
      ],
      scansOverTime: [
        { label: "2026-05-22 05:00", count: 1 },
        { label: "2026-05-22 05:15", count: 2 }
      ],
      recentActivity: demoRecentScans
    };
  }

  const supabase = createAdminSupabaseClient();

  const [registrationTotal, checkedInTotal, allCheckins, recentActivity] = await Promise.all([
    supabase.from("registrations").select("*", { count: "exact", head: true }).eq("event_id", eventId),
    supabase
      .from("registrations")
      .select("*", { count: "exact", head: true })
      .eq("event_id", eventId)
      .not("checked_in_at", "is", null),
    supabase
      .from("checkins")
      .select("result, gate_name, scanned_at")
      .eq("event_id", eventId)
      .order("scanned_at", { ascending: true }),
    getRecentCheckins(eventId, 200)
  ]);

  if (registrationTotal.error) throw registrationTotal.error;
  if (checkedInTotal.error) throw checkedInTotal.error;
  if (allCheckins.error) throw allCheckins.error;

  const checkinRows = allCheckins.data ?? [];
  let duplicateCount = 0;
  let invalidCount = 0;

  for (const row of checkinRows) {
    if (row.result === "already_checked_in") duplicateCount++;
    else if (row.result === "invalid_token" || row.result === "revoked" || row.result === "wrong_event")
      invalidCount++;
  }

  const summary: EventAnalyticsSummary = {
    totalRegistered: registrationTotal.count ?? 0,
    totalCheckedIn: checkedInTotal.count ?? 0,
    remaining: Math.max((registrationTotal.count ?? 0) - (checkedInTotal.count ?? 0), 0),
    totalScans: checkinRows.length,
    duplicateScans: duplicateCount,
    invalidScans: invalidCount
  };

  return {
    summary,
    scansByGate: countByGate(checkinRows.map((row) => row.gate_name as string | null)),
    scansOverTime: countByHour(checkinRows.map((row) => row.scanned_at as string)),
    recentActivity
  };
}
