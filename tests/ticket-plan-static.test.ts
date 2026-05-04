import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function readProjectFile(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("ticket plan static safeguards", () => {
  it("keeps hosted ticket pages under the referrer-policy middleware", () => {
    const middleware = readProjectFile("middleware.ts");

    expect(middleware).toContain('"/tickets/:path*"');
    expect(middleware).toContain('response.headers.set("Referrer-Policy", "same-origin")');
  });

  it("prevents ticket-page image requests from leaking bearer URLs by referrer", () => {
    const ticketCard = readProjectFile("components/public/event-ticket-card.tsx");

    expect(ticketCard.match(/referrerPolicy="no-referrer"/g)).toHaveLength(3);
    expect(ticketCard).toContain('rel="noopener noreferrer"');
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
});
