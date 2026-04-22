"use client";

import type { Route } from "next";
import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const DEFAULT_PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;

interface EventOption {
  id: string;
  title: string;
}

interface CategoryOption {
  value: string;
  label: string;
}

function buildHref(pathname: string, params: URLSearchParams) {
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function RegistrationsFilters({
  events,
  selectedEventId,
  category,
  categoryOptions,
  status,
  query,
  pageSize,
  pageSizeOptions
}: {
  events: EventOption[];
  selectedEventId?: string;
  category?: string;
  categoryOptions: CategoryOption[];
  status?: string;
  query?: string;
  pageSize: number;
  pageSizeOptions: readonly number[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [eventIdValue, setEventIdValue] = useState(selectedEventId ?? "");
  const [categoryValue, setCategoryValue] = useState(category ?? "");
  const [statusValue, setStatusValue] = useState(status ?? "");
  const [queryValue, setQueryValue] = useState(query ?? "");
  const [pageSizeValue, setPageSizeValue] = useState(String(pageSize));

  useEffect(() => {
    setEventIdValue(selectedEventId ?? "");
  }, [selectedEventId]);

  useEffect(() => {
    setCategoryValue(category ?? "");
  }, [category]);

  useEffect(() => {
    setStatusValue(status ?? "");
  }, [status]);

  useEffect(() => {
    setQueryValue(query ?? "");
  }, [query]);

  useEffect(() => {
    setPageSizeValue(String(pageSize));
  }, [pageSize]);

  function replaceFilters(next: {
    eventId?: string;
    category?: string;
    status?: string;
    query?: string;
    pageSize?: string;
    resetActivityPage?: boolean;
  }) {
    const params = new URLSearchParams(searchParams.toString());
    const nextEventId = next.eventId ?? eventIdValue;
    const nextCategory = next.category ?? categoryValue;
    const nextStatus = next.status ?? statusValue;
    const nextQuery = next.query ?? queryValue;
    const nextPageSize = next.pageSize ?? pageSizeValue;

    if (nextEventId) {
      params.set("eventId", nextEventId);
    } else {
      params.delete("eventId");
    }

    if (nextStatus) {
      params.set("status", nextStatus);
    } else {
      params.delete("status");
    }

    if (nextCategory) {
      params.set("category", nextCategory);
    } else {
      params.delete("category");
    }

    const trimmedQuery = nextQuery.trim();
    if (trimmedQuery) {
      params.set("q", trimmedQuery);
    } else {
      params.delete("q");
    }

    if (nextPageSize && Number.parseInt(nextPageSize, 10) !== DEFAULT_PAGE_SIZE) {
      params.set("pageSize", nextPageSize);
    } else {
      params.delete("pageSize");
    }

    params.delete("page");

    if (next.resetActivityPage) {
      params.delete("aPage");
    }

    const currentHref = buildHref(pathname, new URLSearchParams(searchParams.toString()));
    const nextHref = buildHref(pathname, params);

    if (nextHref === currentHref) {
      return;
    }

    startTransition(() => {
      router.replace(nextHref as Route, { scroll: false });
    });
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const currentQuery = searchParams.get("q") ?? "";
      if (queryValue.trim() === currentQuery) {
        return;
      }

      const params = new URLSearchParams(searchParams.toString());
      const trimmedQuery = queryValue.trim();

      if (trimmedQuery) {
        params.set("q", trimmedQuery);
      } else {
        params.delete("q");
      }

      if (eventIdValue) {
        params.set("eventId", eventIdValue);
      } else {
        params.delete("eventId");
      }

      if (statusValue) {
        params.set("status", statusValue);
      } else {
        params.delete("status");
      }

      if (categoryValue) {
        params.set("category", categoryValue);
      } else {
        params.delete("category");
      }

      if (Number.parseInt(pageSizeValue, 10) !== DEFAULT_PAGE_SIZE) {
        params.set("pageSize", pageSizeValue);
      } else {
        params.delete("pageSize");
      }

      params.delete("page");

      const currentHref = buildHref(pathname, new URLSearchParams(searchParams.toString()));
      const nextHref = buildHref(pathname, params);

      if (nextHref === currentHref) {
        return;
      }

      startTransition(() => {
        router.replace(nextHref as Route, { scroll: false });
      });
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [categoryValue, eventIdValue, pageSizeValue, pathname, queryValue, router, searchParams, statusValue]);

  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
      <span className="shrink-0 self-start rounded bg-ink px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
        Filter
      </span>
      <Select
        value={eventIdValue}
        onChange={(event) => {
          const nextValue = event.target.value;
          setEventIdValue(nextValue);
          replaceFilters({ eventId: nextValue, resetActivityPage: true });
        }}
        className="rounded-lg border-ink/25 bg-white px-2.5 py-1.5 text-sm font-medium shadow-sm focus:border-ink/40 focus:ring-1 focus:ring-ink/20"
      >
        <option value="">All events</option>
        {events.map((event) => (
          <option key={event.id} value={event.id}>
            {event.title}
          </option>
        ))}
      </Select>
      <Select
        value={categoryValue}
        onChange={(event) => {
          const nextValue = event.target.value;
          setCategoryValue(nextValue);
          replaceFilters({ category: nextValue });
        }}
        className="rounded-lg border-ink/25 bg-white px-2.5 py-1.5 text-sm font-medium shadow-sm focus:border-ink/40 focus:ring-1 focus:ring-ink/20"
      >
        <option value="">All categories</option>
        {categoryOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      <Select
        value={statusValue}
        onChange={(event) => {
          const nextValue = event.target.value;
          setStatusValue(nextValue);
          replaceFilters({ status: nextValue });
        }}
        className="rounded-lg border-ink/25 bg-white px-2.5 py-1.5 text-sm font-medium shadow-sm focus:border-ink/40 focus:ring-1 focus:ring-ink/20"
      >
        <option value="">All statuses</option>
        <option value="registered">Registered</option>
        <option value="checked_in">Checked in</option>
        <option value="revoked">Revoked</option>
        <option value="cancelled">Cancelled</option>
      </Select>
      <Input
        value={queryValue}
        onChange={(event) => {
          setQueryValue(event.target.value);
        }}
        placeholder="Search name, email, phone"
        className="rounded-lg border-ink/25 bg-white px-2.5 py-1.5 text-sm shadow-sm"
      />
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-xs font-medium text-slate">Show</span>
        <Select
          value={pageSizeValue}
          onChange={(event) => {
            const nextValue = event.target.value;
            setPageSizeValue(nextValue);
            replaceFilters({ pageSize: nextValue });
          }}
          className="min-w-[5.5rem] rounded-lg border-ink/25 bg-white px-2.5 py-1.5 text-sm font-medium shadow-sm focus:border-ink/40 focus:ring-1 focus:ring-ink/20 sm:w-auto"
        >
          {pageSizeOptions.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </Select>
        <span className="shrink-0 text-xs text-slate">rows</span>
      </div>
      {isPending ? <span className="text-xs font-medium text-slate">Updating...</span> : null}
    </div>
  );
}
