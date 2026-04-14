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
      <header className="admin-card px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <Link href="/admin" className="block">
              <p className="admin-label">Dubai Autodrome</p>
              <h1 className="mt-1 text-lg font-semibold tracking-tight text-ink sm:text-xl">Event Admin</h1>
            </Link>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
            <p className="truncate text-sm text-slate">{user.email ?? "Signed-in staff user"}</p>
            <SignOutButton className="rounded-2xl px-4 py-2.5" />
          </div>
        </div>

        <div className="mt-4 border-t border-slate/10 pt-4">
          <AdminNav hideOnDashboard activeStyle="line" />
        </div>
      </header>

      {children}
    </div>
  );
}
