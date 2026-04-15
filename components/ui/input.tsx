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
        "w-full rounded-xl border border-slate/15 bg-white/90 px-3 py-2.5 text-[13px] text-ink outline-none ring-0 transition placeholder:text-slate/70 focus:border-ink/30 focus:bg-white focus:shadow-[0_0_0_4px_rgba(19,32,42,0.06)] sm:rounded-2xl sm:px-4 sm:py-3 sm:text-sm",
        className
      )}
      {...props}
    />
  );
});
