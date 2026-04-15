export function Field({
  label,
  hint,
  children
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1.5 sm:space-y-2.5">
      <div className="flex items-center justify-between gap-3 sm:gap-4">
        <span className="text-[13px] font-semibold text-ink sm:text-sm">{label}</span>
        {hint ? <span className="text-[11px] font-medium text-slate sm:text-xs">{hint}</span> : null}
      </div>
      {children}
    </label>
  );
}
