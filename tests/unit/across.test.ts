import { describe, expect, it } from "vitest";
import { groupCues, groupFollow, groupImpact, groupRecovery, RECUR_MIN, type SprintInsights, type SprintRef } from "@/lib/across";
import { acrossCueRows, acrossFollowRows, acrossImpactRows, acrossRecoveryRows, coverageAcross, evidenceLine, HOW_TO_READ, suggestedKit } from "@/lib/acrossCards";
import type { CueRow, FinishedSprint, FollowThroughRow, ImpactRow, RecoveryRow, ReviewSummary } from "@/lib/data";
import { loadReviewStats, mergeMeasures, needsReview, onePerItem } from "@/lib/data";

/**
 * Across sprints (F11). Every fixture here is a hand-built set of per-sprint rows — the
 * shape F10's SQL returns — so these tests fail when the grouping, the chosen sprint, the
 * recurring arithmetic or a sentence changes, and not when the SQL is re-tuned.
 */

const AUG: SprintRef = { id: "s-aug", area: "wealth", start_date: "2026-08-12", end_date: "2026-08-25" };
const JUL: SprintRef = { id: "s-jul", area: "wealth", start_date: "2026-07-29", end_date: "2026-08-11" };
const JUN: SprintRef = { id: "s-jun", area: "health", start_date: "2026-07-01", end_date: "2026-07-14" };

const impact = (over: Partial<ImpactRow> = {}): ImpactRow => ({
  item_id: "i1",
  name: "Starting late",
  is_highest: true,
  present_days: 5,
  absent_days: 5,
  logged_days: 10,
  unsure_days: 0,
  median_present: 0.62,
  median_absent: 0.93,
  delta_pts: -31,
  enough: true,
  felt_a_lot: 0,
  felt_some: 0,
  felt_nothing: 0,
  ...over,
});

const cue = (over: Partial<CueRow> = {}): CueRow => ({
  item_id: "c1",
  name: "First hour is outreach",
  is_focus: true,
  used_days: 5,
  unused_days: 5,
  logged_days: 10,
  unsure_days: 0,
  median_used: 1.04,
  median_unused: 0.82,
  delta_pts: 22,
  enough: true,
  ...over,
});

const follow = (over: Partial<FollowThroughRow> = {}): FollowThroughRow => ({
  item_id: "i1",
  name: "Starting late",
  proof_then: "set a 10-minute timer",
  occurrences: 5,
  answered: 4,
  ran: 3,
  didnt: 1,
  partially: 0,
  unsure: 1,
  rate: 75,
  enough: true,
  ...over,
});

const recovery = (over: Partial<RecoveryRow> = {}): RecoveryRow => ({
  item_id: "i1",
  name: "Starting late",
  proof_recover: "first task done before 10am",
  with_response: 3,
  with_recovered: 2,
  without_response: 1,
  without_recovered: 0,
  answered: 4,
  rate: 50,
  enough: true,
  median_recovered: 0.96,
  median_not: 0.58,
  outcome_enough: true,
  ...over,
});

/** A history entry: only the rows a test cares about need to be present. */
const sprintOf = (sprint: SprintRef, over: Partial<Omit<SprintInsights, "sprint">> = {}): SprintInsights => ({
  sprint,
  impact: [],
  follow: [],
  recovery: [],
  cues: [],
  ...over,
});

