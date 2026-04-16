import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  const chevron = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24"><path stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="m6 9 6 6 6-6"/></svg>`
  );

  return (
    <select
      className={cn(
        "w-full appearance-none rounded-2xl border border-slate/15 bg-white/90 px-4 py-3 pr-10 text-sm text-ink outline-none transition focus:border-ink/30 focus:bg-white focus:shadow-[0_0_0_4px_rgba(19,32,42,0.06)]",
        className
      )}
      style={{
        backgroundImage: `url("data:image/svg+xml,${chevron}")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 0.9rem center",
        backgroundSize: "1rem 1rem",
        WebkitAppearance: "none",
        MozAppearance: "none",
        appearance: "none",
        ...(props.style ?? {})
      }}
      {...props}
    />
  );
}
