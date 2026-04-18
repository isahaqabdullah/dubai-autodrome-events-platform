export function Pagination({
  currentPage,
  totalItems,
  pageSize,
  paramKey,
  searchParams
}: {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  paramKey: string;
  searchParams: Record<string, string | undefined>;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  if (totalPages <= 1) {
    return null;
  }

  const clamped = Math.min(Math.max(1, currentPage), totalPages);

  function hrefFor(page: number) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (!value) continue;
      if (key === paramKey) continue;
      params.set(key, value);
    }
    if (page > 1) {
      params.set(paramKey, String(page));
    }
    const query = params.toString();
    return query ? `?${query}` : "?";
  }

  const rangeStart = (clamped - 1) * pageSize + 1;
  const rangeEnd = Math.min(clamped * pageSize, totalItems);

  const prevDisabled = clamped <= 1;
  const nextDisabled = clamped >= totalPages;

  const baseBtn =
    "inline-flex items-center justify-center rounded-lg border border-ink/15 bg-white px-2.5 py-1 text-xs font-medium text-ink shadow-sm transition hover:bg-ink/5";
  const disabledBtn =
    "pointer-events-none cursor-not-allowed opacity-40";

  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate">
      <span>
        Showing <span className="font-semibold text-ink">{rangeStart}</span>–
        <span className="font-semibold text-ink">{rangeEnd}</span> of{" "}
        <span className="font-semibold text-ink">{totalItems}</span>
      </span>
      <div className="flex items-center gap-1.5">
        {prevDisabled ? (
          <span aria-disabled="true" className={`${baseBtn} ${disabledBtn}`}>
            Prev
          </span>
        ) : (
          // Use document navigation here so paginated admin data is always fetched fresh.
          <a href={hrefFor(clamped - 1)} className={baseBtn}>
            Prev
          </a>
        )}
        <span className="px-1">
          Page <span className="font-semibold text-ink">{clamped}</span> of{" "}
          <span className="font-semibold text-ink">{totalPages}</span>
        </span>
        {nextDisabled ? (
          <span aria-disabled="true" className={`${baseBtn} ${disabledBtn}`}>
            Next
          </span>
        ) : (
          <a href={hrefFor(clamped + 1)} className={baseBtn}>
            Next
          </a>
        )}
      </div>
    </div>
  );
}
