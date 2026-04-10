import Link from "next/link";
import { SiteHeader } from "@/components/public/site-header";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="page-shell">
        <div className="card-panel px-4 py-10 text-center sm:px-6 sm:py-16">
          <p className="section-title">Not found</p>
          <h1 className="heading-xl mt-2 sm:mt-3">The requested page does not exist.</h1>
          <p className="mt-2 text-sm text-slate sm:mt-3 sm:text-base">Use the events index to find the current registration edition.</p>
          <Link
            href="/events"
            className="mt-5 inline-flex rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white sm:mt-6 sm:rounded-2xl"
          >
            View events
          </Link>
        </div>
      </main>
    </>
  );
}
