import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReviewGate } from "@/components/ReviewGate";
import { Journal } from "@/components/today/Journal";
import { areaName, isAreaKey } from "@/lib/areas";
import {
  allOrThrow,
  eligibleFor,
  loadActiveLibrary,
  loadActiveSprint,
  loadAreaKit,
  loadDayOfferedItems,
  loadFinishedSprints,
  loadOverview,
  loadSprintItems,
  loadSprintObservations,
  loadStreaks,
  loadTasks,
  needsReview,
  streakOf,
} from "@/lib/data";
import type { Measured } from "@/lib/format";
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
  // Everything that does not depend on the active sprint starts with it (#26): the
  // library, the streaks and the kit used to wait a round trip for a read they never
  // needed; the overview and the finished list are cached and the layout reads them too.
  const [active, fullLibrary, streaks, kit, { vision }, finished] = await allOrThrow([
    loadActiveSprint(supabase, area),
    loadActiveLibrary(supabase),
    loadStreaks(supabase),
    loadAreaKit(supabase, area),
    loadOverview(supabase),
    loadFinishedSprints(supabase),
  ]);
  const name = areaName(area);

  if (!active) {
    // F10: a finished sprint whose postmortem is unwritten blocks the next one here
    // (rule 26), so the gate replaces the empty card until the review is finished. A
    // sprint that never closed a day is not such a block (0017).
    const inArea = finished.filter((s) => s.area === area);
    const unreviewed = inArea.find(needsReview);
    if (unreviewed) {
      const sprint = await supabase.from("sprints").select("measurement, currency, unit").eq("id", unreviewed.id).single();
      if (sprint.error) throw new Error(`sprint: ${sprint.error.message}`);
      const summary = await supabase.rpc("sprint_review_summary", { p_sprint_id: unreviewed.id });
      if (summary.error) throw new Error(`sprint_review_summary: ${summary.error.message}`);
      const measured: Measured = {
        measurement: sprint.data.measurement as Measured["measurement"],
        currency: sprint.data.currency,
        unit: sprint.data.unit,
      };
      return (
        <ReviewGate
          sprintId={unreviewed.id}
          area={area}
          outcome={unreviewed.outcome}
          status={unreviewed.status}
          summary={(summary.data ?? [])[0] ?? null}
          measured={measured}
        />
      );
    }

    const lastReviewed = inArea.find((s) => s.reviewedAt !== null) ?? null;
    return (
      <div className="card card-page poster" data-testid="empty-state">
        <span className="tag tag-accent">{name}</span>
        <h1 className="heading page-title mt-12">{vision ? `No sprint running in ${name}` : "No sprint can start here yet"}</h1>
        <p className="lede lede-narrow">
          {vision
            ? "Pick one numeric goal that moves the vision, lock it for 14 days, and close every day with an honest actual."
            : "A sprint has to advance the vision. Write it first; it takes three short steps."}
        </p>
        <div className="poster-actions">
          <Link href={vision ? `/sprints/new?area=${area}` : "/vision"} className="btn btn-primary btn-link">
            {vision ? `Create a ${name} sprint` : "Write the vision"}
          </Link>
          {lastReviewed ? (
            <Link href={`/insights/reviews/${lastReviewed.id}`} className="poster-link" data-testid="last-postmortem">
              Read the last postmortem
            </Link>
          ) : null}
        </div>
      </div>
    );
  }

  const position = sprintDayFor(active.sprint, new Date());
  const focusIndex = position.kind === "during" ? position.dayIndex : position.kind === "before" ? 1 : 14;
  const focusDay = active.days.find((d) => d.day_index === focusIndex) ?? active.days[0];
  const closedIds = active.days.filter((d) => d.closed_at !== null).map((d) => d.id);

  // allSettled: when one read fails the others still finish, so the failure reported
  // is the real one and no sibling rejection goes unhandled (BACKLOG, F4).
  const [items, offered, tasks, observations] = await allOrThrow([
    loadSprintItems(supabase, active.sprint.id),
    loadDayOfferedItems(supabase, focusDay.id),
    loadTasks(supabase, focusDay.id),
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
      lastLesson={kit?.lesson ?? null}
    />
  );
}
