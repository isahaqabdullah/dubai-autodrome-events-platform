import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}

export function Button({
  className,
  variant = "primary",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center rounded-2xl border px-4 py-2.5 text-sm font-semibold transition duration-200 disabled:cursor-not-allowed disabled:opacity-60",
        variant === "primary" && "border-ink bg-ink text-white shadow-soft hover:bg-ink/92",
        variant === "secondary" && "border-slate/15 bg-white/80 text-ink hover:border-slate/30 hover:bg-mist/70",
        variant === "ghost" && "border-transparent bg-transparent text-slate hover:border-slate/15 hover:bg-white/75 hover:text-ink",
        variant === "danger" && "border-rose-600 bg-rose-600 text-white shadow-soft hover:bg-rose-700",
        className
      )}
      {...props}
    />
  );
}
