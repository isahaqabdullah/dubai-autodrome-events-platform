import type { EventAnalyticsSummary } from "@/lib/types";

export function AnalyticsCards({ summary }: { summary: EventAnalyticsSummary }) {
  const items = [
    {
      label: "Registered",
      value: summary.totalRegistered,
      detail: "Guests confirmed for this edition"
    },
    {
      label: "Checked in",
      value: summary.totalCheckedIn,
      detail: "Successful arrivals so far"
    },
    {
      label: "Remaining",
      value: summary.remaining,
      detail: "Registered guests still to arrive"
    },
    {
      label: "Scan attempts",
      value: summary.totalScans,
      detail: "All accepted and rejected scans"
    },
    {
      label: "Duplicates",
      value: summary.duplicateScans,
      detail: "Already-checked-in rescans"
    },
    {
      label: "Invalid",
      value: summary.invalidScans,
      detail: "Wrong event, revoked, or invalid tokens"
    }
  ];

  return (
    <div className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="card-panel overflow-hidden p-4 sm:p-5">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-gold/60 via-ember/50 to-aurora/70" />
          <p className="section-title">{item.label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{item.value}</p>
          <p className="mt-2 text-sm text-slate">{item.detail}</p>
        </div>
      ))}
    </div>
  );
}
