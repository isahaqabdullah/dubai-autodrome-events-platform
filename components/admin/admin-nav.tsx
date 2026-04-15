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
    <nav className={cn("flex items-center gap-1.5 overflow-x-auto sm:flex-wrap sm:gap-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}>
      {navItems.map((item) => {
        const active = item.match(pathname);

        return (
          <Link
            key={item.href}
            href={item.href as Route}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl border px-3 py-1.5 text-xs font-medium transition sm:rounded-2xl sm:px-4 sm:py-2.5 sm:text-sm",
              active && "font-bold",
              active && activeStyle === "line"
                ? "border-slate/15 bg-white text-ink"
                : item.primary
                ? "border-ink bg-ink text-white hover:bg-ink/92 sm:min-w-[160px]"
                : active
                  ? "border-ink bg-ink text-white"
                  : "border-slate/15 bg-white text-ink hover:border-slate/30 hover:bg-slate-50"
            )}
          >
            {active && activeStyle === "line" ? (
              <span className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-ink sm:h-1" aria-hidden="true" />
            ) : null}
            <span className="relative">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
