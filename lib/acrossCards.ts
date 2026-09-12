import type { Grouped, Scope, SprintRef } from "@/lib/across";
import { areaName } from "@/lib/areas";
import type { CueRow, ImpactRow, RecoveryRow, SituationRow } from "@/lib/data";
import { formatIsoDate } from "@/lib/dates";
import type { InsightRow } from "@/components/insights/InsightCard";
import { breakdownLines, cueRows, impactRows, recoveryRows } from "@/lib/insightCards";

/**
 * Across sprints (F11): the grouped rows dressed for the shared insight card.
 *
 * Each row is the single-sprint view of whichever sprint the group quotes, plus two
 * cross-sprint additions and nothing else: how many sprints the item appeared in, and
 * the recurring verdict. The numbers themselves are never recomputed here — they are the
 * ones the postmortem for that sprint shows, so the two screens cannot disagree.
 */

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const short = (iso: string) => formatIsoDate(iso, { month: "short", day: "numeric" });

/**
 * " · 3 sprints · from Wealth · Aug 12 → Aug 25". The attribution is present only when a
 * sprint qualified, because it exists to say where the bars came from.
 */
function tag(sprints: number, from: SprintRef | null): string {
  const quoted = from ? ` · from ${areaName(from.area)} · ${short(from.start_date)} → ${short(from.end_date)}` : "";
  return ` · ${plural(sprints, "sprint")}${quoted}`;
}

/**
 * On the All-areas scope the row is prefixed with its Area. The same item used in two
 * areas is two rows by design, and two rows reading "Starting late" with no Area between
 * them is worse than either merging or splitting — the reader cannot tell which is which.
 */
function decorate<T>(built: InsightRow, group: Grouped<T>, scope: Scope): InsightRow {
  const area = scope === "all" ? `${areaName(group.area)} · ` : "";
  return {
    ...built,
    key: group.key,
    sub: `${area}${built.sub}${tag(group.sprints, group.from)}`,
    note: [built.note, group.recurring].filter(Boolean).join(" · ") || null,
  };
}

/**
 * Rows with a comparison first, thin rows last. `999` parks a thin row at the end in an
 * ascending sort, so the cue card negates its delta rather than sorting descending —
 * sorting descending would put the thin rows first, which is the opposite of the point.
 */
const rank = (delta: number | null, enough: boolean) => (enough && delta !== null ? delta : 999);

/** Worst first: the most damaging impediment leads. */
const bySeverity = (a: { row: { delta_pts: number | null; enough: boolean } }, b: { row: { delta_pts: number | null; enough: boolean } }) =>
  rank(a.row.delta_pts, a.row.enough) - rank(b.row.delta_pts, b.row.enough);

/** Best first: the most useful cue leads, thin rows still last. */
const byHelp = (a: { row: { delta_pts: number | null; enough: boolean } }, b: { row: { delta_pts: number | null; enough: boolean } }) =>
  helpRank(a.row.delta_pts, a.row.enough) - helpRank(b.row.delta_pts, b.row.enough);

const helpRank = (delta: number | null, enough: boolean) => (enough && delta !== null ? -delta : 999);

/**
 * F15: the situation lines for one grouped item — each situation's own quoted row, from
 * the groups that share the item and the Area. A situation group quotes its own newest
 * qualifying sprint, so its line can come from a different sprint than the card's bars;
 * that is the same rule every card follows, and the line does not restate the bars.
 */
function breakdownFor(situations: Grouped<SituationRow>[], itemId: string, area: string, kind: "cue" | "impediment"): InsightRow["breakdown"] {
  const rows = situations.filter((g) => g.area === area && g.row.item_id === itemId).map((g) => g.row);
  return breakdownLines(rows, itemId, kind);
}

export function acrossImpactRows(groups: Grouped<ImpactRow>[], scope: Scope, situations: Grouped<SituationRow>[] = []): InsightRow[] {
  return [...groups].sort(bySeverity).map((g) => ({ ...decorate(impactRows([g.row])[0], g, scope), breakdown: breakdownFor(situations, g.row.item_id, g.area, "impediment") }));
}

export function acrossCueRows(groups: Grouped<CueRow>[], scope: Scope, situations: Grouped<SituationRow>[] = []): InsightRow[] {
  return [...groups].sort(byHelp).map((g) => ({ ...decorate(cueRows([g.row])[0], g, scope), breakdown: breakdownFor(situations, g.row.item_id, g.area, "cue") }));
}

