import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-[120px] w-full rounded-2xl border border-slate/15 bg-white/90 px-4 py-3 text-sm text-ink outline-none transition placeholder:text-slate/70 focus:border-ink/30 focus:bg-white focus:shadow-[0_0_0_4px_rgba(19,32,42,0.06)]",
        className
      )}
      {...props}
    />
  );
}
