"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type SideItem = {
  href: string;
  label: string;
  meta?: string;
  metaAccent?: boolean;
  sub?: string;
  /**
   * A second sub line carrying an outcome (F11): the Insights rows put Met / Under, % of
   * goal and how the sprint ended here, because Part 2 §1 makes these rows the product's
   * measurement. `lead` is emphasised and tinted by `tone`.
   */
  result?: { lead: string; tone: "met" | "under"; rest: string };
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
            {it.result ? (
              <span className="side-result">
                <strong data-state={it.result.tone}>{it.result.lead}</strong> · {it.result.rest}
              </span>
            ) : null}
          </Link>
        );
      })}
    </>
  );
}

/**
 * The section sidebar (U1): one scrolling row of chips above the page on every width
 * (see `[data-sidebar]` in globals.css). Only the selected chip shows its sub lines; the
 * others keep theirs off screen but in the accessibility tree. Section titles are hidden —
 * on the row the chips speak for themselves.
 */
export function SideNav({ title, items, children }: { title: string; items: SideItem[]; children?: React.ReactNode }) {
  return (
    <nav data-sidebar aria-label={title}>
      <div className="label-muted side-title">{title}</div>
      <SideNavList items={items} />
      {children}
    </nav>
  );
}
