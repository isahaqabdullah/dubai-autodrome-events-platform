"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { cn } from "@/lib/utils";

export function ManualCheckinByEmail({
  eventId,
  className
}: {
  eventId: string;
  className?: string;
}) {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();

    if (!trimmed) return;

    setPending(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/admin/manual-checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, email: trimmed })
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setFeedback({ ok: false, message: data?.message ?? "Check-in failed." });
        return;
      }

      setFeedback({ ok: true, message: data?.message ?? "Checked in." });
      setEmail("");
    } catch {
      setFeedback({ ok: false, message: "Unable to reach the check-in service." });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={cn("w-full", className)}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-ink">Attendee email</span>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate" />
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setFeedback(null);
              }}
              placeholder="attendee@example.com"
              className="w-full rounded-2xl border border-slate/15 bg-white py-3.5 pl-11 pr-4 text-sm text-ink outline-none transition placeholder:text-slate/70 focus:border-[#2f7b76]/30 focus:bg-white focus:shadow-[0_0_0_4px_rgba(47,123,118,0.08)]"
              required
            />
          </div>
        </label>

        <button
          type="submit"
          disabled={pending || !email.trim()}
          className="admin-action-primary w-full rounded-2xl py-3.5 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Checking in..." : "Check in by email"}
        </button>
      </form>

      {feedback && (
        <div
          className={cn(
            "mt-3 rounded-2xl border px-4 py-3 text-sm font-medium",
            feedback.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          )}
        >
          {feedback.message}
        </div>
      )}
    </div>
  );
}
