import { Download } from "lucide-react";
import { SalesReportFilters } from "@/components/admin/sales-report-filters";
import { salesReportQuerySchema } from "@/lib/validation/admin";
import { getDailySalesReport, getDubaiDateInputValue, formatSalesMoneyMinor } from "@/services/admin";
import { listAdminEvents } from "@/services/events";

export const dynamic = "force-dynamic";

const SALES_TIME_ZONE = "Asia/Dubai";

function formatSalesDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: SALES_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function buildDownloadHref(date: string, eventId?: string) {
  const params = new URLSearchParams({ date });

  if (eventId) {
    params.set("eventId", eventId);
  }

  return `/api/admin/export/sales?${params.toString()}`;
}

export default async function AdminSalesPage({
  searchParams
}: {
  searchParams: Promise<{ date?: string; eventId?: string }>;
}) {
  const params = await searchParams;
  const fallbackDate = getDubaiDateInputValue();
  const parsed = salesReportQuerySchema.safeParse({
    date: params.date ?? fallbackDate,
    eventId: params.eventId?.trim() || undefined
  });
  const filters = parsed.success ? parsed.data : { date: fallbackDate, eventId: undefined };
  const [events, report] = await Promise.all([
    listAdminEvents(),
    getDailySalesReport(filters)
  ]);
  const selectedEvent = filters.eventId ? events.find((event) => event.id === filters.eventId) ?? null : null;

  return (
    <main className="admin-page">
      <section className="admin-card p-2.5 sm:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <p className="admin-label">Daily Sales</p>
            <h2 className="mt-0.5 text-sm font-semibold tracking-tight text-ink sm:mt-1 sm:text-xl">
              {selectedEvent?.title ?? "All events"}
            </h2>
            <p className="mt-0.5 text-[11px] text-slate sm:text-xs">
              {new Intl.DateTimeFormat("en-US", {
                timeZone: SALES_TIME_ZONE,
                year: "numeric",
                month: "long",
                day: "numeric"
              }).format(new Date(`${report.date}T00:00:00.000Z`))}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 sm:gap-2 xl:min-w-[680px]">
            <div className="admin-card-muted flex items-center justify-between px-2 py-1.5 sm:px-3.5 sm:py-2.5">
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate sm:text-[10px] sm:tracking-[0.16em]">Sales</p>
              <p className="text-base font-semibold tracking-tight text-ink sm:text-xl">{report.rows.length}</p>
            </div>
            <div className="admin-card-muted flex items-center justify-between px-2 py-1.5 sm:px-3.5 sm:py-2.5">
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate sm:text-[10px] sm:tracking-[0.16em]">Total</p>
              <p className="text-sm font-semibold tracking-tight text-ink sm:text-base">
                {formatSalesMoneyMinor(report.totalAmountMinor, report.currencyCode)}
              </p>
            </div>
            <div className="admin-card-muted flex items-center justify-between px-2 py-1.5 sm:px-3.5 sm:py-2.5">
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate sm:text-[10px] sm:tracking-[0.16em]">Before VAT</p>
              <p className="text-sm font-semibold tracking-tight text-ink sm:text-base">
                {formatSalesMoneyMinor(report.amountBeforeVatMinor, report.currencyCode)}
              </p>
            </div>
            <div className="admin-card-muted flex items-center justify-between px-2 py-1.5 sm:px-3.5 sm:py-2.5">
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate sm:text-[10px] sm:tracking-[0.16em]">VAT 5%</p>
              <p className="text-sm font-semibold tracking-tight text-ink sm:text-base">
                {formatSalesMoneyMinor(report.vatMinor, report.currencyCode)}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border-2 border-ink/25 bg-ink/[0.03] p-2 sm:p-3.5">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <SalesReportFilters
            events={events.map((event) => ({ id: event.id, title: event.title }))}
            selectedDate={report.date}
            selectedEventId={filters.eventId}
          />
          <a href={buildDownloadHref(report.date, filters.eventId)} className="admin-action-primary self-start xl:self-auto">
            <Download className="h-4 w-4" />
            Download CSV
          </a>
        </div>
      </section>

      <section className="admin-card p-4 sm:p-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="admin-label">Sales</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-ink sm:text-2xl">Daily sales report</h2>
          </div>
          <p className="text-sm text-slate">
            {report.rows.length} paid transaction{report.rows.length === 1 ? "" : "s"}
          </p>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate/10 text-xs uppercase tracking-[0.16em] text-slate">
              <tr>
                <th className="px-3 py-3">Date</th>
                <th className="px-3 py-3">Transaction ref</th>
                <th className="px-3 py-3">Name</th>
                <th className="px-3 py-3">Total amount</th>
                <th className="px-3 py-3">Amount before VAT</th>
                <th className="px-3 py-3">VAT 5%</th>
                <th className="px-3 py-3">Activity description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate/10">
              {report.rows.map((row) => (
                <tr key={`${row.transactionRef}-${row.paidAt}`} className="align-top">
                  <td className="whitespace-nowrap px-3 py-3 text-slate">{formatSalesDateTime(row.paidAt)}</td>
                  <td className="px-3 py-3 font-mono text-xs text-slate">{row.transactionRef}</td>
                  <td className="px-3 py-3 font-medium text-ink">{row.name || "-"}</td>
                  <td className="whitespace-nowrap px-3 py-3 font-semibold text-ink">
                    {formatSalesMoneyMinor(row.totalAmountMinor, row.currencyCode)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate">
                    {formatSalesMoneyMinor(row.amountBeforeVatMinor, row.currencyCode)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate">
                    {formatSalesMoneyMinor(row.vatMinor, row.currencyCode)}
                  </td>
                  <td className="min-w-[320px] px-3 py-3 text-slate">{row.activityDescription}</td>
                </tr>
              ))}
              {report.rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-slate">
                    No paid transactions for this day.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