export function acrossRecoveryRows(groups: Grouped<RecoveryRow>[], scope: Scope): InsightRow[] {
  return groups.flatMap((g) => {
    const built = recoveryRows([g.row]);
    return built.length ? [decorate(built[0], g, scope)] : [];
  });
}

/** The deltas that earn a sentence in the Suggested kit. */
const HURT = -10;
const HELPED = 10;
const RECOVERS_LOW = 50;

export type KitInput = {
  impact: Grouped<ImpactRow>[];
  recovery: Grouped<RecoveryRow>[];
  cues: Grouped<CueRow>[];
  closedDays: number;
};

/**
 * Suggested kit for the next sprint: at most three sentences, each one a restatement of
 * a row the reader can see above it. No sentence comes from a row whose sample is short —
 * advice from two days would be the one thing this page must not do.
 */
export function suggestedKit({ impact, recovery, cues, closedDays }: KitInput): string {
  if (closedDays === 0) return "Nothing to suggest yet — close a few days first.";

  const worst = [...impact].sort(bySeverity).find((g) => g.row.enough && g.row.delta_pts !== null && g.row.delta_pts <= HURT);
  // The recovery sentence names the same impediment as the impact sentence when that
  // row qualifies (same item, same Area), else the first qualifying recovery row. The
  // rate is the row's own: recovered over answered recoveries, F15.
  const rc =
    (worst && recovery.find((g) => g.row.enough && g.row.rate !== null && g.row.item_id === worst.row.item_id && g.area === worst.area)) ??
    recovery.find((g) => g.row.enough && g.row.rate !== null);
  const best = [...cues].sort(byHelp).find((g) => g.row.enough && g.row.delta_pts !== null && g.row.delta_pts >= HELPED);

  if (!worst && !rc && !best) return "Not enough logged days yet. Each comparison needs 3 days on each side.";

  const sentences = [
    worst ? `Keep ${worst.row.name} as the highest impediment; days it shows up run ${Math.abs(worst.row.delta_pts as number)} points lower.` : "",
    rc
      ? (rc.row.rate as number) < RECOVERS_LOW
        ? `You recover from ${rc.row.name} only ${rc.row.rate}% of the time — make the THEN smaller.`
        : `You recover from ${rc.row.name} ${rc.row.rate}% of the time.`
      : "",
    best ? `Keep ${best.row.name} — +${best.row.delta_pts} points on the days it's used.` : "",
  ];

  return sentences.filter(Boolean).join(" ");
}

/**
 * How to read this. The v8 README's version describes the on-target rate; D4 replaced the
 * metric with median attainment, so the copy is rewritten around it. It states both
 * thresholds, where the bars came from, and that none of this is a cause.
 */
export const HOW_TO_READ =
  "Each card compares median daily attainment (actual ÷ target) on days with and without the item, using only closed days " +
  "where that question was answered. Unsure days count toward coverage, not the comparison. A comparison needs 3 days on " +
  "each side; recovery and each situation line need 3 answered recoveries. The bars come from the most recent sprint that " +
  "clears that bar — the note says in how many sprints the pattern repeated. Three days is not reliability, and none of " +
  "this shows a cause.";

/**
 * Coverage over a history: each sprint's logged and unsure day counts are the max over
 * its items — the same reading the postmortem takes for one sprint (a row exists per item
 * per logged day, so the max is that sprint's logged days) — and those per-sprint counts
 * are summed. Counting days is not comparing them; no comparison is pooled here.
 */
export function coverageAcross(perSprint: { logged_days: number; unsure_days: number }[][]): { logged: number; unsure: number } {
  return perSprint.reduce(
    (acc, rows) => ({
      logged: acc.logged + Math.max(0, ...rows.map((r) => r.logged_days)),
      unsure: acc.unsure + Math.max(0, ...rows.map((r) => r.unsure_days)),
    }),
    { logged: 0, unsure: 0 },
  );
}

/** "3 sprints · 34 closed days · 19 on target (56%)" — the header's evidence line. */
export function evidenceLine(sprints: number, closedDays: number, onTarget: number): string {
  const share = closedDays ? ` (${Math.round((onTarget / closedDays) * 100)}%)` : "";
  return `${plural(sprints, "sprint")} · ${closedDays} closed days · ${onTarget} on target${share}`;
}
