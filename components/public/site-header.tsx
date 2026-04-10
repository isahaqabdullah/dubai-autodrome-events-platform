import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="page-shell pb-0">
      <div className="card-panel flex items-center justify-between gap-3 px-4 py-3 sm:px-5 sm:py-4">
        <div className="min-w-0">
          <p className="section-title truncate">Dubai Autodrome</p>
          <Link href="/events" className="mt-0.5 inline-block text-base font-semibold tracking-tight text-ink sm:mt-1 sm:text-xl">
            Recurring Event System
          </Link>
        </div>
        <nav className="flex items-center gap-1 text-sm text-slate sm:gap-3">
          <Link href="/events" className="rounded-full px-2.5 py-2 transition hover:bg-mist sm:px-3">
            Events
          </Link>
          <Link href="/login" className="hidden rounded-full px-3 py-2 transition hover:bg-mist sm:inline-flex">
            Staff login
          </Link>
          <Link href="/admin" className="rounded-full px-2.5 py-2 transition hover:bg-mist sm:px-3">
            Admin
          </Link>
        </nav>
      </div>
    </header>
  );
}
