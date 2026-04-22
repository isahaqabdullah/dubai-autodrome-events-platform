"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface RegistrationActionsProps {
  registrationId: string;
  eventId: string;
  status: string;
}

export function RegistrationActions({ registrationId, eventId, status }: RegistrationActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<"checkin" | "resend" | "revoke" | null>(null);

  async function post(action: "checkin" | "resend" | "revoke", endpoint: string, body: Record<string, unknown>) {
    setBusy(action);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const data = await response.json().catch(() => null);
    setBusy(null);

    return {
      ok: response.ok,
      data
    };
  }

  return (
    <div className="flex flex-wrap gap-1">
      {status === "registered" ? (
        <Button
          type="button"
          variant="primary"
          className="!rounded-lg !px-2 !py-1 !text-xs"
          disabled={busy !== null}
          onClick={async () => {
            const result = await post("checkin", "/api/admin/manual-checkin", {
              eventId,
              registrationId
            });

            if (!result.ok) {
              window.alert(result.data?.message ?? "Check-in failed.");
              return;
            }

            if (result.data?.result && result.data.result !== "success") {
              window.alert(result.data?.message ?? "Unable to complete check-in.");
            }

            router.refresh();
          }}
        >
          {busy === "checkin" ? "Checking in..." : "Check in"}
        </Button>
      ) : null}
      <Button
        type="button"
        variant="secondary"
        className="!rounded-lg !px-2 !py-1 !text-xs"
        disabled={busy !== null || status === "revoked" || status === "cancelled"}
        onClick={async () => {
          const result = await post("resend", "/api/admin/resend-qr", {
            registrationId
          });

          if (!result.ok) {
            window.alert(result.data?.message ?? "Request failed.");
            return;
          }

          router.refresh();
        }}
      >
        {busy === "resend" ? "Sending..." : "Resend QR"}
      </Button>
      <Button
        type="button"
        variant="danger"
        className="!rounded-lg !px-2 !py-1 !text-xs"
        disabled={busy !== null}
        onClick={async () => {
          const confirmed = window.confirm(
            "Delete this registration permanently? This will remove it from registrations, exports, and check-in activity."
          );

          if (!confirmed) {
            return;
          }

          const result = await post("revoke", "/api/admin/revoke-registration", {
            registrationId
          });

          if (!result.ok) {
            window.alert(result.data?.message ?? "Request failed.");
            return;
          }

          router.refresh();
        }}
      >
        {busy === "revoke" ? "Deleting..." : status === "revoked" ? "Delete" : "Revoke"}
      </Button>
    </div>
  );
}
