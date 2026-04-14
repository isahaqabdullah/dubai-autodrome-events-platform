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
      className="inline-flex items-center justify-center rounded-2xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-600 transition hover:border-rose-300 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
    >
      {busy ? "Deleting..." : "Delete"}
    </button>
  );
}
