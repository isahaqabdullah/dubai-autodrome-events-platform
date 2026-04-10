"use client";

import { useEffect, useRef, useState } from "react";
import type { EventAnalyticsSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

interface RecentScanRow {
  id: string;
  result: string;
  gate_name: string | null;
  scanned_at: string;
  registration: {
    full_name?: string;
    email_raw?: string;
  } | null;
}

function applySummaryUpdate(summary: EventAnalyticsSummary, result: string): EventAnalyticsSummary {
  const next = {
    ...summary,
    totalScans: summary.totalScans + 1
  };

  if (result === "success") {
    return {
      ...next,
      totalCheckedIn: summary.totalCheckedIn + 1,
      remaining: Math.max(summary.remaining - 1, 0)
    };
  }

  if (result === "already_checked_in") {
    return {
      ...next,
      duplicateScans: summary.duplicateScans + 1
    };
  }

  return {
    ...next,
    invalidScans: summary.invalidScans + 1
  };
}

export function ScanConsole({
  eventId,
  initialRecentScans,
  initialSummary
}: {
  eventId: string;
  initialRecentScans: RecentScanRow[];
  initialSummary: EventAnalyticsSummary;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [token, setToken] = useState("");
  const [gateName, setGateName] = useState("Main gate");
  const [deviceId, setDeviceId] = useState("");
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState(initialSummary);
  const [recentScans, setRecentScans] = useState(initialRecentScans);
  const [result, setResult] = useState<{
    result: string;
    message: string;
    full_name?: string | null;
  } | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function submitToken(nextToken: string) {
    const normalized = nextToken.replace(/[\r\n]+/g, "").trim();

    if (!normalized || busy) {
      return;
    }

    setBusy(true);

    const response = await fetch("/api/checkin/scan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        eventId,
        token: normalized,
        gateName,
        deviceId
      })
    });

    const data = (await response.json()) as {
      result?: string;
      message?: string;
      fullName?: string | null;
      recentScan?: RecentScanRow;
    };

    setBusy(false);
    setToken("");

    const nextResult = data.result ?? "invalid_token";
    setResult({
      result: nextResult,
      message: data.message ?? "Unable to process scan.",
      full_name: data.fullName ?? null
    });
    setSummary((current) => applySummaryUpdate(current, nextResult));

    if (data.recentScan) {
      const nextScan = data.recentScan;
      setRecentScans((current) => [nextScan, ...current].slice(0, 10));
    }

    inputRef.current?.focus();
  }

  const progressPercent =
    summary.totalRegistered > 0
      ? Math.min((summary.totalCheckedIn / summary.totalRegistered) * 100, 100)
      : 0;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_360px]">
      <div className="card-panel overflow-hidden p-5 sm:p-6">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-gold/60 via-ember/50 to-aurora/70" />
        <div className="relative space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[24px] border border-slate/10 bg-white/80 p-4">
              <p className="section-title">Checked in so far</p>
              <p className="mt-3 text-4xl font-semibold tracking-tight text-ink">{summary.totalCheckedIn}</p>
            </div>
            <div className="rounded-[24px] border border-slate/10 bg-white/80 p-4">
              <p className="section-title">Remaining</p>
              <p className="mt-3 text-4xl font-semibold tracking-tight text-ink">{summary.remaining}</p>
            </div>
            <div className="rounded-[24px] border border-slate/10 bg-white/80 p-4">
              <p className="section-title">Attempts</p>
              <p className="mt-3 text-4xl font-semibold tracking-tight text-ink">{summary.totalScans}</p>
            </div>
          </div>

          <div className="rounded-[28px] border border-slate/10 bg-mist/40 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="section-title">Scanner-first station</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Scan continuously</h2>
              </div>
              <div className="rounded-[20px] border border-slate/10 bg-white/80 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">Arrival progress</p>
                <p className="mt-1 text-lg font-semibold tracking-tight text-ink">
                  {summary.totalCheckedIn} / {summary.totalRegistered || 0}
                </p>
              </div>
            </div>

            <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/80">
              <div
                className="h-full rounded-full bg-gradient-to-r from-ember to-gold transition-[width]"
                style={{ width: `${Math.max(progressPercent, summary.totalCheckedIn > 0 ? 8 : 0)}%` }}
              />
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="space-y-4">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-ink">Scan token or QR payload</span>
                  <input
                    ref={inputRef}
                    value={token}
                    className="h-20 w-full rounded-[24px] border border-slate/15 bg-white/95 px-5 text-2xl font-semibold tracking-[0.08em] text-ink outline-none transition placeholder:text-slate/60 focus:border-ink/30 focus:shadow-[0_0_0_4px_rgba(19,32,42,0.06)]"
                    placeholder="Ready to scan"
                    onChange={async (eventObject) => {
                      const nextValue = eventObject.target.value;
                      setToken(nextValue);

                      if (/\r|\n/.test(nextValue)) {
                        await submitToken(nextValue);
                      }
                    }}
                    onKeyDown={async (eventObject) => {
                      if (eventObject.key === "Enter") {
                        eventObject.preventDefault();
                        await submitToken(token);
                      }
                    }}
                  />
                </label>

                <div
                  className={cn(
                    "rounded-[24px] border px-5 py-5 transition",
                    result?.result === "success" && "border-emerald-200 bg-emerald-100 text-emerald-900",
                    result?.result === "already_checked_in" && "border-amber-200 bg-amber-100 text-amber-900",
                    result &&
                      result.result !== "success" &&
                      result.result !== "already_checked_in" &&
                      "border-rose-200 bg-rose-100 text-rose-900",
                    !result && "border-slate/10 bg-white/80 text-slate"
                  )}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                    {result ? result.result.replaceAll("_", " ") : "Awaiting scan"}
                  </p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight">
                    {result?.full_name ?? "Ready for the next attendee"}
                  </p>
                  <p className="mt-2 text-sm">{result?.message ?? "Ready."}</p>
                </div>
              </div>

              <div className="grid gap-4">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-ink">Gate name</span>
                  <input
                    value={gateName}
                    className="w-full rounded-2xl border border-slate/15 bg-white/90 px-4 py-3 text-sm text-ink outline-none transition focus:border-ink/30 focus:bg-white focus:shadow-[0_0_0_4px_rgba(19,32,42,0.06)]"
                    onChange={(eventObject) => setGateName(eventObject.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-ink">Device id</span>
                  <input
                    value={deviceId}
                    className="w-full rounded-2xl border border-slate/15 bg-white/90 px-4 py-3 text-sm text-ink outline-none transition focus:border-ink/30 focus:bg-white focus:shadow-[0_0_0_4px_rgba(19,32,42,0.06)]"
                    placeholder="Optional"
                    onChange={(eventObject) => setDeviceId(eventObject.target.value)}
                  />
                </label>

                <button
                  type="button"
                  disabled={busy}
                  className="inline-flex items-center justify-center rounded-2xl border border-ink bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:bg-ink/92 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={async () => submitToken(token)}
                >
                  {busy ? "Checking..." : "Submit scan"}
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-2xl border border-slate/15 bg-white/85 px-4 py-3 text-sm font-semibold text-ink transition hover:border-slate/30 hover:bg-white"
                  onClick={() => {
                    setToken("");
                    setResult(null);
                    inputRef.current?.focus();
                  }}
                >
                  Clear station
                </button>

                <div className="rounded-[22px] border border-slate/10 bg-white/80 p-4 text-sm text-slate">
                  <p className="font-semibold text-ink">Live scan quality</p>
                  <div className="mt-3 flex items-center justify-between">
                    <span>Duplicates</span>
                    <span className="font-semibold text-ink">{summary.duplicateScans}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span>Invalid</span>
                    <span className="font-semibold text-ink">{summary.invalidScans}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card-panel p-5 sm:p-6">
        <p className="section-title">Recent activity</p>
        <h3 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Latest scan attempts</h3>

        <div className="mt-5 space-y-3">
          {recentScans.length === 0 ? (
            <div className="rounded-[24px] border border-slate/10 bg-mist/35 px-4 py-5 text-sm text-slate">
              No scan attempts yet.
            </div>
          ) : null}
          {recentScans.map((scan) => (
            <div key={scan.id} className="rounded-[24px] border border-slate/10 bg-white/80 px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{scan.registration?.full_name ?? "Unknown attendee"}</p>
                  <p className="truncate text-sm text-slate">{scan.registration?.email_raw ?? scan.result}</p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
                    scan.result === "success" && "border-emerald-200 bg-emerald-100 text-emerald-800",
                    scan.result === "already_checked_in" && "border-amber-200 bg-amber-100 text-amber-800",
                    scan.result !== "success" &&
                      scan.result !== "already_checked_in" &&
                      "border-rose-200 bg-rose-100 text-rose-800"
                  )}
                >
                  {scan.result.replaceAll("_", " ")}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate">
                {scan.gate_name ?? "Unspecified gate"} · {new Date(scan.scanned_at).toLocaleTimeString()}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
