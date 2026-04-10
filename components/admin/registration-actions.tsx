"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface RegistrationActionsProps {
  registrationId: string;
  status: string;
}

export function RegistrationActions({ registrationId, status }: RegistrationActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<"resend" | "revoke" | null>(null);

  async function post(endpoint: string, body: Record<string, unknown>) {
    setBusy(endpoint.includes("resend") ? "resend" : "revoke");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    setBusy(null);

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      window.alert(data?.message ?? "Request failed.");
      return;
    }

    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="secondary"
        disabled={busy !== null || status === "revoked" || status === "cancelled"}
        onClick={async () => {
          await post("/api/admin/resend-qr", {
            registrationId
          });
        }}
      >
        {busy === "resend" ? "Sending..." : "Resend QR"}
      </Button>
      <Button
        type="button"
        variant="danger"
        disabled={busy !== null || status === "revoked"}
        onClick={async () => {
          const confirmed = window.confirm("Revoke this registration?");

          if (!confirmed) {
            return;
          }

          await post("/api/admin/revoke-registration", {
            registrationId
          });
        }}
      >
        {busy === "revoke" ? "Revoking..." : "Revoke"}
      </Button>
    </div>
  );
}
