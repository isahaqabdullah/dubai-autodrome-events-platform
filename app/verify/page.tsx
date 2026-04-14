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
        <div className="card-panel mx-auto max-w-2xl px-4 py-8 text-center sm:px-6 sm:py-12">
          <p className="section-title">Verification result</p>
          <h1 className="heading-xl mt-2 sm:mt-3">{result.outcome.replaceAll("_", " ")}</h1>
          <p className="mt-3 text-sm text-slate sm:mt-4 sm:text-base">{result.message}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2 sm:mt-8 sm:gap-3">
            <Link
              href="/events"
              className="inline-flex rounded-2xl bg-ink px-4 py-2.5 text-sm font-semibold text-white sm:rounded-2xl"
            >
              Browse events
            </Link>
            {result.eventId ? (
              <Link
                href="/events"
                className="inline-flex rounded-2xl border border-slate/20 bg-white px-4 py-2.5 text-sm font-semibold text-ink sm:rounded-2xl"
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