describe("across: which sprint the bars come from", () => {
  it("quotes the most recent sprint that clears the threshold", () => {
    const history = [sprintOf(AUG, { impact: [impact({ enough: false, delta_pts: null, present_days: 2 })] }), sprintOf(JUL, { impact: [impact({ delta_pts: -17 })] })];
    const [group] = groupImpact(history, "wealth");
    expect(group.from?.id).toBe(JUL.id);
    expect(group.row.delta_pts).toBe(-17);
    expect(group.sprints).toBe(2);
  });

  it("prefers the newer of two qualifying sprints", () => {
    const history = [sprintOf(AUG, { impact: [impact({ delta_pts: -31 })] }), sprintOf(JUL, { impact: [impact({ delta_pts: -17 })] })];
    const [group] = groupImpact(history, "wealth");
    expect(group.from?.id).toBe(AUG.id);
    expect(group.row.delta_pts).toBe(-31);
  });

  it("names no sprint when none qualifies, so nothing is attributed that was not shown", () => {
    const thin = impact({ enough: false, delta_pts: null, present_days: 2, absent_days: 2 });
    const [group] = groupImpact([sprintOf(AUG, { impact: [thin] }), sprintOf(JUL, { impact: [thin] })], "wealth");
    expect(group.from).toBeNull();
    expect(group.row.enough).toBe(false);
  });

  it("the row's sub carries the sprint count and the attribution only when there is one", () => {
    const quoted = acrossImpactRows(groupImpact([sprintOf(AUG, { impact: [impact()] })], "wealth"), "wealth");
    expect(quoted[0].sub).toBe("Present on 5 of 10 logged days · 1 sprint · from Wealth · Aug 12 → Aug 25");

    const unquoted = acrossImpactRows(groupImpact([sprintOf(AUG, { impact: [impact({ enough: false, delta_pts: null })] })], "wealth"), "wealth");
    expect(unquoted[0].sub).toBe("Present on 5 of 10 logged days · 1 sprint");
    expect(unquoted[0].sub).not.toContain("from");
  });
});

describe("across: what the visual check on real data caught", () => {
  it("labels each row with its Area on All areas, so two rows of one name are distinguishable", () => {
    const history = [sprintOf(AUG, { impact: [impact()] }), sprintOf(JUN, { impact: [impact()] })];
    const rows = acrossImpactRows(groupImpact(history, "all"), "all");
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.sub.split(" · ")[0])).toEqual(["Wealth", "Health"]);
    // Scoped, the Area is the page's own heading — prefixing every row with it is noise.
    // (The sub can still end with "from Wealth · dates": that is the attribution, not the
    // label, so the check is on the prefix.)
    expect(acrossImpactRows(groupImpact(history, "wealth"), "wealth")[0].sub.startsWith("Wealth · ")).toBe(false);
  });

  it("puts the most useful cue first and the thin rows last", () => {
    const history = [
      sprintOf(AUG, {
        cues: [
          cue({ item_id: "thin", name: "Thin cue", enough: false, delta_pts: null }),
          cue({ item_id: "small", name: "Small help", delta_pts: 4 }),
          cue({ item_id: "big", name: "Big help", delta_pts: 40 }),
        ],
      }),
    ];
    expect(acrossCueRows(groupCues(history, "wealth"), "wealth").map((r) => r.name)).toEqual(["Big help", "Small help", "Thin cue"]);
  });

  it("puts the most damaging impediment first and the thin rows last", () => {
    const history = [
      sprintOf(AUG, {
        impact: [
          impact({ item_id: "thin", name: "Thin imp", enough: false, delta_pts: null }),
          impact({ item_id: "mild", name: "Mild", delta_pts: -4 }),
          impact({ item_id: "bad", name: "Worst", delta_pts: -40 }),
        ],
      }),
    ];
    expect(acrossImpactRows(groupImpact(history, "wealth"), "wealth").map((r) => r.name)).toEqual(["Worst", "Mild", "Thin imp"]);
  });

  it("reads recency from when the sprint ran, not from the order the history arrived in", () => {
    // JUL ran first but arrives first in the array; AUG ran later and must be quoted.
    const history = [sprintOf(JUL, { impact: [impact({ delta_pts: -17 })] }), sprintOf(AUG, { impact: [impact({ delta_pts: -31 })] })];
    const [group] = groupImpact(history, "wealth");
    expect(group.from?.id).toBe(AUG.id);
    expect(group.row.delta_pts).toBe(-31);
  });
});

