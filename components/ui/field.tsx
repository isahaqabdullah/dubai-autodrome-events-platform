export function Field({
  label,
  hint,
  htmlFor,
  children
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  const isRequired = hint?.toLowerCase() === "required";
  const labelContent = (
    <>
      {label}
      {isRequired ? <span className="ml-0.5 text-slate" aria-hidden="true">*</span> : null}
    </>
  );

  return (
    <div className="space-y-1.5 sm:space-y-2.5">
      <div className="flex items-center justify-between gap-3 sm:gap-4">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-[13px] font-semibold text-ink sm:text-sm">
            {labelContent}
          </label>
        ) : (
          <span className="text-[13px] font-semibold text-ink sm:text-sm">{labelContent}</span>
        )}
        {hint && !isRequired ? <span className="text-[11px] font-medium text-slate sm:text-xs">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}
