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
    <label className="space-y-2.5">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm font-semibold text-ink">{label}</span>
        {hint ? <span className="text-xs font-medium text-slate">{hint}</span> : null}
      </div>
      {children}
    </label>
  );
}
