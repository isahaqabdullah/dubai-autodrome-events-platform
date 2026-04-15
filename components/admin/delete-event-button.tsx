"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteEventButton({ eventId, eventTitle }: { eventId: string; eventTitle: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    const confirmed = window.confirm(
      `Delete "${eventTitle}"? This cannot be undone. Events with registrations cannot be deleted.`
    );

    if (!confirmed) {
      return;
    }

    setBusy(true);

    const response = await fetch("/api/admin/delete-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId })
    });

    setBusy(false);

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      window.alert(data?.message ?? "Failed to delete event.");
      return;
    }

    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={busy}
      className="inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-rose-600 transition hover:border-rose-300 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60 sm:rounded-2xl sm:px-3 sm:py-2 sm:text-xs"
    >
      {busy ? "Deleting..." : "Delete"}
    </button>
  );
}
