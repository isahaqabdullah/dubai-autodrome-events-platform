import Link from "next/link";
import { SiteHeader } from "@/components/public/site-header";
import { confirmRegistrationFromToken } from "@/services/registration";

export const dynamic = "force-dynamic";

export default async function VerifyPage({
  searchParams
}: {
  searchParams: { token?: string };
}) {
  const token = searchParams.token;
  const result = token
    ? await confirmRegistrationFromToken({ token })
    : {
        outcome: "invalid" as const,
        message: "The verification link is missing a token."
      };

  return (
    <>
      <SiteHeader />
      <main className="page-shell page-stack-compact">
        <div className="card-panel mx-auto max-w-2xl px-4 py-6 text-center sm:px-6 sm:py-12">
          <p className="section-title">Verification result</p>
          <h1 className="heading-xl mt-2 sm:mt-3">{result.outcome.replaceAll("_", " ")}</h1>
          <p className="mt-2 text-[13px] text-slate sm:mt-4 sm:text-base">{result.message}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2 sm:mt-8 sm:gap-3">
            <Link
              href="/events"
              className="inline-flex rounded-xl bg-ink px-3.5 py-2 text-[13px] font-semibold text-white sm:rounded-2xl sm:px-4 sm:py-2.5 sm:text-sm"
            >
              Browse events
            </Link>
            {result.eventId ? (
              <Link
                href="/events"
                className="inline-flex rounded-xl border border-slate/20 bg-white px-3.5 py-2 text-[13px] font-semibold text-ink sm:rounded-2xl sm:px-4 sm:py-2.5 sm:text-sm"
              >
                Back to public site
              </Link>
            ) : null}
          </div>
        </div>
      </main>
    </>
  );
}
