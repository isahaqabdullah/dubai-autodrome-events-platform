"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navItems = [
  {
    href: "/admin",
    label: "Events",
    match: (pathname: string) =>
      pathname === "/admin" || (pathname.startsWith("/admin/events/") && pathname !== "/admin/events/new")
  },
  {
    href: "/admin/events/new",
    label: "Create event",
    match: (pathname: string) => pathname === "/admin/events/new"
  },
  {
    href: "/admin/registrations",
    label: "Registrations",
    match: (pathname: string) => pathname.startsWith("/admin/registrations")
  }
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-2">
      {navItems.map((item) => {
        const active = item.match(pathname);

        return (
            <Link
              key={item.href}
              href={item.href as Route}
              className={cn(
              "inline-flex items-center rounded-full border px-4 py-2.5 text-sm font-medium transition",
              active
                ? "border-ink bg-ink text-white shadow-soft"
                : "border-slate/15 bg-white/75 text-slate hover:border-slate/30 hover:text-ink"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
