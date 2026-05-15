import "server-only";
import { demoEventGroups, demoEvents, demoRegistrations } from "@/lib/demo-data";
import { isDemoMode } from "@/lib/demo-mode";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { EventGroup, EventRecord } from "@/lib/types";

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

export type EventGroupWithEvents = EventGroup & {
  events: EventRecord[];
};

const LEGACY_EVENT_GROUP: EventGroup = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Events",
  slug: "events",
  description: null,
  sort_order: 0,
  active: true,
  created_at: "1970-01-01T00:00:00.000Z",
  updated_at: "1970-01-01T00:00:00.000Z"
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

function canFallbackToLegacyEventGroups(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false;
  }

  return (
    error.code === "PGRST200" ||
    error.code === "PGRST202" ||
    error.code === "PGRST205" ||
    error.message?.includes("event_groups") === true
  );
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

export async function listUpcomingEventsForGroup(groupId: string) {
  const events = await listUpcomingEvents();

  if (groupId === LEGACY_EVENT_GROUP.id) {
    try {
      const groups = await listEventGroups();
      const groupIds = new Set(groups.map((group) => group.id));
      return events.filter((event) => !groupIds.has(event.event_group_id));
    } catch (error) {
      if (canFallbackToLegacyEventGroups(error as { code?: string; message?: string })) {
        return events;
      }

      throw error;
    }
  }

  return events.filter((event) => event.event_group_id === groupId);
}

async function hasLegacyUngroupedEvents() {
  const events = await listUpcomingEvents();

  try {
    const groups = await listEventGroups();
    const groupIds = new Set(groups.map((group) => group.id));
    return events.some((event) => !groupIds.has(event.event_group_id));
  } catch (error) {
    if (canFallbackToLegacyEventGroups(error as { code?: string; message?: string })) {
      return events.length > 0;
    }

    throw error;
  }
}

export async function listEventGroups(options: { includeInactive?: boolean } = {}) {
  if (isDemoMode()) {
    return demoEventGroups;
  }

  const supabase = createAdminSupabaseClient();

  let query = supabase
    .from("event_groups")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (!options.includeInactive) {
    query = query.eq("active", true);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []) as EventGroup[];
}

export async function getEventGroupBySlug(slug: string, options: { includeInactive?: boolean } = {}) {
  if (isDemoMode()) {
    return demoEventGroups.find((group) => group.slug === slug && (options.includeInactive || group.active)) ?? null;
  }

  const supabase = createAdminSupabaseClient();

  let query = supabase
    .from("event_groups")
    .select("*")
    .eq("slug", slug);

  if (!options.includeInactive) {
    query = query.eq("active", true);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    if (canFallbackToLegacyEventGroups(error)) {
      if (slug === LEGACY_EVENT_GROUP.slug) {
        return LEGACY_EVENT_GROUP;
      }

      return null;
    }

    throw error;
  }

  if (!data && slug === LEGACY_EVENT_GROUP.slug && (await hasLegacyUngroupedEvents())) {
    return LEGACY_EVENT_GROUP;
  }

  return (data as EventGroup | null) ?? null;
}

export async function getEventBySlugForGroup(eventSlug: string, groupId: string) {
  if (isDemoMode()) {
    return groupId === LEGACY_EVENT_GROUP.id
      ? demoEvents.find((event) => event.slug === eventSlug) ?? null
      : demoEvents.find((event) => event.slug === eventSlug && event.event_group_id === groupId) ?? null;
  }

  if (groupId === LEGACY_EVENT_GROUP.id) {
    const event = await getEventBySlug(eventSlug);

    if (!event) {
      return null;
    }

    try {
      const groups = await listEventGroups();
      const groupIds = new Set(groups.map((group) => group.id));
      return groupIds.has(event.event_group_id) ? null : event;
    } catch (error) {
      if (canFallbackToLegacyEventGroups(error as { code?: string; message?: string })) {
        return event;
      }

      throw error;
    }
  }

  const supabase = createAdminSupabaseClient();

  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("slug", eventSlug)
    .eq("event_group_id", groupId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as EventRecord | null) ?? null;
}

export async function listUpcomingEventGroups(): Promise<EventGroupWithEvents[]> {
  const events = await listUpcomingEvents();
  let eventGroups: EventGroup[];

  try {
    eventGroups = await listEventGroups();
  } catch (error) {
    if (canFallbackToLegacyEventGroups(error as { code?: string; message?: string })) {
      return [{ ...LEGACY_EVENT_GROUP, events }];
    }

    throw error;
  }

  const groupsById = new Map(eventGroups.map((group) => [group.id, { ...group, events: [] as EventRecord[] }]));
  const ungroupedEvents: EventRecord[] = [];

  for (const event of events) {
    const group = groupsById.get(event.event_group_id);
    if (group) {
      group.events.push({
        ...event,
        event_group: group
      });
    } else {
      ungroupedEvents.push(event);
    }
  }

  const groupedEvents = [...groupsById.values()].filter((group) => group.events.length > 0);

  return ungroupedEvents.length > 0
    ? [...groupedEvents, { ...LEGACY_EVENT_GROUP, events: ungroupedEvents }]
    : groupedEvents;
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

  const events = (data ?? []) as EventRecord[];

  try {
    const eventGroups = await listEventGroups({ includeInactive: true });
    const groupsById = new Map(eventGroups.map((group) => [group.id, group]));

    return events.map((event) => ({
      ...event,
      event_group: groupsById.get(event.event_group_id) ?? null
    }));
  } catch (error) {
    if (canFallbackToLegacyEventGroups(error as { code?: string; message?: string })) {
      return events;
    }

    throw error;
  }
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
