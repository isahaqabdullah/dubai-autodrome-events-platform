import type { EventAnalyticsSummary } from "@/lib/types";

export function AnalyticsCards({
  summary,
  hideDetail = false
}: {
  summary: EventAnalyticsSummary;
  hideDetail?: boolean;
}) {
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
    <div className="grid grid-cols-3 gap-2 lg:grid-cols-6">
      {items.map((item) => (
        <div key={item.label} className="admin-card px-2.5 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate">{item.label}</p>
          <p className="mt-0.5 text-lg font-semibold tracking-tight text-ink">{item.value}</p>
          {!hideDetail ? <p className="mt-0.5 text-[11px] leading-tight text-slate">{item.detail}</p> : null}
        </div>
      ))}
    </div>
  );
}
