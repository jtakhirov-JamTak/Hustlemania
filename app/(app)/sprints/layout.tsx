import { SideNav, type SideItem } from "@/components/SideNav";
import { loadOverview } from "@/lib/data";
import { sprintDayFor } from "@/lib/sprintDay";
import { createClient } from "@/lib/supabase/server";

/**
 * The Sprints sidebar (F8): one row per area — label · meta · sub. No New Sprint button
 * (the empty-area card carries the CTA); the streak lives in the journal's rail.
 */
export default async function SprintsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const areas = await loadOverview(supabase);
  const now = new Date();

  const items: SideItem[] = areas.map((a) => {
    if (a.sprint) {
      const pos = sprintDayFor(a.sprint, now);
      const meta = pos.kind === "during" ? `Day ${pos.dayIndex}/14` : pos.kind === "before" ? "Starts tomorrow" : "Ended";
      return { href: `/sprints/${a.key}`, label: a.name, meta, sub: a.sprint.outcome };
    }
    if (a.vision) return { href: `/sprints/${a.key}`, label: a.name, meta: "Ready", sub: "No active sprint" };
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
