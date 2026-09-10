import type { AreaKey } from "@/lib/areas";
import type { CueRow, FollowThroughRow, ImpactRow, RecoveryRow } from "@/lib/data";

/**
 * Across sprints (F11): the per-sprint insight rows F10's SQL already returns, grouped
 * into one row per item so the four cards can be read over a whole history.
 *
 * Nothing here pools days. A group's two bars are ONE sprint's comparison — the most
 * recent that clears the n≥3 bar — because a median over days drawn from sprints with
 * different goals would be a number no postmortem could confirm (C5). The only figure
 * that spans sprints is the recurring note, and it counts sprints, never days.
 *
 * The looser `RECUR_MIN` bar is deliberate: "did this repeat" is a weaker question than
 * "what was the delta", so a sprint may vote on the first while being too thin to show
 * the second.
 */

/** Days on each side for a sprint to vote in the recurring note. The card needs 3. */
export const RECUR_MIN = 2;

export type Scope = "all" | AreaKey;

export type SprintRef = {
  id: string;
  area: AreaKey;
  start_date: string;
  end_date: string;
};

/** One finished sprint's four result sets, as `loadAcross` reads them. */
export type SprintInsights = {
  sprint: SprintRef;
  impact: ImpactRow[];
  follow: FollowThroughRow[];
  recovery: RecoveryRow[];
  cues: CueRow[];
};

/**
 * A grouped row: the sprint whose comparison is shown (null when none qualifies),
 * how many sprints the item appeared in, and the recurring verdict.
 */
export type Grouped<T> = {
  key: string;
  /** The row to render bars and sizes from. Never null: falls back to the newest sprint. */
  row: T;
  /** The sprint `row` came from, or null when no sprint in the group cleared n≥3. */
  from: SprintRef | null;
  /** The group's Area. On the All-areas scope it labels the row: the same item in two
   *  areas is two rows, and without this they are indistinguishable. */
  area: AreaKey;
  sprints: number;
  recurring: string | null;
};

const areaOf = (s: SprintRef) => s.area;

type Entry<T> = { row: T; sprint: SprintRef; order: number };

/**
 * `order` is recency by **when the sprint ran** (`end_date` descending), not by when its
 * postmortem happened to be written. A window that ran out in July and was finished by
 * hand in September is still the older sprint, and "the most recent sprint that clears
 * the bar" has to mean the one a reader would point at.
 */
function collect<T>(history: SprintInsights[], pick: (s: SprintInsights) => T[], keyOf: (row: T, sprint: SprintRef) => string): Map<string, Entry<T>[]> {
  const byRecency = [...history].sort((a, b) => b.sprint.end_date.localeCompare(a.sprint.end_date));
  const groups = new Map<string, Entry<T>[]>();
  byRecency.forEach((entry, order) => {
    for (const row of pick(entry)) {
      const key = keyOf(row, entry.sprint);
      const list = groups.get(key) ?? [];
      list.push({ row, sprint: entry.sprint, order });
      groups.set(key, list);
    }
  });
  return groups;
}

/**
 * The group's displayed row: the most recent entry with `enough`, else the most recent
 * entry at all. `from` is null in the fallback case — the attribution exists only to say
 * which sprint the bars came from, so it must be absent when there are no bars.
 */
function choose<T extends { enough: boolean }>(entries: Entry<T>[]): { row: T; from: SprintRef | null } {
  const byRecency = [...entries].sort((a, b) => a.order - b.order);
  const qualifying = byRecency.find((e) => e.row.enough);
  if (qualifying) return { row: qualifying.row, from: qualifying.sprint };
  return { row: byRecency[0].row, from: null };
}

/** "Hurt in 2 of 3 sprints with enough days — recurring", or the nothing-yet line. */
function comparisonNote(deltas: (number | null)[], sprints: number, good: boolean): string {
  const voted = deltas.filter((d): d is number => d !== null);
  if (voted.length === 0) return `In ${sprints} sprint${sprints === 1 ? "" : "s"} · no single sprint has enough days yet`;
  const same = voted.filter((d) => (good ? d > 0 : d < 0)).length;
  const word = good ? "Helped" : "Hurt";
  const recurring = same === voted.length && voted.length >= 2 ? " — recurring" : "";
  return `${word} in ${same} of ${voted.length} sprint${voted.length === 1 ? "" : "s"} with enough days${recurring}`;
}

/** A sprint votes on the recurring note at RECUR_MIN days each side, not the card's 3. */
const voteDelta = (present: number, absent: number, medianPresent: number | null, medianAbsent: number | null): number | null =>
  present >= RECUR_MIN && absent >= RECUR_MIN && medianPresent !== null && medianAbsent !== null ? Math.round((medianPresent - medianAbsent) * 100) : null;

