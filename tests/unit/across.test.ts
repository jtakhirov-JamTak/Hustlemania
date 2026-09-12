import { describe, expect, it } from "vitest";
import { groupCues, groupImpact, groupRecovery, groupSituations, RECUR_MIN, type SprintInsights, type SprintRef } from "@/lib/across";
import { acrossCueRows, acrossImpactRows, acrossRecoveryRows, coverageAcross, evidenceLine, HOW_TO_READ, suggestedKit } from "@/lib/acrossCards";
import type { CueRow, FinishedSprint, ImpactRow, RecoveryRow, ReviewSummary, SituationRow } from "@/lib/data";
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

/** F15: recovery per impediment — the recovered share of the situation occurrences that were answered. */
const recovery = (over: Partial<RecoveryRow> = {}): RecoveryRow => ({
  item_id: "i1",
  name: "Starting late",
  proof_then: "set a 10-minute timer",
  proof_recover: "first task done before 10am",
  is_highest: true,
  occurrences: 5,
  verdict_occurrences: 5,
  answered: 4,
  recovered: 3,
  didnt: 1,
  rate: 75,
  enough: true,
  ...over,
});

const situation = (over: Partial<SituationRow> = {}): SituationRow => ({
  kind: "impediment",
  item_id: "i1",
  item_name: "Starting late",
  situation_id: "st1",
  situation_name: "Monday standup",
  occurrences: 4,
  asked_days: 10,
  recovered_yes: 2,
  recovered_answered: 4,
  rate: 50,
  enough: true,
  ...over,
});

