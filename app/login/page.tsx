import { LoginForm } from "@/components/public/login-form";
import { SiteHeader } from "@/components/public/site-header";

export default function LoginPage({
  searchParams
}: {
  searchParams: { error?: string };
}) {
  return (
    <>
      <SiteHeader />
      <main className="page-shell">
        <div className="mx-auto grid max-w-5xl gap-5 sm:gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
          <section className="card-panel px-4 py-8 sm:px-6 sm:py-10">
            <p className="section-title">Staff access</p>
            <h1 className="heading-xl mt-2 sm:mt-3">Supabase Auth is reserved for staff and admins.</h1>
            <p className="mt-3 text-sm text-slate sm:mt-4 sm:text-base">
              Attendees never create accounts. They verify a per-registration email token, while operational users sign
              in here to access the admin and check-in tools.
            </p>
            {searchParams.error === "insufficient_role" ? (
              <div className="mt-4 rounded-2xl bg-amber-100 px-4 py-3 text-sm text-amber-900 sm:mt-6">
                Your account is signed in, but it does not have the required staff or admin role.
              </div>
            ) : null}
          </section>

          <section className="card-panel px-4 py-8 sm:px-6 sm:py-10">
            <p className="section-title">Login</p>
            <h2 className="heading-lg mt-2 sm:mt-3">Sign in with your staff account</h2>
            <div className="mt-5 sm:mt-6">
              <LoginForm />
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