describe("across: grouping keys", () => {
  it("the same item in two areas is two rows on All areas and one when scoped", () => {
    const history = [sprintOf(AUG, { impact: [impact()] }), sprintOf(JUN, { impact: [impact()] })];
    expect(groupImpact(history, "all")).toHaveLength(2);
    expect(groupImpact(history, "wealth")).toHaveLength(1);
  });

  it("a rewritten response starts its own row; an unchanged one merges", () => {
    const rewritten = [sprintOf(AUG, { follow: [follow({ proof_then: "phone in the drawer" })] }), sprintOf(JUL, { follow: [follow({ proof_then: "set a 10-minute timer" })] })];
    expect(groupFollow(rewritten, "wealth")).toHaveLength(2);

    const same = [sprintOf(AUG, { follow: [follow()] }), sprintOf(JUL, { follow: [follow()] })];
    const merged = groupFollow(same, "wealth");
    expect(merged).toHaveLength(1);
    expect(merged[0].sprints).toBe(2);
  });

  it("a highest impediment that never occurred is not a row", () => {
    expect(groupFollow([sprintOf(AUG, { follow: [follow({ occurrences: 0, answered: 0, ran: 0, didnt: 0 })] })], "wealth")).toHaveLength(0);
  });
});

describe("across: the recurring note", () => {
  const votes = (deltas: { present: number; absent: number; mp: number; ma: number }[]) =>
    groupImpact(
      deltas.map((d, i) =>
        sprintOf(
          { ...AUG, id: `s${i}` },
          { impact: [impact({ present_days: d.present, absent_days: d.absent, median_present: d.mp, median_absent: d.ma, enough: d.present >= 3 && d.absent >= 3 })] },
        ),
      ),
      "wealth",
    )[0].recurring;

  it("says recurring only when every voting sprint agrees and there are at least two", () => {
    const both = { present: 3, absent: 3, mp: 0.6, ma: 0.9 };
    expect(votes([both, both])).toBe("Hurt in 2 of 2 sprints with enough days — recurring");
    expect(votes([both])).toBe("Hurt in 1 of 1 sprint with enough days");
    expect(votes([both, both, { present: 3, absent: 3, mp: 0.9, ma: 0.6 }])).toBe("Hurt in 2 of 3 sprints with enough days");
  });

  it("a sprint votes at two days a side, below the three a shown comparison needs", () => {
    expect(RECUR_MIN).toBe(2);
    const twoEach = { present: RECUR_MIN, absent: RECUR_MIN, mp: 0.6, ma: 0.9 };
    expect(votes([twoEach])).toBe("Hurt in 1 of 1 sprint with enough days");
    expect(votes([{ present: 1, absent: 9, mp: 0.6, ma: 0.9 }])).toBe("In 1 sprint · no single sprint has enough days yet");
  });

  it("a cue that helps reads Helped, and the direction follows the delta's sign", () => {
    const helped = groupCues([sprintOf(AUG, { cues: [cue()] }), sprintOf(JUL, { cues: [cue()] })], "wealth");
    expect(helped[0].recurring).toBe("Helped in 2 of 2 sprints with enough days — recurring");

    const mixed = groupCues([sprintOf(AUG, { cues: [cue()] }), sprintOf(JUL, { cues: [cue({ median_used: 0.7, median_unused: 0.9 })] })], "wealth");
    expect(mixed[0].recurring).toBe("Helped in 1 of 2 sprints with enough days");
  });

  it("the tri-state note counts sprints by the card's own denominator", () => {
    // answered = 4 (yes|no|partially), ran = 3 → over half in both sprints.
    const ran = groupFollow([sprintOf(AUG, { follow: [follow()] }), sprintOf(JUL, { follow: [follow({ proof_then: "set a 10-minute timer", ran: 1, didnt: 3 })] })], "wealth");
    expect(ran[0].recurring).toBe("Ran at least half the time in 1 of 2 sprints");

    const thin = groupFollow([sprintOf(AUG, { follow: [follow({ answered: 1, ran: 1, didnt: 0, enough: false, rate: null })] })], "wealth");
    expect(thin[0].recurring).toBeNull();
  });

  it("recovery counts a sprint by its recovered share of answered", () => {
    const rows = groupRecovery([sprintOf(AUG, { recovery: [recovery()] })], "wealth");
    expect(rows[0].recurring).toBe("Recovered at least half the time in 1 of 1 sprint");
  });

  it("the recovery note votes with the rate the tail shows, unsure-response days included", () => {
    // Three occurrences: response unsure / recovered yes, twice; response yes / recovered no.
    // The SQL's rate is 2 of 3 = 67%; neither `yes` sits under a with/without bucket.
    const row = recovery({ answered: 3, rate: 67, enough: true, with_response: 1, with_recovered: 0, without_response: 0, without_recovered: 0 });
    const [built] = acrossRecoveryRows(groupRecovery([sprintOf(AUG, { recovery: [row] })], "wealth"), "wealth");
    expect(built.tail).toBe("67% recovered");
    expect(built.note).toContain("Recovered at least half the time in 1 of 1 sprint");
  });

  it("recovery does not vote below the bar the card shows a rate at", () => {
    const thin = recovery({ answered: 2, rate: null, enough: false, with_response: 2, with_recovered: 2 });
    const rows = groupRecovery([sprintOf(AUG, { recovery: [thin] })], "wealth");
    expect(rows[0].recurring).toBeNull();
  });

  it("the recurring line is appended to the row's note, not replacing it", () => {
    const [row] = acrossFollowRows(groupFollow([sprintOf(AUG, { follow: [follow()] })], "wealth"), "wealth");
    expect(row.note).toBe("1 unsure · Ran at least half the time in 1 of 1 sprint");
  });
});

