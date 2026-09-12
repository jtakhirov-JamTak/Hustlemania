import type { InsightRow } from "@/components/insights/InsightCard";
import type { CueRow, ImpactRow, ItemKind, RecoveryRow, SituationRow } from "@/lib/data";

/**
 * The insight cards' copy and bar geometry, kept out of the components so the
 * thresholds and the wording are unit-testable without rendering.
 *
 * Two rules run through all of it. Every comparison prints both group sizes, so a
 * reader can see how thin the evidence is. And nothing here says "caused" — a delta is
 * "points", a rate is "of answered" (PRD §11: associations, never causes).
 */

/** The DB's `insight_min_days`. Duplicated here only for copy; `enough` is the DB's word. */
export const MIN_DAYS = 3;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** A median attainment ratio as a percentage, or an em dash when the group was empty. */
export function attainment(v: number | null): string {
  return v === null ? "—" : `${Math.round(v * 100)}%`;
}

/** A bar's width: attainment is unbounded (200% of target is a real day), so it is capped. */
function width(v: number | null): number {
  return v === null ? 0 : Math.min(100, Math.round(v * 50));
}

function pts(delta: number | null): string {
  if (delta === null) return "Not enough data";
  return `${delta > 0 ? "+" : ""}${delta} pts`;
}

export function impactRows(rows: ImpactRow[]): InsightRow[] {
  return rows.map((r) => ({
    key: r.item_id,
    name: r.name,
    tag: r.is_highest ? "HIGHEST" : null,
    tail: pts(r.delta_pts),
    tailTone: r.delta_pts !== null && r.delta_pts <= -10 ? ("bad" as const) : undefined,
    sub: `Present on ${r.present_days} of ${plural(r.logged_days, "logged day")}`,
    bars: [
      { value: attainment(r.median_present), label: "attainment when present", pct: width(r.median_present), tone: "bad" as const },
      { value: attainment(r.median_absent), label: "attainment when absent", pct: width(r.median_absent) },
    ],
    note: r.enough ? null : `Needs ${MIN_DAYS} days with and ${MIN_DAYS} without · has ${r.present_days} and ${r.absent_days}`,
    warn: !r.enough,
  }));
}

export function cueRows(rows: CueRow[]): InsightRow[] {
  return rows.map((r) => ({
    key: r.item_id,
    name: r.name,
    tag: r.is_focus ? "FOCUS" : null,
    tail: pts(r.delta_pts),
    tailTone: r.delta_pts !== null && r.delta_pts >= 10 ? ("good" as const) : undefined,
    sub: `Used on ${r.used_days} of ${plural(r.logged_days, "logged day")}`,
    bars: [
      { value: attainment(r.median_used), label: "attainment when used", pct: width(r.median_used), tone: "good" as const },
      { value: attainment(r.median_unused), label: "attainment when not used", pct: width(r.median_unused) },
    ],
    note: r.enough ? null : `Needs ${MIN_DAYS} days with and ${MIN_DAYS} without · has ${r.used_days} and ${r.unused_days}`,
    warn: !r.enough,
  }));
}

/**
 * F15: recovery per impediment, over the situations it showed up in. A row exists for
 * every impediment that showed up at all; the rate needs MIN_DAYS answered recoveries.
 */
export function recoveryRows(rows: RecoveryRow[]): InsightRow[] {
  return rows
    .filter((r) => r.occurrences > 0)
    .map((r) => {
      const short = r.enough ? "" : `Needs ${MIN_DAYS} answered recoveries · has ${r.answered}`;
      const blank = r.occurrences - r.answered;
      const left = blank > 0 ? `${plural(blank, "occurrence")} left blank` : "";
      return {
        key: r.item_id,
        name: r.name,
        tag: r.is_highest ? "HIGHEST" : null,
        tail: r.rate === null ? "Not enough data" : `${r.rate}% recovered`,
        tailTone: r.rate === null ? undefined : r.rate >= 70 ? ("good" as const) : r.rate < 40 ? ("bad" as const) : undefined,
        sub: r.proof_recover ? `Recovered when ${r.proof_recover}` : "No recovery criterion was recorded for this sprint",
        bars: [
          { value: `${r.recovered} of ${r.answered}`, label: "recovered", pct: r.answered ? (r.recovered / r.answered) * 100 : 0, tone: "good" as const },
          { value: `${r.didnt} of ${r.answered}`, label: "didn't recover", pct: r.answered ? (r.didnt / r.answered) * 100 : 0, tone: "bad" as const },
        ],
        note: [short, left].filter(Boolean).join(" · ") || null,
        warn: !r.enough,
      };
    });
}

/**
 * F15: the situation lines under an item's card. An impediment's situation reads
 * "4 occurrences · 50% recovered" (or "Not enough data" under MIN_DAYS answered
 * recoveries); a cue's reads "applied on 6 days". A situation the day never offered has
 * no row, and an item with no rows gets no lines.
 */
export function breakdownLines(rows: SituationRow[], itemId: string, kind: ItemKind): { name: string; text: string }[] {
  return rows
    .filter((r) => r.item_id === itemId && r.kind === kind)
    .map((r) => ({
      name: r.situation_name,
      text:
        kind === "cue"
          ? `applied on ${plural(r.occurrences, "day")}`
          : r.occurrences === 0
            ? "never showed up"
            : `${plural(r.occurrences, "occurrence")} · ${r.enough && r.rate !== null ? `${r.rate}% recovered` : "Not enough data"}`,
    }));
}

/**
 * The coverage line's denominator: the closed days that can be logged at all — closed,
 * not cancelled, positive target — which is `sprint_days_effective`'s definition. A
 * zero-target closed day is a real day (the result card counts it) but never a logged
 * one, so counting it here read "Logged 12 of 13" against a 13th that could not speak,
 * and disagreed with the Across page's "of 12" for the same sprint.
 */
export function effectiveClosedDays(days: { closed: boolean; cancelled: boolean; target: number }[]): number {
  return days.filter((d) => d.closed && !d.cancelled && d.target > 0).length;
}

/** "Logged 12 of 13 closed days · 1 unsure" — coverage over the days that could speak. */
export function coverageLine(logged: number, closed: number, unsure: number): string {
  const tail = unsure ? ` · ${unsure} unsure` : "";
  return `Logged ${logged} of ${plural(closed, "closed day")}${tail}`;
}
