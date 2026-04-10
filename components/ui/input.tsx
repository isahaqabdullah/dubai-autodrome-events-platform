import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      className={cn(
        "w-full rounded-2xl border border-slate/15 bg-white/90 px-4 py-3 text-sm text-ink outline-none ring-0 transition placeholder:text-slate/70 focus:border-ink/30 focus:bg-white focus:shadow-[0_0_0_4px_rgba(19,32,42,0.06)]",
        className
      )}
      {...props}
    />
  );
});
