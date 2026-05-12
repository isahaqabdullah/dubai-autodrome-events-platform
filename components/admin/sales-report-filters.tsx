"use client";

import type { Route } from "next";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

interface EventOption {
  id: string;
  title: string;
}

function buildSalesHref(date: string, eventId: string) {
  const params = new URLSearchParams();

  if (date) {
    params.set("date", date);
  }

  if (eventId) {
    params.set("eventId", eventId);
  }

  const query = params.toString();
  return query ? `/admin/sales?${query}` : "/admin/sales";
}

export function SalesReportFilters({
  events,
  selectedDate,
  selectedEventId
}: {
  events: EventOption[];
  selectedDate: string;
  selectedEventId?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [dateValue, setDateValue] = useState(selectedDate);
  const [eventIdValue, setEventIdValue] = useState(selectedEventId ?? "");
  const selectedEventUnavailable = Boolean(selectedEventId) && !events.some((event) => event.id === selectedEventId);

  useEffect(() => {
    setDateValue(selectedDate);
  }, [selectedDate]);

  useEffect(() => {
    setEventIdValue(selectedEventId ?? "");
  }, [selectedEventId]);

  function replace(date: string, eventId: string) {
    startTransition(() => {
      router.replace(buildSalesHref(date, eventId) as Route, { scroll: false });
    });
  }

  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-2">
      <span className="shrink-0 self-start rounded bg-ink px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
        Filter
      </span>
      <Input
        type="date"
        value={dateValue}
        disabled={isPending}
        onChange={(event) => {
          const nextDate = event.target.value;
          setDateValue(nextDate);
          replace(nextDate, eventIdValue);
        }}
        className="w-full rounded-lg border-ink/25 bg-white px-2.5 py-1.5 text-sm font-medium shadow-sm focus:border-ink/40 focus:ring-1 focus:ring-ink/20 disabled:cursor-wait disabled:opacity-70 md:w-auto"
      />
      <Select
        value={eventIdValue}
        disabled={isPending}
        onChange={(event) => {
          const nextEventId = event.target.value;
          setEventIdValue(nextEventId);
          replace(dateValue, nextEventId);
        }}
        className="w-full rounded-lg border-ink/25 bg-white px-2.5 py-1.5 text-sm font-medium shadow-sm focus:border-ink/40 focus:ring-1 focus:ring-ink/20 disabled:cursor-wait disabled:opacity-70 md:w-auto"
      >
        <option value="">All events</option>
        {selectedEventUnavailable ? <option value={selectedEventId}>Selected event unavailable</option> : null}
        {events.map((event) => (
          <option key={event.id} value={event.id}>
            {event.title}
          </option>
        ))}
      </Select>
    </div>
  );
}
