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
    <nav style={{ display: "flex" }} aria-label="Sections">
      {TABS.map((t) => {
        const active = pathname === t.href || pathname.startsWith(t.href + "/");
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            style={{
              display: "flex",
              alignItems: "center",
              boxShadow: active ? "inset 0 -2px 0 var(--accent)" : "none",
              color: active ? "var(--ink)" : "var(--muted)",
              padding: "0 22px",
              fontSize: 13.5,
              fontWeight: 600,
              minHeight: 56,
              textDecoration: "none",
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