export function groupImpact(history: SprintInsights[], scope: Scope): Grouped<ImpactRow>[] {
  const groups = collect(
    history,
    (s) => s.impact,
    (row, sprint) => (scope === "all" ? `${row.item_id}::${areaOf(sprint)}` : row.item_id),
  );
  return [...groups].map(([key, entries]) => {
    const { row, from } = choose(entries);
    return {
      key,
      row,
      from,
      area: entries[0].sprint.area,
      sprints: new Set(entries.map((e) => e.sprint.id)).size,
      recurring: comparisonNote(
        entries.map((e) => voteDelta(e.row.present_days, e.row.absent_days, e.row.median_present, e.row.median_absent)),
        new Set(entries.map((e) => e.sprint.id)).size,
        false,
      ),
    };
  });
}

export function groupCues(history: SprintInsights[], scope: Scope): Grouped<CueRow>[] {
  const groups = collect(
    history,
    (s) => s.cues,
    (row, sprint) => (scope === "all" ? `${row.item_id}::${areaOf(sprint)}` : row.item_id),
  );
  return [...groups].map(([key, entries]) => {
    const { row, from } = choose(entries);
    return {
      key,
      row,
      from,
      area: entries[0].sprint.area,
      sprints: new Set(entries.map((e) => e.sprint.id)).size,
      recurring: comparisonNote(
        entries.map((e) => voteDelta(e.row.used_days, e.row.unused_days, e.row.median_used, e.row.median_unused)),
        new Set(entries.map((e) => e.sprint.id)).size,
        true,
      ),
    };
  });
}

/**
 * Tri-state note: a sprint votes using the card's own numerator and denominator, so the
 * note and the displayed rate never disagree. Follow-through votes at
 * `answered >= RECUR_MIN` from `ran / answered` (`answered` counts `partially`, 0015).
 * Recovery votes from the SQL's own `rate`: its numerator is every `recovered = 'yes'`
 * regardless of the response answer, and the row carries no such count below the n≥3
 * bar, so recovery votes only where the card shows a rate. Recomputing it from
 * `with_recovered + without_recovered` dropped the days whose response was `unsure`
 * and made the note contradict the tail (FIX_LOG 2026-09-09).
 */
function triNote(votes: (boolean | null)[], word: "Ran" | "Recovered"): string | null {
  const voted = votes.filter((v): v is boolean => v !== null);
  if (voted.length === 0) return null;
  return `${word} at least half the time in ${voted.filter(Boolean).length} of ${voted.length} sprint${voted.length === 1 ? "" : "s"}`;
}

const triVote = (answered: number, yes: number): boolean | null => (answered >= RECUR_MIN ? yes / answered >= 0.5 : null);
const rateVote = (rate: number | null): boolean | null => (rate === null ? null : rate >= 50);

/**
 * The response cards group by item **and version** — the sprint's proof text. A rewritten
 * WHEN → THEN is a different intervention, so it starts its own row rather than merging
 * its rate into the old text's. Note the version is the tuple the SQL reports per sprint
 * (`max(proof_then)`), so a rewrite *inside* one sprint cannot be split here.
 */
export function groupFollow(history: SprintInsights[], scope: Scope): Grouped<FollowThroughRow>[] {
  const groups = collect(
    history,
    (s) => s.follow.filter((r) => r.occurrences > 0),
    (row, sprint) => [row.item_id, row.proof_then ?? "", scope === "all" ? areaOf(sprint) : ""].join("::"),
  );
  return [...groups].map(([key, entries]) => {
    const { row, from } = choose(entries);
    return {
      key,
      row,
      from,
      area: entries[0].sprint.area,
      sprints: new Set(entries.map((e) => e.sprint.id)).size,
      recurring: triNote(
        entries.map((e) => triVote(e.row.answered, e.row.ran)),
        "Ran",
      ),
    };
  });
}

export function groupRecovery(history: SprintInsights[], scope: Scope): Grouped<RecoveryRow>[] {
  const groups = collect(
    history,
    (s) => s.recovery.filter((r) => r.answered > 0 || r.with_response > 0 || r.without_response > 0),
    (row, sprint) => [row.item_id, row.proof_recover ?? "", scope === "all" ? areaOf(sprint) : ""].join("::"),
  );
  return [...groups].map(([key, entries]) => {
    const { row, from } = choose(entries);
    return {
      key,
      row,
      from,
      area: entries[0].sprint.area,
      sprints: new Set(entries.map((e) => e.sprint.id)).size,
      recurring: triNote(
        entries.map((e) => rateVote(e.row.rate)),
        "Recovered",
      ),
    };
  });
}
