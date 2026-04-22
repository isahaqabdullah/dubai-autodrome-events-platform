"use client";

import { useEffect, useMemo, useState } from "react";
import { Hash, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn, isSyntheticEmail } from "@/lib/utils";

const SEARCH_DEBOUNCE_MS = 250;
const SEARCH_MIN_LENGTH = 4;

type FeedbackState = {
  tone: "success" | "warning" | "error";
  message: string;
};

type SearchResultRow = {
  id: string;
  full_name: string;
  email_raw: string;
  phone?: string | null;
  status: string;
  checked_in_at?: string | null;
};

function FeedbackBanner({ feedback }: { feedback: FeedbackState | null }) {
  if (!feedback) {
    return null;
  }

  return (
    <div
      className={cn(
        "mt-3 rounded-2xl border px-4 py-3 text-sm font-medium",
        feedback.tone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-800",
        feedback.tone === "warning" && "border-amber-200 bg-amber-50 text-amber-800",
        feedback.tone === "error" && "border-rose-200 bg-rose-50 text-rose-800"
      )}
    >
      {feedback.message}
    </div>
  );
}

function displaySearchEmail(row: SearchResultRow) {
  return isSyntheticEmail(row.email_raw) ? "No email on file" : row.email_raw;
}

export function ManualCheckinByCode({
  eventId,
  className
}: {
  eventId: string;
  className?: string;
}) {
  const [manualCheckinCode, setManualCheckinCode] = useState("");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = manualCheckinCode.trim().toUpperCase();

    if (!trimmed) return;

    setPending(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/admin/manual-checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, manualCheckinCode: trimmed })
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setFeedback({ tone: "error", message: data?.message ?? "Check-in failed." });
        return;
      }

      setFeedback({
        tone: data?.result === "already_checked_in" ? "warning" : "success",
        message: data?.message ?? "Checked in."
      });
      setManualCheckinCode("");
    } catch {
      setFeedback({ tone: "error", message: "Unable to reach the check-in service." });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={cn("w-full", className)}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-ink">Manual code</span>
          <div className="relative">
            <Hash className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate" />
            <input
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              maxLength={4}
              value={manualCheckinCode}
              onChange={(e) => {
                setManualCheckinCode(e.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, "").slice(0, 4));
                setFeedback(null);
              }}
              placeholder="AB23"
              className="w-full rounded-2xl border border-slate/15 bg-white py-3.5 pl-11 pr-4 text-sm font-semibold uppercase tracking-[0.32em] text-ink outline-none transition placeholder:text-slate/70 focus:border-[#2f7b76]/30 focus:bg-white focus:shadow-[0_0_0_4px_rgba(47,123,118,0.08)]"
              required
            />
          </div>
        </label>

        <button
          type="submit"
          disabled={pending || manualCheckinCode.trim().length !== 4}
          className="admin-action-primary w-full rounded-2xl py-3.5 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Checking in..." : "Check in by code"}
        </button>
      </form>

      <FeedbackBanner feedback={feedback} />
    </div>
  );
}

