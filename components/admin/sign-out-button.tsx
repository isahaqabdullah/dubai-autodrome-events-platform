"use client";

import type { ComponentProps } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";

export function SignOutButton({ className }: { className?: ComponentProps<typeof Button>["className"] }) {
  const router = useRouter();

  return (
    <Button
      type="button"
      variant="secondary"
      className={className ?? "w-full rounded-2xl"}
      onClick={async () => {
        const supabase = createBrowserSupabaseClient();
        await supabase.auth.signOut();
        router.replace("/admin/login" as Route);
        router.refresh();
      }}
    >
      Sign out
    </Button>
  );
}
