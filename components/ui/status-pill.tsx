import { cn } from "@/lib/utils";

export function StatusPill({
  children,
  tone = "neutral"
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  return (
    <span
      className={cn(
        "status-pill",
        tone === "neutral" && "border-slate/15 bg-ink/5 text-slate",
        tone === "success" && "border-emerald-200 bg-emerald-100 text-emerald-800",
        tone === "warning" && "border-amber-200 bg-amber-100 text-amber-800",
        tone === "danger" && "border-rose-200 bg-rose-100 text-rose-800"
      )}
    >
      {children}
    </span>
  );
}
