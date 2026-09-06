"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type SideItem = {
  href: string;
  label: string;
  meta?: string;
  metaAccent?: boolean;
  sub?: string;
  /** A second quiet line under `sub` — the sprint's streak. */
  note?: string;
};

export function SideNavList({ items }: { items: SideItem[] }) {
  const pathname = usePathname();
  return (
    <>
      {items.map((it) => {
        const active = pathname === it.href || pathname.startsWith(it.href + "/");
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            style={{
              display: "block",
              width: "calc(100% - 20px)",
              textDecoration: "none",
              color: "inherit",
              borderRadius: 12,
              marginLeft: 10,
              marginBottom: 2,
              background: active ? "color-mix(in srgb, var(--accent) 10%, transparent)" : "transparent",
              padding: "11px 14px 12px",
            }}
          >
            <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
              <span style={{ fontWeight: 600, fontSize: 13.5 }}>{it.label}</span>
              {it.meta ? (
                <span
                  style={{
                    fontSize: 10.5,
                    color: it.metaAccent ? "var(--accent)" : "var(--muted)",
                    whiteSpace: "nowrap",
                    fontWeight: 600,
                  }}
                >
                  {it.meta}
                </span>
              ) : null}
            </span>
            {it.sub ? (
              <span style={{ display: "block", fontSize: 11.5, color: "var(--muted)", marginTop: 3, lineHeight: 1.4 }}>{it.sub}</span>
            ) : null}
            {it.note ? (
              <span style={{ display: "block", fontSize: 10.5, color: "var(--muted)", marginTop: 4, fontWeight: 600 }} data-testid="side-note">
                {it.note}
              </span>
            ) : null}
          </Link>
        );
      })}
    </>
  );
}

export function SideNav({ title, items, children }: { title: string; items: SideItem[]; children?: React.ReactNode }) {
  return (
    <aside
      data-sidebar
      style={{
        width: 266,
        flex: "0 0 266px",
        borderRight: "1px solid var(--divider)",
        padding: "20px 0 40px",
        background: "var(--panel)",
      }}
    >
      <div className="label-muted" style={{ padding: "0 24px 10px" }}>
        {title}
      </div>
      <SideNavList items={items} />
      {children}
    </aside>
  );
}
