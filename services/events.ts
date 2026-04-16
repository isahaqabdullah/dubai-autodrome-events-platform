import "server-only";
import { demoEvents, demoRegistrations } from "@/lib/demo-data";
import { isDemoMode } from "@/lib/demo-mode";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { EventRecord } from "@/lib/types";

type RegistrationSummary = {
  count: number;
  ticketCounts: Record<string, number>;
  categoryCounts: Record<string, number>;
};

type RegistrationSummaryRpcRow = {
  registration_count: number | string | null;
  ticket_counts: Record<string, number | string> | null;
  category_counts: Record<string, number | string> | null;
};

function parseCountMap(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, rawValue]) => [
      key,
      typeof rawValue === "number" ? rawValue : Number(rawValue ?? 0)
    ])
  );
}

function canFallbackToLegacySummary(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false;
  }

  return error.code === "PGRST202" || error.code === "42883" || error.message?.includes("get_registration_summary") === true;
}

export async function listUpcomingEvents() {
  if (isDemoMode()) {
    return demoEvents.filter((event) => ["open", "closed", "live"].includes(event.status));
  }

  const supabase = createAdminSupabaseClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("events")
    .select("*")
    .in("status", ["open", "closed", "live"])
    .gte("end_at", now)
    .order("start_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as EventRecord[];
}

export async function listAdminEvents() {
  if (isDemoMode()) {
    return demoEvents;
  }

  const supabase = createAdminSupabaseClient();

  const { data, error } = await supabase
    .from("events")
    .select("*")
    .order("start_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as EventRecord[];
}

export async function getEventBySlug(slug: string) {
  if (isDemoMode()) {
    return demoEvents.find((event) => event.slug === slug) ?? null;
  }

  const supabase = createAdminSupabaseClient();

  const { data, error } = await supabase.from("events").select("*").eq("slug", slug).maybeSingle();

  if (error) {
    throw error;
  }

  return (data as EventRecord | null) ?? null;
}

export async function getEventById(id: string) {
  if (isDemoMode()) {
    return demoEvents.find((event) => event.id === id) ?? null;
  }

  const supabase = createAdminSupabaseClient();

  const { data, error } = await supabase.from("events").select("*").eq("id", id).maybeSingle();

  if (error) {
    throw error;
  }

  return (data as EventRecord | null) ?? null;
}

export async function getRegistrationCountForEvent(eventId: string) {
  if (isDemoMode()) {
    return demoRegistrations.filter((registration) => registration.event_id === eventId).length;
  }

  const supabase = createAdminSupabaseClient();

  const { count, error } = await supabase
    .from("registrations")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

export async function getRegistrationSummaryForEvent(
  eventId: string
): Promise<RegistrationSummary> {
  if (isDemoMode()) {
    return {
      count: demoRegistrations.filter((r) => r.event_id === eventId).length,
      ticketCounts: {},
      categoryCounts: {}
    };
  }

  const supabase = createAdminSupabaseClient();
  const { data: rpcData, error: rpcError } = await supabase.rpc("get_registration_summary", {
    p_event_id: eventId
  });

  if (!rpcError) {
    const summary = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as RegistrationSummaryRpcRow | null;

    return {
      count: Number(summary?.registration_count ?? 0),
      ticketCounts: parseCountMap(summary?.ticket_counts),
      categoryCounts: parseCountMap(summary?.category_counts)
    };
  }

  if (!canFallbackToLegacySummary(rpcError)) {
    throw rpcError;
  }

  const { data, error, count } = await supabase
    .from("registrations")
    .select("ticket_option_id, category_id", { count: "exact" })
    .eq("event_id", eventId);

  if (error) {
    throw error;
  }

  const ticketCounts: Record<string, number> = {};
  const categoryCounts: Record<string, number> = {};

  for (const row of data ?? []) {
    const ticketId = row.ticket_option_id as string | null;
    if (ticketId) {
      ticketCounts[ticketId] = (ticketCounts[ticketId] ?? 0) + 1;
    }
    const categoryId = row.category_id as string | null;
    if (categoryId) {
      categoryCounts[categoryId] = (categoryCounts[categoryId] ?? 0) + 1;
    }
  }

  return { count: count ?? 0, ticketCounts, categoryCounts };
}
