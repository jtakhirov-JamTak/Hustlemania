import { SideNav, SideNavList, type SideItem } from "@/components/SideNav";
import { areaName } from "@/lib/areas";
import { COMPLETION_LABEL, loadMeasuredSprints, needsReview } from "@/lib/data";
import { formatIsoDate, stampDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

/**
 * The Insights sidebar: finished sprints newest first, each either awaiting its
 * postmortem or carrying the date it was written. Running sprints never appear — a
 * review belongs to a sprint that is over.
 *
 * The second sub line is the product's measurement (F11, D9): Part 2 §1 says these rows
 * are how "a meaningful share reach their locked Goal" gets read, so Met / Under, % of
 * goal and how the sprint ended live here rather than on a screen of their own.
 */
export default async function InsightsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const finished = await loadMeasuredSprints(supabase);

  const short = (iso: string) => formatIsoDate(iso, { month: "short", day: "numeric" });
  const reviews: SideItem[] = finished.map((s) => ({
    href: `/insights/reviews/${s.id}`,
    label: s.outcome,
    // A sprint that never closed a day does not block its Area (0017); its postmortem
    // stays open to write, but the row must not say the Area is waiting on it.
    meta: s.reviewedAt ? `Reviewed ${stampDate(s.reviewedAt)}` : needsReview(s) ? "Needs review" : "Never ran",
    metaAccent: needsReview(s),
    sub: `${areaName(s.area)} · ${short(s.start_date)} → ${short(s.end_date)}`,
    result: {
      lead: s.met ? "Met" : "Under",
      tone: s.met ? ("met" as const) : ("under" as const),
      rest: `${s.pct}% of goal · ${COMPLETION_LABEL[s.status] ?? s.status}`,
    },
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