describe("across: the suggested kit", () => {
  const kit = (over: Parameters<typeof suggestedKit>[0]) => suggestedKit(over);
  const empty = { impact: [], follow: [], recovery: [], cues: [] };

  it("asks for days before it suggests anything", () => {
    expect(kit({ ...empty, closedDays: 0 })).toBe("Nothing to suggest yet — close a few days first.");
  });

  it("says what is missing when no row clears the threshold", () => {
    const thin = groupImpact([sprintOf(AUG, { impact: [impact({ enough: false, delta_pts: null })] })], "wealth");
    expect(kit({ ...empty, impact: thin, closedDays: 6 })).toBe("Not enough logged days yet. Each comparison needs 3 days on each side.");
  });

  it("names the worst impediment, the response rate and the best cue", () => {
    const sentence = kit({
      impact: groupImpact([sprintOf(AUG, { impact: [impact()] })], "wealth"),
      follow: groupFollow([sprintOf(AUG, { follow: [follow({ rate: 75 })] })], "wealth"),
      recovery: groupRecovery([sprintOf(AUG, { recovery: [recovery({ rate: 60 })] })], "wealth"),
      cues: groupCues([sprintOf(AUG, { cues: [cue()] })], "wealth"),
      closedDays: 12,
    });
    expect(sentence).toBe(
      "Keep Starting late as the highest impediment; days it shows up run 31 points lower. " +
        "The response for Starting late runs 75% of the time and recovers 67% of the times it ran. " +
        "Keep First hour is outreach — +22 points on the days it's used.",
    );
  });

  it("quotes recovery on the occurrences the response ran, not the row's overall rate", () => {
    // Recovered 0 of 3 times the response ran and 3 of 3 times it did not: the row's rate
    // is 50, and the sentence must not attribute that to the response (FIX_LOG 2026-09-11).
    const never = recovery({ with_response: 3, with_recovered: 0, without_response: 3, without_recovered: 3, answered: 6, rate: 50 });
    const sentence = kit({
      ...empty,
      follow: groupFollow([sprintOf(AUG, { follow: [follow({ rate: 100 })] })], "wealth"),
      recovery: groupRecovery([sprintOf(AUG, { recovery: [never] })], "wealth"),
      closedDays: 12,
    });
    expect(sentence).toBe("The response for Starting late runs 100% of the time and recovers 0% of the times it ran.");
  });

  it("quotes a recovery rate only from the sprint the follow-through rate came from", () => {
    // One response in two sprints. The newest sprint's follow-through qualifies but its
    // recovery is thin; the older sprint's recovery qualifies. The two groups quote two
    // sprints, and the older figure must not be attached to the newer rate (FIX_LOG 2026-09-11).
    const newest = sprintOf(AUG, { follow: [follow({ rate: 100 })], recovery: [recovery({ answered: 2, rate: null, enough: false })] });
    const older = sprintOf(JUL, { follow: [follow({ rate: 25 })], recovery: [recovery({ rate: 50 })] });
    const sentence = kit({ ...empty, follow: groupFollow([older, newest], "wealth"), recovery: groupRecovery([older, newest], "wealth"), closedDays: 20 });
    expect(sentence).toBe("The response for Starting late runs 100% of the time.");
  });

  it("stays silent on recovery when the response ran fewer than three times, even with enough answers", () => {
    const ranTwice = recovery({ with_response: 2, with_recovered: 2, without_response: 2, without_recovered: 1, answered: 4, rate: 75 });
    const sentence = kit({
      ...empty,
      follow: groupFollow([sprintOf(AUG, { follow: [follow()] })], "wealth"),
      recovery: groupRecovery([sprintOf(AUG, { recovery: [ranTwice] })], "wealth"),
      closedDays: 12,
    });
    expect(sentence).toBe("The response for Starting late runs 75% of the time.");
  });

  it("quotes a recovery rate only for the response it just named", () => {
    // Newest sprint: highest A, follow-through enough, recovery thin. Older sprint: highest
    // B with a qualifying 60% recovery. B's figure must not be attached to A's sentence.
    const newest = sprintOf(AUG, { follow: [follow()], recovery: [recovery({ answered: 2, rate: null, enough: false })] });
    const older = sprintOf(JUL, {
      follow: [follow({ item_id: "i2", name: "Doomscrolling", rate: 50 })],
      recovery: [recovery({ item_id: "i2", name: "Doomscrolling", rate: 60 })],
    });
    const sentence = kit({ ...empty, follow: groupFollow([older, newest], "wealth"), recovery: groupRecovery([older, newest], "wealth"), closedDays: 20 });
    expect(sentence).toBe("The response for Starting late runs 75% of the time.");
  });

  it("on All areas the same item in another Area is a different response", () => {
    const wealth = sprintOf(AUG, { follow: [follow()] });
    const health = sprintOf(JUN, { recovery: [recovery({ rate: 60 })] });
    const sentence = kit({ ...empty, follow: groupFollow([wealth, health], "all"), recovery: groupRecovery([wealth, health], "all"), closedDays: 20 });
    expect(sentence).toBe("The response for Starting late runs 75% of the time.");
  });

  it("tells a low follow-through rate to make the THEN smaller", () => {
    const sentence = kit({ ...empty, follow: groupFollow([sprintOf(AUG, { follow: [follow({ rate: 33 })] })], "wealth"), closedDays: 12 });
    expect(sentence).toBe("The response for Starting late ran on only 33% of occurrences — make the THEN smaller.");
  });

  it("never speaks from a row whose sample is short", () => {
    const shortImpact = groupImpact([sprintOf(AUG, { impact: [impact({ enough: false, delta_pts: -80 })] })], "wealth");
    const shortCue = groupCues([sprintOf(AUG, { cues: [cue({ enough: false, delta_pts: 90 })] })], "wealth");
    expect(kit({ ...empty, impact: shortImpact, cues: shortCue, closedDays: 9 })).toBe("Not enough logged days yet. Each comparison needs 3 days on each side.");
  });

  it("ignores an impediment that hurt by less than ten points", () => {
    const mild = groupImpact([sprintOf(AUG, { impact: [impact({ delta_pts: -4 })] })], "wealth");
    expect(kit({ ...empty, impact: mild, closedDays: 12 })).toBe("Not enough logged days yet. Each comparison needs 3 days on each side.");
  });
});

