"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { appendReturnTo } from "@/lib/admin-navigation";
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
    fresh: true,
    match: (pathname: string) => pathname.startsWith("/admin/registrations")
  },
  {
    href: "/admin/payments",
    label: "Payments",
    primary: false,
    fresh: true,
    match: (pathname: string) => pathname.startsWith("/admin/payments")
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
  const searchParams = useSearchParams();
  const currentHref = searchParams.size > 0 ? `${pathname}?${searchParams.toString()}` : pathname;

  if (hideOnDashboard && pathname === "/admin") {
    return null;
  }

  return (
    <nav className={cn("flex items-center gap-1.5 overflow-x-auto sm:flex-wrap sm:gap-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}>
      {navItems.map((item) => {
        const active = item.match(pathname);

        const className = cn(
          "relative inline-flex shrink-0 items-center justify-center rounded-xl border px-3 py-1.5 text-xs font-medium transition sm:rounded-2xl sm:px-4 sm:py-2.5 sm:text-sm",
          active && activeStyle === "line"
            ? "border-transparent bg-transparent text-ink font-semibold after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-ink sm:after:h-[3px]"
            : item.primary
            ? "border-ink bg-ink text-white hover:bg-ink/92 sm:min-w-[160px]"
            : active
              ? "border-ink bg-ink text-white font-semibold"
              : "border-slate/15 bg-white text-ink hover:border-slate/30 hover:bg-slate-50"
        );

        const content = <span>{item.label}</span>;

        return item.fresh ? (
          <a key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={className}>
            {content}
          </a>
        ) : (
          <Link
            key={item.href}
            href={
              (
                item.href === "/admin/events/new"
                  ? active
                    ? currentHref
                    : appendReturnTo(item.href, currentHref)
                  : item.href
              ) as Route
            }
            aria-current={active ? "page" : undefined}
            className={className}
          >
            {content}
          </Link>
        );
      })}
    </nav>
  );
}
