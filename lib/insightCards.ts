import type { InsightRow } from "@/components/insights/InsightCard";
import type { CueRow, FollowThroughRow, ImpactRow, RecoveryRow } from "@/lib/data";

/**
 * The four insight cards' copy and bar geometry, kept out of the components so the
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
  return rows.map((r) => {
    const felt = [
      r.felt_a_lot ? `${r.felt_a_lot} a lot` : "",
      r.felt_some ? `${r.felt_some} some` : "",
      r.felt_nothing ? `${r.felt_nothing} nothing` : "",
    ].filter(Boolean);
    const short = r.enough ? "" : `Needs ${MIN_DAYS} days with and ${MIN_DAYS} without · has ${r.present_days} and ${r.absent_days}`;
    const note = [short, felt.length ? `Felt: ${felt.join(", ")}` : ""].filter(Boolean).join(" · ");
    return {
      key: r.item_id,
      name: r.name,
      tag: r.is_highest ? "HIGHEST" : null,
      tail: pts(r.delta_pts),
      tailTone: r.delta_pts !== null && r.delta_pts <= -10 ? "bad" : undefined,
      sub: `Present on ${r.present_days} of ${plural(r.logged_days, "logged day")}`,
      bars: [
        { value: attainment(r.median_present), label: "attainment when present", pct: width(r.median_present), tone: "bad" as const },
        { value: attainment(r.median_absent), label: "attainment when absent", pct: width(r.median_absent) },
      ],
      note: note || null,
      warn: !r.enough,
    };
  });
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

export function followThroughRows(rows: FollowThroughRow[]): InsightRow[] {
  return rows
    .filter((r) => r.occurrences > 0)
    .map((r) => {
      const extra = [r.partially ? `${r.partially} partially` : "", r.unsure ? `${r.unsure} unsure` : ""].filter(Boolean);
      const short = r.enough ? "" : `Needs ${MIN_DAYS} answered occurrences · has ${r.answered}`;
      return {
        key: r.item_id,
        name: r.name,
        tail: r.rate === null ? "Not enough data" : `${r.rate}% ran`,
        tailTone: r.rate === null ? undefined : r.rate >= 70 ? ("good" as const) : r.rate < 40 ? ("bad" as const) : undefined,
        sub: r.proof_then ? `THEN ${r.proof_then}` : "No THEN was recorded for this sprint",
        bars: [
          { value: String(r.ran), label: "ran the response", pct: r.answered ? (r.ran / r.answered) * 100 : 0, tone: "good" as const },
          { value: String(r.didnt), label: "didn't run it", pct: r.answered ? (r.didnt / r.answered) * 100 : 0, tone: "bad" as const },
        ],
        note: [short, ...extra].filter(Boolean).join(" · ") || null,
        warn: !r.enough,
      };
    });
}

export function recoveryRows(rows: RecoveryRow[]): InsightRow[] {
  return rows
    .filter((r) => r.answered > 0 || r.with_response > 0 || r.without_response > 0)
    .map((r) => {
      const short = r.enough ? "" : `Needs ${MIN_DAYS} answered responses · has ${r.answered}`;
      const outcome = r.outcome_enough
        ? `Attainment ${attainment(r.median_recovered)} when recovered vs ${attainment(r.median_not)} when not`
        : "";
      return {
        key: r.item_id,
        name: r.name,
        tail: r.rate === null ? "Not enough data" : `${r.rate}% recovered`,
        tailTone: r.rate === null ? undefined : r.rate >= 70 ? ("good" as const) : r.rate < 40 ? ("bad" as const) : undefined,
        sub: r.proof_recover ? `Recovered when ${r.proof_recover}` : "No recovery criterion was recorded for this sprint",
        bars: [
          {
            value: `${r.with_recovered} of ${r.with_response}`,
            label: "recovered with the response",
            pct: r.with_response ? (r.with_recovered / r.with_response) * 100 : 0,
            tone: "good" as const,
          },
          {
            value: `${r.without_recovered} of ${r.without_response}`,
            label: "recovered without it",
            pct: r.without_response ? (r.without_recovered / r.without_response) * 100 : 0,
          },
        ],
        note: [short, outcome].filter(Boolean).join(" · ") || null,
        warn: !r.enough,
      };
    });
}

/** "Logged 12 of 13 closed days · 1 unsure" — coverage over the days that could speak. */
export function coverageLine(logged: number, closed: number, unsure: number): string {
  const tail = unsure ? ` · ${unsure} unsure` : "";
  return `Logged ${logged} of ${plural(closed, "closed day")}${tail}`;
}
