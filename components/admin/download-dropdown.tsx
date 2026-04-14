"use client";

import { useState, useRef, useEffect } from "react";

export function DownloadDropdown({ eventId }: { eventId: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="admin-action text-xs"
      >
        Download ▾
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-10 mt-1 min-w-[180px] rounded-lg border border-slate/15 bg-white py-1 shadow-lg">
          <a
            href={`/api/admin/export/attendees?eventId=${eventId}`}
            className="block px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-slate-50"
            onClick={() => setOpen(false)}
          >
            Attendees
          </a>
          <a
            href={`/api/admin/export/registrations?eventId=${eventId}`}
            className="block px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-slate-50"
            onClick={() => setOpen(false)}
          >
            Registrations
          </a>
        </div>
      ) : null}
    </div>
  );
}
