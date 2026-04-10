import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "w-full rounded-2xl border border-slate/15 bg-white/90 px-4 py-3 text-sm text-ink outline-none transition focus:border-ink/30 focus:bg-white focus:shadow-[0_0_0_4px_rgba(19,32,42,0.06)]",
        className
      )}
      {...props}
    />
  );
}