export function ManualCheckinByName({
  eventId,
  className
}: {
  eventId: string;
  className?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultRow[]>([]);
  const [pendingSearch, setPendingSearch] = useState(false);
  const [pendingCheckinId, setPendingCheckinId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const trimmedQuery = query.trim();
  const showRecommendations = trimmedQuery.length >= SEARCH_MIN_LENGTH;

  useEffect(() => {
    if (!showRecommendations) {
      setPendingSearch(false);
      setSearchError(null);
      setResults([]);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setPendingSearch(true);
      setSearchError(null);

      try {
        const response = await fetch(
          `/api/admin/search-registrations?eventId=${encodeURIComponent(eventId)}&q=${encodeURIComponent(trimmedQuery)}`,
          { signal: controller.signal }
        );
        const data = await response.json().catch(() => null);

        if (!response.ok) {
          setResults([]);
          setSearchError(data?.message ?? "Unable to search attendees right now.");
          return;
        }

        setResults(Array.isArray(data?.rows) ? data.rows : []);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setResults([]);
        setSearchError("Unable to search attendees right now.");
      } finally {
        if (!controller.signal.aborted) {
          setPendingSearch(false);
        }
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [eventId, showRecommendations, trimmedQuery]);

  const recommendationLabel = useMemo(() => {
    if (!showRecommendations) {
      return "Type at least 4 characters to search by attendee name.";
    }

    if (pendingSearch) {
      return "Searching attendees...";
    }

    if (searchError) {
      return searchError;
    }

    if (results.length === 0) {
      return "No matching attendees found.";
    }

    return `${results.length} recommendation${results.length === 1 ? "" : "s"} found.`;
  }, [pendingSearch, results.length, searchError, showRecommendations]);

  async function handleCheckin(row: SearchResultRow) {
    setPendingCheckinId(row.id);
    setFeedback(null);

    try {
      const response = await fetch("/api/admin/manual-checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, registrationId: row.id })
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setFeedback({ tone: "error", message: data?.message ?? "Check-in failed." });
        return;
      }

      const resultTone = data?.result === "already_checked_in" ? "warning" : "success";
      setFeedback({ tone: resultTone, message: data?.message ?? `${row.full_name} checked in.` });
      setResults((current) =>
        current.map((entry) =>
          entry.id === row.id
            ? {
                ...entry,
                status: data?.result === "success" ? "checked_in" : entry.status,
                checked_in_at: data?.result === "success" ? new Date().toISOString() : entry.checked_in_at
              }
            : entry
        )
      );
      router.refresh();
    } catch {
      setFeedback({ tone: "error", message: "Unable to reach the check-in service." });
    } finally {
      setPendingCheckinId(null);
    }
  }

  return (
    <div className={cn("w-full", className)}>
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-ink">Attendee name</span>
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate" />
          <input
            type="text"
            value={query}
            onChange={(eventObject) => {
              setQuery(eventObject.target.value);
              setFeedback(null);
              setSearchError(null);
            }}
            placeholder="Start typing a name..."
            className="w-full rounded-2xl border border-slate/15 bg-white py-3.5 pl-11 pr-4 text-sm font-medium text-ink outline-none transition placeholder:text-slate/70 focus:border-[#2f7b76]/30 focus:bg-white focus:shadow-[0_0_0_4px_rgba(47,123,118,0.08)]"
          />
        </div>
      </label>

      <p className="mt-2 text-sm text-slate">{recommendationLabel}</p>

      {showRecommendations && results.length > 0 ? (
        <div className="mt-3 overflow-hidden rounded-2xl border border-slate/10 bg-white">
          <ul className="divide-y divide-slate/10">
            {results.map((row) => {
              const canCheckIn = row.status === "registered";

              return (
                <li key={row.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{row.full_name}</p>
                    <p className="truncate text-xs text-slate">{displaySearchEmail(row)}</p>
                    {row.phone ? <p className="truncate text-xs text-slate">{row.phone}</p> : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]",
                        row.status === "checked_in" && "border-emerald-200 bg-emerald-50 text-emerald-700",
                        row.status === "registered" && "border-slate/15 bg-slate-50 text-slate",
                        (row.status === "revoked" || row.status === "cancelled") &&
                          "border-rose-200 bg-rose-50 text-rose-700"
                      )}
                    >
                      {row.status.replaceAll("_", " ")}
                    </span>

                    {canCheckIn ? (
                      <button
                        type="button"
                        onClick={() => {
                          void handleCheckin(row);
                        }}
                        disabled={pendingCheckinId !== null}
                        className="admin-action-primary rounded-xl px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {pendingCheckinId === row.id ? "Checking in..." : "Check in"}
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <FeedbackBanner feedback={feedback} />
    </div>
  );
}
