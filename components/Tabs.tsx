"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/sprints", label: "Sprints" },
  { href: "/vision", label: "Vision" },
  { href: "/insights", label: "Insights" },
];

export function Tabs() {
  const pathname = usePathname();
  return (
    <nav className="tabs" aria-label="Sections">
      {TABS.map((t) => {
        const active = pathname === t.href || pathname.startsWith(t.href + "/");
        return (
          <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined} className={`tab ${active ? "tab-on" : ""}`}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
