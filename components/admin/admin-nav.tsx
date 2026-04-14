"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navItems = [
  {
    href: "/admin/events/new",
    label: "Create event",
    primary: true,
    match: (pathname: string) => pathname === "/admin/events/new"
  },
  {
    href: "/admin",
    label: "Events",
    primary: false,
    match: (pathname: string) =>
      pathname === "/admin" || (pathname.startsWith("/admin/events/") && pathname !== "/admin/events/new")
  },
  {
    href: "/admin/registrations",
    label: "Registrations & Analytics",
    primary: false,
    match: (pathname: string) => pathname.startsWith("/admin/registrations")
  }
];

export function AdminNav({
  className,
  hideOnDashboard = false,
  activeStyle = "fill"
}: {
  className?: string;
  hideOnDashboard?: boolean;
  activeStyle?: "fill" | "line";
}) {
  const pathname = usePathname();

  if (hideOnDashboard && pathname === "/admin") {
    return null;
  }

  return (
    <nav className={cn("flex flex-wrap items-center gap-2", className)}>
      {navItems.map((item) => {
        const active = item.match(pathname);

        return (
          <Link
            key={item.href}
            href={item.href as Route}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative inline-flex items-center justify-center overflow-hidden rounded-2xl border px-4 py-2.5 text-sm font-medium transition",
              active && "font-bold",
              active && activeStyle === "line"
                ? "border-slate/15 bg-white text-ink"
                : item.primary
                ? "min-w-[160px] border-ink bg-ink text-white hover:bg-ink/92"
                : active
                  ? "border-ink bg-ink text-white"
                  : "border-slate/15 bg-white text-ink hover:border-slate/30 hover:bg-slate-50"
            )}
          >
            {active && activeStyle === "line" ? (
              <span className="absolute inset-x-3 top-0 h-1 rounded-full bg-ink" aria-hidden="true" />
            ) : null}
            <span className="relative">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
