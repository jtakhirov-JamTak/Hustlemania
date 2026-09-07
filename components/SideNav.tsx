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
          <Link key={it.href} href={it.href} aria-current={active ? "page" : undefined} className={`side-link ${active ? "side-link-on" : ""}`}>
            <span className="side-link-head">
              <span className="side-label">{it.label}</span>
              {it.meta ? <span className={`side-meta ${it.metaAccent ? "side-meta-accent" : ""}`}>{it.meta}</span> : null}
            </span>
            {it.sub ? <span className="side-sub">{it.sub}</span> : null}
            {it.note ? (
              <span className="side-note" data-testid="side-note">
                {it.note}
              </span>
            ) : null}
          </Link>
        );
      })}
    </>
  );
}

/**
 * The section sidebar: a list beside the page on desktop, one scrolling row of chips
 * above it at ≤940px (see `[data-sidebar]` in globals.css). Section titles go with the
 * list layout; on the row the chips speak for themselves.
 */
export function SideNav({ title, items, children }: { title: string; items: SideItem[]; children?: React.ReactNode }) {
  return (
    <aside data-sidebar>
      <div className="label-muted side-title">{title}</div>
      <SideNavList items={items} />
      {children}
    </aside>
  );
}
