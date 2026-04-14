"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ManualCheckinButton({
  eventId,
  registrationId,
  className
}: {
  eventId: string;
  registrationId: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <Button
      type="button"
      variant="secondary"
      disabled={pending}
      className={cn(className)}
      onClick={async () => {
        setPending(true);
        const response = await fetch("/api/admin/manual-checkin", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            eventId,
            registrationId
          })
        });

        setPending(false);

        if (!response.ok) {
          const data = await response.json().catch(() => null);
          window.alert(data?.message ?? "Manual check-in failed.");
          return;
        }

        router.refresh();
      }}
    >
      {pending ? "Checking in..." : "Manual check-in"}
    </Button>
  );
}
