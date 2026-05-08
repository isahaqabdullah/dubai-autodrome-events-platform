"use client";

import type { Route } from "next";
import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/select";

interface EventOption {
  id: string;
  title: string;
}

function buildPaymentsHref(eventId: string, returnTo: string | null) {
  const params = new URLSearchParams();

  if (eventId) {
    params.set("eventId", eventId);
  }

  if (returnTo) {
    params.set("returnTo", returnTo);
  }

  const query = params.toString();
  return query ? `/admin/payments?${query}` : "/admin/payments";
}

export function PaymentsFilter({
  events,
  selectedEventId
}: {
  events: EventOption[];
  selectedEventId?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [eventIdValue, setEventIdValue] = useState(selectedEventId ?? "");
  const selectedEventUnavailable = Boolean(selectedEventId) && !events.some((event) => event.id === selectedEventId);

  useEffect(() => {
    setEventIdValue(selectedEventId ?? "");
  }, [selectedEventId]);

  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
      <span className="shrink-0 self-start rounded bg-ink px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
        Filter
      </span>
      <Select
        value={eventIdValue}
        disabled={isPending}
        onChange={(event) => {
          const nextValue = event.target.value;
          setEventIdValue(nextValue);
          startTransition(() => {
            router.replace(buildPaymentsHref(nextValue, searchParams.get("returnTo")) as Route, { scroll: false });
          });
        }}
        className="rounded-lg border-ink/25 bg-white px-2.5 py-1.5 text-sm font-medium shadow-sm focus:border-ink/40 focus:ring-1 focus:ring-ink/20 disabled:cursor-wait disabled:opacity-70"
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
