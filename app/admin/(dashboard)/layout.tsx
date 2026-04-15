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
    <div className="page-shell page-stack-compact">
      <header className="admin-card px-3 py-2.5 sm:px-6 sm:py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Link href="/admin" className="block">
              <p className="admin-label">Dubai Autodrome</p>
              <h1 className="mt-0.5 text-[15px] font-semibold tracking-tight text-ink sm:mt-1 sm:text-xl">Event Admin</h1>
            </Link>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <p className="hidden truncate text-sm text-slate sm:block">{user.email ?? "Signed-in staff user"}</p>
            <SignOutButton className="rounded-xl px-3 py-1.5 text-xs sm:rounded-2xl sm:px-4 sm:py-2.5 sm:text-sm" />
          </div>
        </div>

        <div className="mt-2.5 border-t border-slate/10 pt-2.5 sm:mt-4 sm:pt-4">
          <AdminNav hideOnDashboard activeStyle="line" />
        </div>
      </header>

      {children}
    </div>
  );
}
