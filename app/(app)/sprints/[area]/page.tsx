import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Journal } from "@/components/today/Journal";
import { areaName, isAreaKey } from "@/lib/areas";
import {
  allOrThrow,
  eligibleFor,
  loadActiveLibrary,
  loadActiveSprint,
  loadDayOfferedItems,
  loadOverview,
  loadSprintItems,
  loadSprintObservations,
  loadStreaks,
  loadTasks,
  streakOf,
} from "@/lib/data";
import { sprintDayFor } from "@/lib/sprintDay";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata({ params }: { params: Promise<{ area: string }> }): Promise<Metadata> {
  const { area } = await params;
  return { title: isAreaKey(area) ? `${areaName(area)} sprint` : "Sprints" };
}

export default async function AreaPage({ params }: { params: Promise<{ area: string }> }) {
  const { area } = await params;
  if (!isAreaKey(area)) notFound();

  const supabase = await createClient();
  const active = await loadActiveSprint(supabase, area);
  const name = areaName(area);

  if (!active) {
    const { vision } = await loadOverview(supabase);
    return (
      <div className="card card-page poster" data-testid="empty-state">
        <span className="tag tag-accent">{name}</span>
        <h1 className="heading page-title mt-12">{vision ? `No sprint running in ${name}` : "No sprint can start here yet"}</h1>
        <p className="lede lede-narrow">
          {vision
            ? "Pick one numeric goal that moves the vision, lock it for 14 days, and close every day with an honest actual."
            : "A sprint has to advance the vision. Write it first; it takes three short steps."}
        </p>
        <Link href={vision ? `/sprints/new?area=${area}` : "/vision"} className="btn btn-primary btn-link mt-18">
          {vision ? `Create a ${name} sprint` : "Write the vision"}
        </Link>
      </div>
    );
  }

  const position = sprintDayFor(active.sprint, new Date());
  const focusIndex = position.kind === "during" ? position.dayIndex : position.kind === "before" ? 1 : 14;
  const focusDay = active.days.find((d) => d.day_index === focusIndex) ?? active.days[0];
  const closedIds = active.days.filter((d) => d.closed_at !== null).map((d) => d.id);

  // allSettled: when one read fails the others still finish, so the failure reported
  // is the real one and no sibling rejection goes unhandled (BACKLOG, F4).
  const [items, fullLibrary, offered, tasks, streaks, observations] = await allOrThrow([
    loadSprintItems(supabase, active.sprint.id),
    loadActiveLibrary(supabase),
    loadDayOfferedItems(supabase, focusDay.id),
    loadTasks(supabase, focusDay.id),
    loadStreaks(supabase),
    loadSprintObservations(supabase, closedIds),
  ]);
  const library = { cues: fullLibrary.cues.filter(eligibleFor(area)), impediments: fullLibrary.impediments.filter(eligibleFor(area)) };

  return (
    <Journal
      sprint={active.sprint}
      days={active.days}
      position={position}
      items={items}
      library={library}
      offered={offered}
      tasks={tasks}
      streak={streakOf(streaks, active.sprint.id)}
      observations={observations}
    />
  );
}