describe("the Insights rows carry the measurement", () => {
  const finished = (id: string, over: Partial<FinishedSprint> = {}): FinishedSprint => ({
    id,
    area: "wealth",
    outcome: `outcome ${id}`,
    status: "completed",
    amount: 800_000,
    closedDays: 14,
    start_date: "2026-08-12",
    end_date: "2026-08-25",
    reviewedAt: null,
    ...over,
  });

  const summary = (over: Partial<ReviewSummary> = {}): ReviewSummary => ({
    total: 1000,
    goal: 1000,
    pct: 100,
    met: true,
    closed_days: 14,
    missed_days: 0,
    cancelled_days: 0,
    best_streak: 14,
    status: "completed",
    ...over,
  });

  it("gives each sprint its own numbers, keyed by id and not by position", () => {
    const rows = mergeMeasures(
      [finished("a"), finished("b")],
      new Map([
        ["b", summary({ pct: 78, met: false })],
        ["a", summary({ pct: 112, met: true })],
      ]),
    );
    expect(rows.map((r) => [r.id, r.pct, r.met])).toEqual([
      ["a", 112, true],
      ["b", 78, false],
    ]);
  });

  it("reads Met at exactly the goal and Under one short of it", () => {
    const [met] = mergeMeasures([finished("a")], new Map([["a", summary({ total: 1000, goal: 1000, pct: 100, met: true })]]));
    expect([met.met, met.pct]).toEqual([true, 100]);

    const [under] = mergeMeasures([finished("a")], new Map([["a", summary({ total: 999, goal: 1000, pct: 100, met: false })]]));
    expect(under.met).toBe(false);
  });

  it("renders a sprint with no summary as Under, 0%, rather than failing the sidebar", () => {
    const [row] = mergeMeasures([finished("a")], new Map([["a", null]]));
    expect([row.met, row.pct]).toEqual([false, 0]);
  });
});

