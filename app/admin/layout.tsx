import Link from "next/link";
import { AdminNav } from "@/components/admin/admin-nav";
import { SignOutButton } from "@/components/admin/sign-out-button";
import { requireAuthenticatedUser } from "@/lib/auth";

export default async function AdminLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const user = await requireAuthenticatedUser("admin");

  return (
    <div className="page-shell space-y-4 sm:space-y-6">
      <header className="card-panel overflow-hidden px-4 py-4 sm:px-6 sm:py-6">
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-r from-gold/15 via-white/0 to-aurora/30" />
        <div className="relative flex flex-col gap-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="section-title">Admin workspace</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                  Event operations in three clicks
                </h1>
                <span className="rounded-full border border-slate/15 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate">
                  Dubai Autodrome
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="min-w-0 rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-right">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate">Signed in</p>
                <p className="mt-1 truncate text-sm font-medium text-ink">{user.email ?? "Signed-in staff user"}</p>
              </div>
              <div className="shrink-0">
                <SignOutButton />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-3 border-t border-slate/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <AdminNav />
            <Link
              href="/admin/events/new"
              className="inline-flex items-center rounded-full border border-ink bg-ink px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink/90"
            >
              Create a new event
            </Link>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
