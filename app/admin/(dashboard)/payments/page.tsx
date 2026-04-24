import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { PaymentActions } from "@/components/admin/payment-actions";

export const dynamic = "force-dynamic";

function formatAmount(amountMinor: number | null, currencyCode: string | null) {
  if (amountMinor === null || amountMinor === undefined) {
    return "-";
  }
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: currencyCode ?? "AED",
    maximumFractionDigits: 2
  }).format(amountMinor / 100);
}

function formatAge(value: string | null) {
  if (!value) return "-";
  const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export default async function AdminPaymentsPage() {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("payment_attempts")
    .select(`
      id,
      status,
      attempt_number,
      ni_order_reference,
      merchant_order_reference,
      amount_minor,
      currency_code,
      last_error,
      created_at,
      booking_intents(
        id,
        public_reference,
        payer_email_raw,
        status,
        manual_action_reason,
        events(title, slug)
      )
    `)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    throw error;
  }

  const rows = data ?? [];

  return (
    <main className="admin-card p-4 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="admin-label">Operations</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Payments</h2>
        </div>
        <p className="text-sm text-slate">{rows.length} recent attempts</p>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate/10 text-xs uppercase tracking-[0.16em] text-slate">
            <tr>
              <th className="px-3 py-3">Booking</th>
              <th className="px-3 py-3">Event</th>
              <th className="px-3 py-3">Payer</th>
              <th className="px-3 py-3">Amount</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">NI order</th>
              <th className="px-3 py-3">Age</th>
              <th className="px-3 py-3">Reason</th>
              <th className="px-3 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate/10">
            {rows.map((row: Record<string, any>) => {
              const booking = Array.isArray(row.booking_intents) ? row.booking_intents[0] : row.booking_intents;
              const event = Array.isArray(booking?.events) ? booking.events[0] : booking?.events;
              return (
                <tr key={row.id} className="align-top">
                  <td className="px-3 py-3 font-medium text-ink">
                    {booking?.public_reference ?? row.merchant_order_reference}
                    <span className="mt-1 block text-xs font-normal text-slate">Attempt {row.attempt_number}</span>
                  </td>
                  <td className="px-3 py-3 text-slate">{event?.title ?? "-"}</td>
                  <td className="px-3 py-3 text-slate">{booking?.payer_email_raw ?? "-"}</td>
                  <td className="px-3 py-3 font-medium text-ink">{formatAmount(row.amount_minor, row.currency_code)}</td>
                  <td className="px-3 py-3">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-ink">
                      {row.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-slate">{row.ni_order_reference ?? "-"}</td>
                  <td className="px-3 py-3 text-slate">{formatAge(row.created_at)}</td>
                  <td className="max-w-xs px-3 py-3 text-slate">
                    {booking?.manual_action_reason ?? row.last_error ?? "-"}
                  </td>
                  <td className="px-3 py-3">
                    <PaymentActions
                      paymentAttemptId={row.id}
                      bookingIntentId={booking?.id ?? null}
                      paymentStatus={row.status}
                      bookingStatus={booking?.status ?? null}
                    />
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-slate">No payment attempts yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}
