import Link from "next/link";
import { SignOutButton } from "@/components/admin/sign-out-button";
import { requireAuthenticatedUser } from "@/lib/auth";

export default async function CheckinLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const user = await requireAuthenticatedUser("staff");

  return (
    <div className="page-shell page-stack-compact">
      <header className="admin-card px-3 py-2.5 sm:px-6 sm:py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Link href="/check-in" className="block">
              <p className="admin-label">Dubai Autodrome</p>
              <h1 className="mt-0.5 text-[15px] font-semibold tracking-tight text-ink sm:mt-1 sm:text-xl">
                Check-in Desk
              </h1>
            </Link>
            <p className="mt-1 hidden text-sm text-slate sm:block">
              Staff access for event scanning and manual check-in. Assigned gate: {user.gateName}.
            </p>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <p className="hidden truncate text-sm text-slate sm:block">{user.email ?? "Signed-in staff user"}</p>
            <SignOutButton className="rounded-xl px-3 py-1.5 text-xs sm:rounded-2xl sm:px-4 sm:py-2.5 sm:text-sm" />
          </div>
        </div>
      </header>

      {children}
    </div>
  );
}
