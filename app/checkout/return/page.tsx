import { CheckoutReturnClient } from "@/components/public/checkout-return-client";
import { SiteHeader } from "@/components/public/site-header";

export const dynamic = "force-dynamic";

export default function CheckoutReturnPage({
  searchParams
}: {
  searchParams: { token?: string; cancelled?: string; ref?: string };
}) {
  const token = searchParams.token ?? "";

  return (
    <>
      <SiteHeader />
      {token ? (
        <CheckoutReturnClient checkoutToken={token} cancelled={searchParams.cancelled === "1"} />
      ) : (
        <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-4 py-12 text-center">
          <h1 className="font-title text-3xl font-black italic text-ink">Missing checkout token</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate">Return to the event page and check your registration status from there.</p>
        </main>
      )}
    </>
  );
}
