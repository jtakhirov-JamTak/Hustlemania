import Link from "next/link";
import { notFound } from "next/navigation";
import { TodayView } from "@/components/today/TodayView";
import { areaName, isAreaKey } from "@/lib/areas";
import { loadActiveLibrary, loadActiveSprint, loadActiveVision, loadDayOfferedItems, loadSprintItems, loadStreaks, loadTasks } from "@/lib/data";
import { sprintDayFor } from "@/lib/sprintDay";
import { createClient } from "@/lib/supabase/server";

export default async function AreaPage({ params }: { params: Promise<{ area: string }> }) {
  const { area } = await params;
  if (!isAreaKey(area)) notFound();

  const supabase = await createClient();
  const active = await loadActiveSprint(supabase, area);
  const name = areaName(area);

  if (!active) {
    const vision = await loadActiveVision(supabase, area);
    return (
      <div className="card" style={{ padding: "28px 30px" }} data-testid="empty-state">
        <span className="tag tag-accent">{name}</span>
        <h1 className="heading" style={{ fontSize: 30, margin: "12px 0 0" }}>
          {vision ? `No sprint running in ${name}` : "No sprint can start here yet"}
        </h1>
        <p style={{ fontSize: 14.5, lineHeight: 1.55, color: "var(--muted)", marginTop: 10, maxWidth: "52ch" }}>
          {vision
            ? "Pick one numeric goal that moves the vision, lock it for 14 days, and close every day with an honest actual."
            : `A sprint has to advance a 1-year vision. Write the ${name} vision first; it takes one paragraph.`}
        </p>
        <Link
          href={vision ? `/sprints/new?area=${area}` : `/vision/${area}`}
          className="btn btn-primary"
          style={{ display: "inline-block", marginTop: 18, textDecoration: "none" }}
        >
          {vision ? `Create a ${name} sprint` : `Write the ${name} vision`}
        </Link>
      </div>
    );
  }

  const position = sprintDayFor(active.sprint, new Date());
  const focusIndex = position.kind === "during" ? position.dayIndex : position.kind === "before" ? 1 : 14;
  const focusDay = active.days.find((d) => d.day_index === focusIndex) ?? active.days[0];

  const [items, fullLibrary, offered, tasks, streaks] = await Promise.all([
    loadSprintItems(supabase, active.sprint.id),
    loadActiveLibrary(supabase),
    loadDayOfferedItems(supabase, focusDay.id),
    loadTasks(supabase, focusDay.id),
    loadStreaks(supabase),
  ]);
  // Pickers offer only what this area's sprint may carry (global or same-area scope).
  const eligible = (l: { scope: string }) => l.scope === "global" || l.scope === area;
  const library = { cues: fullLibrary.cues.filter(eligible), impediments: fullLibrary.impediments.filter(eligible) };

  return <TodayView sprint={active.sprint} days={active.days} position={position} items={items} library={library} offered={offered} tasks={tasks} streak={streaks.get(active.sprint.id) ?? 0} />;
}
