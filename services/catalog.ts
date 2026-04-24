import "server-only";
import { DEFAULT_CATEGORY } from "@/lib/constants";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { EventCatalog, EventCatalogOption, EventRecord, EventTicketOption } from "@/lib/types";
import { resolveCategories } from "@/lib/utils";

type CatalogRow = {
  id: string;
  event_id: string;
  public_id: string;
  title: string;
  description: string | null;
  note: string | null;
  badge: string | null;
  capacity: number | null;
  price_minor: number | null;
  currency_code: string | null;
  active: boolean | null;
  sold_out: boolean | null;
  sort_order: number | null;
};

function mapCatalogRow(row: CatalogRow): EventCatalogOption {
  return {
    id: row.id,
    publicId: row.public_id,
    eventId: row.event_id,
    title: row.title,
    description: row.description ?? "",
    note: row.note,
    badge: row.badge,
    capacity: row.capacity,
    priceMinor: row.price_minor ?? 0,
    currencyCode: row.currency_code ?? "AED",
    active: row.active ?? true,
    soldOut: row.sold_out ?? false,
    sortOrder: row.sort_order ?? 0
  };
}

function fallbackCatalogFromEvent(event: EventRecord): EventCatalog {
  const categories = resolveCategories(event.form_config).map((category, index) => ({
    id: category.id,
    publicId: category.id,
    eventId: event.id,
    title: category.title,
    description: category.description,
    note: category.note ?? null,
    badge: category.badge ?? null,
    capacity: category.capacity ?? null,
    priceMinor: category.priceMinor ?? 0,
    currencyCode: category.currencyCode ?? "AED",
    active: true,
    soldOut: category.soldOut ?? false,
    sortOrder: index
  }));

  const addons = (event.form_config?.ticketOptions ?? []).map((addon, index) => ({
    id: addon.id,
    publicId: addon.id,
    eventId: event.id,
    title: addon.title,
    description: addon.description,
    note: addon.note ?? null,
    badge: addon.badge ?? null,
    capacity: addon.capacity ?? null,
    priceMinor: addon.priceMinor ?? 0,
    currencyCode: addon.currencyCode ?? "AED",
    active: true,
    soldOut: addon.soldOut ?? false,
    sortOrder: index
  }));

  return { categories, addons };
}

export async function getEventCatalog(event: EventRecord): Promise<EventCatalog> {
  const supabase = createAdminSupabaseClient();
  const [categoriesResult, addonsResult] = await Promise.all([
    supabase
      .from("event_categories")
      .select("*")
      .eq("event_id", event.id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("event_addons")
      .select("*")
      .eq("event_id", event.id)
      .order("sort_order", { ascending: true })
  ]);

  if (categoriesResult.error || addonsResult.error) {
    return fallbackCatalogFromEvent(event);
  }

  const categories = ((categoriesResult.data ?? []) as CatalogRow[]).map(mapCatalogRow);
  const addons = ((addonsResult.data ?? []) as CatalogRow[]).map(mapCatalogRow);

  if (categories.length === 0) {
    return fallbackCatalogFromEvent(event);
  }

  return { categories, addons };
}

export function catalogOptionToTicketOption(option: EventCatalogOption): EventTicketOption {
  return {
    id: option.publicId || DEFAULT_CATEGORY.id,
    title: option.title,
    description: option.description,
    note: option.note ?? undefined,
    badge: option.badge ?? undefined,
    capacity: option.capacity,
    soldOut: option.soldOut || !option.active,
    priceMinor: option.priceMinor,
    currencyCode: option.currencyCode,
    catalogId: option.id
  };
}

export function formatMinorCurrency(amountMinor: number, currencyCode = "AED") {
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 2
  }).format(amountMinor / 100);
}