describe("across: the header and the explanation", () => {
  it("counts sprints, closed days and days on target with a share", () => {
    expect(evidenceLine(3, 34, 19)).toBe("3 sprints · 34 closed days · 19 on target (56%)");
    expect(evidenceLine(1, 0, 0)).toBe("1 sprint · 0 closed days · 0 on target");
  });

  it("sums each sprint's logged and unsure days from its own widest item", () => {
    const history = [
      [impact({ logged_days: 10, unsure_days: 1 }), impact({ item_id: "i2", logged_days: 8, unsure_days: 0 })],
      [impact({ logged_days: 6, unsure_days: 2 })],
    ];
    expect(coverageAcross(history)).toEqual({ logged: 16, unsure: 3 });
    expect(coverageAcross([[]])).toEqual({ logged: 0, unsure: 0 });
  });

  it("explains the metric D4 chose, and claims no cause", () => {
    expect(HOW_TO_READ).toContain("median daily attainment");
    expect(HOW_TO_READ).not.toContain("on-target rate");
    expect(HOW_TO_READ).not.toContain("caused");
    expect(HOW_TO_READ).toContain("3 days on each side");
    expect(HOW_TO_READ).toContain("most recent sprint that clears that bar");
  });

  it("leaves the postmortem rail's stats read alone — no scope was threaded through it", () => {
    expect(loadReviewStats.length).toBe(1);
  });
});

describe("which finished sprint blocks its Area (rule 26 since 0017)", () => {
  const sprint = (over: Partial<FinishedSprint>): FinishedSprint => ({
    id: "s",
    area: "wealth",
    outcome: "o",
    status: "ended_early",
    start_date: "2026-08-01",
    end_date: "2026-08-14",
    amount: 1,
    closedDays: 3,
    reviewedAt: null,
    ...over,
  });

  it("an unreviewed sprint blocks only if it closed a day", () => {
    expect(needsReview(sprint({}))).toBe(true);
    expect(needsReview(sprint({ closedDays: 0 }))).toBe(false);
    expect(needsReview(sprint({ reviewedAt: "2026-08-15T00:00:00Z" }))).toBe(false);
  });
});

describe("the postmortem's members are one row per item", () => {
  const item = (id: string, over: Partial<{ is_highest: boolean; is_focus: boolean }> = {}) => ({ id, name: id, ...over });

  it("collapses a member removed and added back into one row, keeping any flag either row carried", () => {
    const rows = onePerItem([item("a", { is_highest: false }), item("b"), item("a", { is_highest: true })]);
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
    expect(rows[0].is_highest).toBe(true);
  });

  it("leaves distinct items alone", () => {
    expect(onePerItem([item("a"), item("b")]).length).toBe(2);
  });
});