/** A history entry: only the rows a test cares about need to be present. */
const sprintOf = (sprint: SprintRef, over: Partial<Omit<SprintInsights, "sprint">> = {}): SprintInsights => ({
  sprint,
  impact: [],
  recovery: [],
  situations: [],
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

  it("a rewritten THEN or RECOVERED WHEN starts its own recovery row; an unchanged one merges", () => {
    const rewrittenThen = [sprintOf(AUG, { recovery: [recovery({ proof_then: "phone in the drawer" })] }), sprintOf(JUL, { recovery: [recovery()] })];
    expect(groupRecovery(rewrittenThen, "wealth")).toHaveLength(2);
    const rewrittenRecover = [sprintOf(AUG, { recovery: [recovery({ proof_recover: "back within five" })] }), sprintOf(JUL, { recovery: [recovery()] })];
    expect(groupRecovery(rewrittenRecover, "wealth")).toHaveLength(2);

    const same = [sprintOf(AUG, { recovery: [recovery()] }), sprintOf(JUL, { recovery: [recovery()] })];
    const merged = groupRecovery(same, "wealth");
    expect(merged).toHaveLength(1);
    expect(merged[0].sprints).toBe(2);
  });

  it("an impediment that never showed up is not a recovery row", () => {
    expect(groupRecovery([sprintOf(AUG, { recovery: [recovery({ occurrences: 0, verdict_occurrences: 0, answered: 0, recovered: 0, didnt: 0, rate: null, enough: false })] })], "wealth")).toHaveLength(0);
  });

  it("a situation is the same situation whatever the response text was: one group per (item, situation)", () => {
    const history = [
      sprintOf(AUG, { situations: [situation(), situation({ situation_id: "st2", situation_name: "Late night", occurrences: 2, recovered_answered: 2, rate: null, enough: false })] }),
      sprintOf(JUL, { situations: [situation({ occurrences: 3, recovered_yes: 3, recovered_answered: 3, rate: 100 })] }),
    ];
    const groups = groupSituations(history, "wealth");
    expect(groups.map((g) => [g.row.situation_name, g.sprints])).toEqual([
      ["Monday standup", 2],
      ["Late night", 1],
    ]);
    // The newest qualifying sprint is quoted; a thin group names none.
    expect(groups[0].from?.id).toBe(AUG.id);
    expect(groups[0].row.rate).toBe(50);
    expect(groups[1].from).toBeNull();
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

  it("recovery counts a sprint by its recovered share of answered, the card's own numbers", () => {
    // 3 of 4 in August, 1 of 4 in July: one sprint over half.
    const rows = groupRecovery([sprintOf(AUG, { recovery: [recovery()] }), sprintOf(JUL, { recovery: [recovery({ recovered: 1, didnt: 3, rate: 25 })] })], "wealth");
    expect(rows[0].recurring).toBe("Recovered at least half the time in 1 of 2 sprints");
  });

  it("the recovery note votes with the rate the tail shows", () => {
    const row = recovery({ occurrences: 3, verdict_occurrences: 3, answered: 3, recovered: 2, didnt: 1, rate: 67 });
    const [built] = acrossRecoveryRows(groupRecovery([sprintOf(AUG, { recovery: [row] })], "wealth"), "wealth");
    expect(built.tail).toBe("67% recovered");
    expect(built.note).toContain("Recovered at least half the time in 1 of 1 sprint");
  });

  it("recovery does not vote below RECUR_MIN answered", () => {
    const thin = recovery({ answered: 1, recovered: 1, didnt: 0, rate: null, enough: false });
    const rows = groupRecovery([sprintOf(AUG, { recovery: [thin] })], "wealth");
    expect(rows[0].recurring).toBeNull();
  });

  it("the recurring line is appended to the row's note, not replacing it", () => {
    // Five occurrences, four answered: one was left blank, and the note keeps saying so.
    const [row] = acrossRecoveryRows(groupRecovery([sprintOf(AUG, { recovery: [recovery()] })], "wealth"), "wealth");
    expect(row.note).toBe("1 occurrence left blank · Recovered at least half the time in 1 of 1 sprint");
  });
});

describe("across: the situation lines", () => {
  it("attaches each item's situation lines from the groups that share the item and the Area", () => {
    const history = [
      sprintOf(AUG, {
        impact: [impact()],
        situations: [situation(), situation({ situation_id: "st2", situation_name: "Late night", occurrences: 2, recovered_answered: 2, rate: null, enough: false }), situation({ item_id: "i2", item_name: "Other", situation_id: "st9" })],
      }),
    ];
    const [row] = acrossImpactRows(groupImpact(history, "wealth"), "wealth", groupSituations(history, "wealth"));
    expect(row.breakdown).toEqual([
      { name: "Monday standup", text: "4 occurrences · 50% recovered" },
      { name: "Late night", text: "2 occurrences · Not enough data" },
    ]);
  });

  it("a cue's line counts the days it applied and needs no recovery", () => {
    const history = [sprintOf(AUG, { cues: [cue()], situations: [situation({ kind: "cue", item_id: "c1", item_name: "First hour is outreach", situation_id: "sc1", situation_name: "Scheduling", occurrences: 6, recovered_yes: 0, recovered_answered: 0, rate: null })] })];
    const [row] = acrossCueRows(groupCues(history, "wealth"), "wealth", groupSituations(history, "wealth"));
    expect(row.breakdown).toEqual([{ name: "Scheduling", text: "applied on 6 days" }]);
  });

  it("on All areas a situation line stays with its own Area's row", () => {
    const history = [sprintOf(AUG, { impact: [impact()], situations: [situation()] }), sprintOf(JUN, { impact: [impact()], situations: [] })];
    const rows = acrossImpactRows(groupImpact(history, "all"), "all", groupSituations(history, "all"));
    expect(rows.map((r) => r.breakdown?.length ?? 0)).toEqual([1, 0]);
  });
});

describe("across: the suggested kit", () => {
  const kit = (over: Parameters<typeof suggestedKit>[0]) => suggestedKit(over);
  const empty = { impact: [], recovery: [], cues: [] };

  it("asks for days before it suggests anything", () => {
    expect(kit({ ...empty, closedDays: 0 })).toBe("Nothing to suggest yet — close a few days first.");
  });

  it("says what is missing when no row clears the threshold", () => {
    const thin = groupImpact([sprintOf(AUG, { impact: [impact({ enough: false, delta_pts: null })] })], "wealth");
    expect(kit({ ...empty, impact: thin, closedDays: 6 })).toBe("Not enough logged days yet. Each comparison needs 3 days on each side.");
  });

  it("names the worst impediment, its recovery rate and the best cue", () => {
    const sentence = kit({
      impact: groupImpact([sprintOf(AUG, { impact: [impact()] })], "wealth"),
      recovery: groupRecovery([sprintOf(AUG, { recovery: [recovery({ rate: 60 })] })], "wealth"),
      cues: groupCues([sprintOf(AUG, { cues: [cue()] })], "wealth"),
      closedDays: 12,
    });
    expect(sentence).toBe(
      "Keep Starting late as the highest impediment; days it shows up run 31 points lower. " +
        "You recover from Starting late 60% of the time. " +
        "Keep First hour is outreach — +22 points on the days it's used.",
    );
  });

  it("quotes the recovery rate of the impediment it just named, not the best rate on the page", () => {
    const sentence = kit({
      ...empty,
      impact: groupImpact([sprintOf(AUG, { impact: [impact()] })], "wealth"),
      recovery: groupRecovery([sprintOf(AUG, { recovery: [recovery({ item_id: "i2", name: "Doomscrolling", rate: 90 }), recovery({ rate: 40 })] })], "wealth"),
      closedDays: 12,
    });
    expect(sentence).toBe("Keep Starting late as the highest impediment; days it shows up run 31 points lower. You recover from Starting late only 40% of the time — make the THEN smaller.");
  });

  it("on All areas the same item in another Area is a different response", () => {
    const wealth = sprintOf(AUG, { impact: [impact()], recovery: [recovery({ rate: 60 })] });
    const health = sprintOf(JUN, { recovery: [recovery({ rate: 20 })] });
    const sentence = kit({ ...empty, impact: groupImpact([wealth, health], "all"), recovery: groupRecovery([wealth, health], "all"), closedDays: 20 });
    expect(sentence).toBe("Keep Starting late as the highest impediment; days it shows up run 31 points lower. You recover from Starting late 60% of the time.");
  });

  it("speaks about recovery alone when no impediment hurt enough", () => {
    const sentence = kit({ ...empty, recovery: groupRecovery([sprintOf(AUG, { recovery: [recovery({ rate: 75 })] })], "wealth"), closedDays: 12 });
    expect(sentence).toBe("You recover from Starting late 75% of the time.");
  });

  it("tells a low recovery rate to make the THEN smaller", () => {
    const sentence = kit({ ...empty, recovery: groupRecovery([sprintOf(AUG, { recovery: [recovery({ recovered: 1, didnt: 2, answered: 3, rate: 33 })] })], "wealth"), closedDays: 12 });
    expect(sentence).toBe("You recover from Starting late only 33% of the time — make the THEN smaller.");
  });

  it("never speaks from a row whose sample is short", () => {
    const shortImpact = groupImpact([sprintOf(AUG, { impact: [impact({ enough: false, delta_pts: -80 })] })], "wealth");
    const shortCue = groupCues([sprintOf(AUG, { cues: [cue({ enough: false, delta_pts: 90 })] })], "wealth");
    const shortRecovery = groupRecovery([sprintOf(AUG, { recovery: [recovery({ answered: 2, recovered: 0, didnt: 2, rate: null, enough: false })] })], "wealth");
    expect(kit({ impact: shortImpact, cues: shortCue, recovery: shortRecovery, closedDays: 9 })).toBe("Not enough logged days yet. Each comparison needs 3 days on each side.");
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
    expect(HOW_TO_READ).toContain("3 answered recoveries");
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
