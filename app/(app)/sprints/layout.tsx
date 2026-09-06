import Link from "next/link";
import { SideNav, type SideItem } from "@/components/SideNav";
import { loadOverview, loadStreaks, streakOf } from "@/lib/data";
import { sprintDayFor, streakLabel } from "@/lib/sprintDay";
import { createClient } from "@/lib/supabase/server";

export default async function SprintsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const [areas, streaks] = await Promise.all([loadOverview(supabase), loadStreaks(supabase)]);
  const now = new Date();

  const items: SideItem[] = areas.map((a) => {
    if (a.sprint) {
      const pos = sprintDayFor(a.sprint, now);
      const meta = pos.kind === "during" ? `Day ${pos.dayIndex}/14` : pos.kind === "before" ? "Starts tomorrow" : "Ended";
      const note = pos.kind === "before" ? undefined : streakLabel(streakOf(streaks, a.sprint.id));
      return { href: `/sprints/${a.key}`, label: a.name, meta, sub: a.sprint.outcome, note };
    }
    if (a.vision) return { href: `/sprints/${a.key}`, label: a.name, meta: "Ready", sub: "No active sprint" };
    return { href: `/sprints/${a.key}`, label: a.name, meta: "Locked", sub: "No 1-year vision yet" };
  });

  return (
    <>
      <SideNav title="Sprints" items={items}>
        <div style={{ padding: "14px 20px 0" }}>
          <Link href="/sprints/new" className="btn btn-primary btn-block" style={{ display: "block", textDecoration: "none" }}>
            New Sprint
          </Link>
        </div>
      </SideNav>
      <main data-main style={{ flex: 1, minWidth: 0, padding: "30px 40px 100px" }}>
        <div style={{ maxWidth: 940 }}>{children}</div>
      </main>
    </>
  );
}
