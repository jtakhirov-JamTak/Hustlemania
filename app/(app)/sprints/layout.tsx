import { SideNav, type SideItem } from "@/components/SideNav";
import { allOrThrow, loadFinishedSprints, loadOverview } from "@/lib/data";
import { sprintDayFor } from "@/lib/sprintDay";
import { createClient } from "@/lib/supabase/server";

/**
 * The Sprints sidebar (F8): one row per area — label · meta · sub. No New Sprint button
 * (the empty-area card carries the CTA); the streak lives in the journal's rail.
 *
 * F10: an Area whose last sprint ended without a postmortem reads `Ended · Needs review`
 * in the accent, not `Ready` — the next sprint there is blocked by rule 26, and the
 * sidebar has to say so rather than invite a start the wizard will refuse.
 */
export default async function SprintsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const [{ vision, areas }, finished] = await allOrThrow([loadOverview(supabase), loadFinishedSprints(supabase)]);
  const now = new Date();

  const items: SideItem[] = areas.map((a) => {
    if (a.sprint) {
      const pos = sprintDayFor(a.sprint, now);
      const meta = pos.kind === "during" ? `Day ${pos.dayIndex}/14` : pos.kind === "before" ? "Starts tomorrow" : "Ended";
      return { href: `/sprints/${a.key}`, label: a.name, meta, sub: a.sprint.outcome };
    }
    const unreviewed = finished.find((s) => s.area === a.key && s.reviewedAt === null);
    if (unreviewed) {
      return { href: `/sprints/${a.key}`, label: a.name, meta: "Ended", metaAccent: true, sub: "Needs review" };
    }
    if (vision) return { href: `/sprints/${a.key}`, label: a.name, meta: "Ready", sub: "No active sprint" };
    return { href: `/sprints/${a.key}`, label: a.name, meta: "Locked", sub: "Vision not written yet" };
  });

  return (
    <>
      <SideNav title="Sprints" items={items} />
      <main className="main">
        <div className="workspace workspace-journal">{children}</div>
      </main>
    </>
  );
}
