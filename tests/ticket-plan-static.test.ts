import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function readProjectFile(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("ticket plan static safeguards", () => {
  it("keeps hosted ticket pages under the referrer-policy proxy", () => {
    const proxy = readProjectFile("proxy.ts");

    expect(proxy).toContain('"/tickets/:path*"');
    expect(proxy).toContain('response.headers.set("Referrer-Policy", "same-origin")');
  });

  it("prevents ticket-page image requests from leaking bearer URLs by referrer", () => {
    const ticketCard = readProjectFile("components/public/event-ticket-card.tsx");

    expect(ticketCard.match(/referrerPolicy="no-referrer"/g)).toHaveLength(3);
    expect(ticketCard).toContain('rel="noopener noreferrer"');
  });

  it("keeps the ticket QR panel above the event details", () => {
    const ticketCard = readProjectFile("components/public/event-ticket-card.tsx");

    expect(ticketCard.indexOf('aria-hidden="true"'))
      .toBeLessThan(ticketCard.indexOf(">Event</p>"));
    expect(ticketCard.indexOf("Scan this ticket"))
      .toBeLessThan(ticketCard.indexOf(">Event</p>"));
  });

  it("keeps automatic ticket delivery idempotent in the database migration", () => {
    const migration = readProjectFile("supabase/migrations/20260504120000_ticket_wallet_delivery_outbox.sql");

    expect(migration).toContain("ticket_access_nonce uuid");
    expect(migration).toContain("booking_attendee_id uuid references public.booking_attendees(id)");
    expect(migration).toContain("ticket_delivery_jobs_automatic_booking_unique");
    expect(migration).toContain("perform public.ensure_ticket_delivery_job(p_booking_intent_id);");
    expect(migration).toContain("grant execute on function public.claim_ticket_delivery_jobs(integer, integer) to service_role;");
    expect(migration).toContain("revoke execute on function public.claim_ticket_delivery_jobs(integer, integer) from public, anon, authenticated;");
  });

  it("checks grouped booking quantities before placing capacity holds", () => {
    const migration = readProjectFile("supabase/migrations/20260504143000_harden_capacity_group_counts.sql");

    expect(migration).toContain("sum(i.quantity)::integer as quantity");
    expect(migration).toContain("group by");
    expect(migration).toContain("if v_existing + item_row.quantity > v_capacity then");
    expect(migration).toContain("insert into public.booking_capacity_holds");
  });

  it("reserves checkout capacity before sending the OTP without skipping email verification", () => {
    const checkoutService = readProjectFile("services/checkout.ts");
    const migration = readProjectFile("supabase/migrations/20260505100000_reserve_capacity_at_checkout_start.sql");

    expect(checkoutService).toContain("const reservation = await reserveCapacity(supabase, booking.id, { advancePaymentPending: false });");
    expect(checkoutService.indexOf("const reservation = await reserveCapacity(supabase, booking.id, { advancePaymentPending: false });"))
      .toBeLessThan(checkoutService.indexOf("await sendCheckoutVerificationEmail({\n    booking,"));
    expect(migration).toContain("p_advance_payment_pending boolean default true");
    expect(migration).toContain("booking_row.status not in ('otp_sent', 'email_verified', 'payment_failed', 'payment_pending')");
    expect(migration).toContain("when p_advance_payment_pending and total_minor > 0 then 'payment_pending'::booking_intent_status");
  });

  it("keeps activity categories out of checkout pricing", () => {
    const checkoutService = readProjectFile("services/checkout.ts");
    const publicBookingFlow = readProjectFile("components/public/event-booking-flow.tsx");
    const activityCategoryEditor = readProjectFile("components/admin/ticket-options-editor.tsx");
    const adminService = readProjectFile("services/admin.ts");

    expect(checkoutService).not.toContain("attendee.addon?.priceMinor");
    expect(checkoutService).toContain("unit_price_minor: 0");
    expect(publicBookingFlow).toContain("Activity categories are assigned to each attendee on the next step and do not change the ticket total.");
    expect(activityCategoryEditor).not.toContain("Price (AED)");
    expect(activityCategoryEditor).not.toContain("Capacity");
    expect(adminService).toContain("capacity: null,\n        priceMinor: 0,\n        currencyCode: \"AED\",");
    expect(adminService).toContain("capacity: null,\n        sold_out: addon.soldOut,");
  });

  it("reserves checkout capacity by ticket type only", () => {
    const migration = readProjectFile("supabase/migrations/20260505113000_reserve_ticket_type_capacity_only.sql");
    const checkoutService = readProjectFile("services/checkout.ts");

    expect(migration).toContain("and i.item_type = 'category'");
    expect(migration).toContain("event_addon_id,\n    quantity");
    expect(migration).toContain("null,\n    i.quantity");
    expect(migration).not.toContain("ticket_option_id =");
    expect(checkoutService).toContain("const completed = await completeBookingAttendees(supabase, booking, catalog.categories, catalog.addons, attendees);");
  });

  it("does not require attendee ticket assignment before email verification", () => {
    const publicBookingFlow = readProjectFile("components/public/event-booking-flow.tsx");

    expect(publicBookingFlow).toContain("function validateReservationDrafts() {\n    return validateTicketQuantities();\n  }");
    expect(publicBookingFlow).toContain("const reservationAttendees = buildReservationAttendeeRows();");
    expect(publicBookingFlow).toContain("attendees: reservationAttendees");
    expect(publicBookingFlow).not.toContain('if ("categoryId" in patch) {\n      clearCheckoutSession();\n    }');
  });

  it("resends checkout OTP without creating another booking intent", () => {
    const publicBookingFlow = readProjectFile("components/public/event-booking-flow.tsx");
    const checkoutService = readProjectFile("services/checkout.ts");
    const resendRoute = readProjectFile("app/api/checkout/resend-otp/route.ts");

    expect(publicBookingFlow).toContain('await sendOtp("/api/checkout/resend-otp");');
    expect(publicBookingFlow).toContain("? { checkoutToken }");
    expect(checkoutService).toContain("export async function resendCheckoutOtp");
    expect(checkoutService).toContain("verification_token_hash: hashOpaqueToken(verificationCode)");
    expect(checkoutService).not.toContain("resendCheckoutOtp(input: CheckoutStartInput");
    expect(resendRoute).toContain("checkoutResendOtpSchema.safeParse");
    expect(resendRoute).toContain("resendCheckoutOtp({");
  });

  it("does not reset OTP verification when final contact fields change", () => {
    const publicBookingFlow = readProjectFile("components/public/event-booking-flow.tsx");
    const createPaymentRoute = readProjectFile("app/api/checkout/create-payment/route.ts");
    const checkoutService = readProjectFile("services/checkout.ts");

    expect(publicBookingFlow).toContain("const createPaymentPayload = useMemo");
    expect(publicBookingFlow).toContain("phone: form.phone,\n      uaeResident: form.uaeResident,");
    expect(createPaymentRoute).toContain("phone: parsed.data.phone,\n    uaeResident: parsed.data.uaeResident");
    expect(checkoutService).toContain("async function updateBookingContactDetails");
    expect(publicBookingFlow).not.toContain('setForm((current) => ({ ...current, phone: e.target.value }));\n                clearCheckoutSession();');
    expect(publicBookingFlow).not.toContain('setForm((current) => ({ ...current, uaeResident: e.target.value === "yes" }));\n                clearCheckoutSession();');
  });

  it("captures marketing opt-in from checkout through primary registration export data", () => {
    const publicBookingFlow = readProjectFile("components/public/event-booking-flow.tsx");
    const createPaymentRoute = readProjectFile("app/api/checkout/create-payment/route.ts");
    const checkoutValidation = readProjectFile("lib/validation/checkout.ts");
    const checkoutService = readProjectFile("services/checkout.ts");
    const adminService = readProjectFile("services/admin.ts");
    const migration = readProjectFile("supabase/migrations/20260508120000_capture_marketing_opt_in.sql");

    expect(publicBookingFlow).toContain("marketingOptIn: form.marketingOptIn");
    expect(checkoutValidation).toContain("marketingOptIn: z.boolean().optional().default(false)");
    expect(createPaymentRoute).toContain("marketingOptIn: parsed.data.marketingOptIn");
    expect(checkoutService).toContain("payer_marketing_opt_in: contact.marketingOptIn");
    expect(migration).toContain("add column if not exists payer_marketing_opt_in boolean not null default false");
    expect(migration).toContain("add column if not exists marketing_opt_in boolean not null default false");
    expect(migration).toContain("new.marketing_opt_in := coalesce(v_payer_marketing_opt_in, false);");
    expect(adminService).toContain('"Marketing Opt-In"');
  });

  it("does not prepare gateway payment before terms are accepted", () => {
    const publicBookingFlow = readProjectFile("components/public/event-booking-flow.tsx");
    const checkoutValidation = readProjectFile("lib/validation/checkout.ts");

    expect(publicBookingFlow).toContain("const termsComplete = form.declarationAccepted;");
    expect(publicBookingFlow).toContain("const readyForPayment = contactComplete && attendeesComplete && termsComplete && Boolean(checkoutToken);");
    expect(publicBookingFlow).toContain("if (!checkoutToken || !form.declarationAccepted) return null;");
    expect(publicBookingFlow).toContain('fetch("/api/checkout/create-payment"');
    expect(publicBookingFlow).toContain("const request = startPaymentPreparationRequest(createPaymentPayload, paymentPreparationKey);");
    expect(publicBookingFlow.indexOf("!readyForPayment ||"))
      .toBeLessThan(publicBookingFlow.indexOf("const request = startPaymentPreparationRequest(createPaymentPayload, paymentPreparationKey);"));
    expect(publicBookingFlow).toContain('submissionState === "submitting" || !readyForPayment');
    expect(publicBookingFlow).not.toContain("paymentActionPreparing");
    expect(checkoutValidation).toContain("declarationAccepted: z.literal(true)");
  });

  it("shows a full-screen payment handoff state after continuing to payment", () => {
    const publicBookingFlow = readProjectFile("components/public/event-booking-flow.tsx");

    expect(publicBookingFlow).toContain('const paymentRedirectInProgress = step === "details" && submissionState === "submitting" && selectedTicketSubtotalMinor > 0;');
    expect(publicBookingFlow).toContain("const paymentRedirectIsSlow = paymentRedirectElapsed >= 8;");
    expect(publicBookingFlow).toContain('role="status"');
    expect(publicBookingFlow).toContain("Opening secure payment");
    expect(publicBookingFlow).toContain("This is taking longer than usual.");
    expect(publicBookingFlow).toContain("If this fails, you can try again without re-entering your details.");
  });

  it("only auto-selects attendee ticket types when all selected tickets share one type", () => {
    const publicBookingFlow = readProjectFile("components/public/event-booking-flow.tsx");

    expect(publicBookingFlow).toContain("const uniqueCategoryIds = new Set(categorySlots);");
    expect(publicBookingFlow).toContain("const canAutoAssignTicketType = uniqueCategoryIds.size === 1;");
    expect(publicBookingFlow).toContain("let categoryId = current.ticketTypeManuallySelected || canAutoAssignTicketType ? current.categoryId : \"\";");
    expect(publicBookingFlow).toContain("ticketTypeManuallySelected: Boolean(patch.categoryId)");
    expect(publicBookingFlow).toContain("if (categoryId && availableForCurrentCategory > 0) {");
    expect(publicBookingFlow).toContain("if (!categoryId && canAutoAssignTicketType) {");
    expect(publicBookingFlow).not.toContain("if (!canAutoAssignTicketType) {\n        return {\n          ...current,\n          id: `attendee-${index + 1}`,\n          categoryId: \"\"\n        };\n      }");
  });

  it("persists the short-lived checkout token with the booking draft", () => {
    const publicBookingFlow = readProjectFile("components/public/event-booking-flow.tsx");

    expect(publicBookingFlow).toContain("checkoutToken,\n        otpState,");
    expect(publicBookingFlow).toContain("setCheckoutToken(savedCheckoutToken);");
    expect(publicBookingFlow).toContain("if (draft.emailVerified && savedCheckoutToken) {");
    expect(publicBookingFlow).toContain("if (draft.otpState === \"sent\" && savedCheckoutToken && !draft.emailVerified) {");
  });

  it("keeps ticket quantity controls from shrinking and clipping the plus button", () => {
    const publicBookingFlow = readProjectFile("components/public/event-booking-flow.tsx");

    expect(publicBookingFlow).toContain("sm:w-36 sm:shrink-0");
  });

  it("expires abandoned prepared payment links through maintenance after gateway reconciliation", () => {
    const paymentWorker = readProjectFile("services/payment-worker.ts");

    expect(paymentWorker).toContain('const ABANDONED_PAYMENT_LINK_REASON = "Payment link prepared but abandoned before payment.";');
    expect(paymentWorker).toContain("async function expireStalePreparedPaymentLinks");
    expect(paymentWorker.indexOf("await processAttempt(supabase, attempt);"))
      .toBeLessThan(paymentWorker.indexOf("status: \"expired\",\n        last_error: ABANDONED_PAYMENT_LINK_REASON"));
    expect(paymentWorker).toContain(".eq(\"status\", \"payment_pending\")");
    expect(paymentWorker).toContain(".lte(\"held_until\", nowIso)");
    expect(paymentWorker).toContain(".eq(\"status\", \"payment_pending\");");
    expect(paymentWorker).toContain('attempt.status === "expired" && (state.kind === "pending" || state.kind === "failed" || state.kind === "cancelled")');
    expect(paymentWorker).toContain("expiredPreparedBookings: stalePreparedPayments.expiredBookings");
    expect(paymentWorker).toContain("stalePreparedPaymentReconcileFailures: stalePreparedPayments.failedReconciliations");
  });

  it("does not let payment reconciliation regress fulfilled bookings", () => {
    const adminSupabase = readProjectFile("lib/supabase/admin.ts");
    const checkoutService = readProjectFile("services/checkout.ts");
    const paymentWorker = readProjectFile("services/payment-worker.ts");
    const statusRoute = readProjectFile("app/api/checkout/status/route.ts");

    expect(adminSupabase).toContain('cache: "no-store"');
    expect(checkoutService).toContain("async function updateBookingUnlessFulfilled");
    expect(checkoutService).toContain('.neq("status", "fulfilled")');
    expect(checkoutService).toContain("async function updatePendingBookingForManualAction");
    expect(checkoutService).toContain('.in("status", ["otp_sent", "email_verified", "payment_pending", "manual_action_required"])');
    expect(checkoutService).toContain("const effectiveStatus = getEffectiveCheckoutStatus");
    expect(checkoutService).toContain("attemptStatus === \"manual_action_required\"");
    expect(checkoutService).toContain("const recoveredIssuedTickets = await recoverIssuedTicketsForStatus");
    expect(checkoutService).toContain("async function recoverIssuedTicketsForStatus");
    expect(checkoutService.indexOf('if (booking.status === "fulfilled")'))
      .toBeLessThan(checkoutService.indexOf('.from("payment_attempts")'));
    expect(checkoutService).toContain("const { count: bookingIssuedCount");
    expect(checkoutService).toContain('["payment_pending", "expired"].includes(bookingStatus)');
    expect(checkoutService).toContain('status: "payment_failed",\n        manual_action_reason: null');
    expect(paymentWorker).toContain("async function updateBookingUnlessFulfilled");
    expect(paymentWorker).toContain('.neq("status", "fulfilled")');
    expect(paymentWorker).toContain("async function updatePendingBookingForManualAction");
    expect(paymentWorker).toContain('.in("status", ["otp_sent", "email_verified", "payment_pending", "manual_action_required"])');
    expect(paymentWorker).toContain("const { count: bookingIssuedCount");
    expect(paymentWorker).toContain('status: "payment_failed",\n      manual_action_reason: null');
    expect(statusRoute).toContain("maxRequests: 1");
    expect(statusRoute).toContain("windowSeconds: 20");
    expect(statusRoute).toContain("background ticket email failed");
    expect(statusRoute).not.toContain("await runEmailWorker();");
  });

  it("recovers provider auth failures and delayed ticket wallet hydration", () => {
    const checkoutService = readProjectFile("services/checkout.ts");
    const paymentWorker = readProjectFile("services/payment-worker.ts");
    const emailWorker = readProjectFile("services/email-worker.ts");
    const ngeniusService = readProjectFile("services/ngenius.ts");

    expect(ngeniusService).toContain("export class NgeniusApiError extends Error");
    expect(ngeniusService).toContain("if (response.status === 401)");
    expect(checkoutService).toContain("NGENIUS_RECONCILE_AUTH_REASON");
    expect(checkoutService).toContain("markNgeniusReconcileAuthFailure");
    expect(paymentWorker).toContain("markNgeniusReconcileAuthFailure");
    expect(emailWorker).toContain("class TicketWalletPendingError extends Error");
    expect(emailWorker).toContain("TICKET_WALLET_PENDING_RETRY_SECONDS");
    expect(emailWorker).toContain("[ticket-delivery] wallet pending; retry scheduled");
  });
});
