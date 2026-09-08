import { SideNav, SideNavList, type SideItem } from "@/components/SideNav";
import { areaName } from "@/lib/areas";
import { loadFinishedSprints } from "@/lib/data";
import { formatIsoDate, stampDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

/**
 * The Insights sidebar (F10): finished sprints newest first, each either awaiting its
 * postmortem or carrying the date it was written. Running sprints never appear — a
 * review belongs to a sprint that is over. F11 adds Met / Under and % of goal to these
 * rows and builds the Across-sprints view the last entry points at.
 */
export default async function InsightsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const finished = await loadFinishedSprints(supabase);

  const short = (iso: string) => formatIsoDate(iso, { month: "short", day: "numeric" });
  const reviews: SideItem[] = finished.map((s) => ({
    href: `/insights/reviews/${s.id}`,
    label: s.outcome,
    meta: s.reviewedAt ? `Reviewed ${stampDate(s.reviewedAt)}` : "Needs review",
    metaAccent: s.reviewedAt === null,
    sub: `${areaName(s.area)} · ${short(s.start_date)} → ${short(s.end_date)}`,
  }));

  return (
    <>
      <SideNav title="Reviews" items={reviews}>
        {reviews.length === 0 ? <div className="side-sub side-empty">Postmortems open here when a sprint ends.</div> : null}
        <div className="label-muted side-title side-title-more">Across sprints</div>
        <SideNavList items={[{ href: "/insights", label: "What works for you" }]} />
      </SideNav>
      <main className="main">
        <div className="workspace">{children}</div>
      </main>
    </>
  );
}
