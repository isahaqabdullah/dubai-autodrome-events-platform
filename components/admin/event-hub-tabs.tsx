"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { key: "overview", label: "Overview" },
  { key: "registrations", label: "Registrations" },
  { key: "settings", label: "Settings" },
] as const;

export function EventHubTabs({ activeTab }: { activeTab: string }) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={(tab.key === "overview" ? pathname : `${pathname}?tab=${tab.key}`) as Route}
          className={cn(
            "relative shrink-0 px-4 py-3 text-sm font-medium transition",
            tab.key === activeTab
              ? "text-ink"
              : "text-slate hover:text-ink"
          )}
        >
          {tab.label}
          {tab.key === activeTab && (
            <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-ink" />
          )}
        </Link>
      ))}
    </nav>
  );
}
