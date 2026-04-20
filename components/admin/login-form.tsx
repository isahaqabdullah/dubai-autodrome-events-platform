"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { AppUserRole } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

function getRoleFromUser(user: { app_metadata?: Record<string, unknown> } | null | undefined): AppUserRole | null {
  const role = user?.app_metadata?.role;

  if (role === "admin" || role === "staff") {
    return role;
  }

  return null;
}

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  return (
    <form
      className="grid gap-4"
      onSubmit={async (eventObject) => {
        eventObject.preventDefault();
        setSubmitting(true);
        setError(null);

        const supabase = createBrowserSupabaseClient();
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (signInError) {
          setError(signInError.message);
          setSubmitting(false);
          return;
        }

        const role = getRoleFromUser(data.user);

        if (!role) {
          await supabase.auth.signOut();
          setError("Your account does not have staff access.");
          setSubmitting(false);
          return;
        }

        router.replace(role === "admin" ? "/admin" : "/check-in");
        router.refresh();
      }}
    >
      <Field label="Staff email">
        <Input type="email" required value={email} onChange={(eventObject) => setEmail(eventObject.target.value)} />
      </Field>
      <Field label="Password">
        <Input
          type="password"
          required
          value={password}
          onChange={(eventObject) => setPassword(eventObject.target.value)}
        />
      </Field>
      {error ? <div className="rounded-2xl bg-rose-100 px-4 py-3 text-sm text-rose-900">{error}</div> : null}
      <Button type="submit" disabled={submitting}>
        {submitting ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  );
}
