import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  admin,
  createTestUser,
  dbTodayIn,
  deleteTestUser,
  expectRpcError,
  insertCue,
  insertImpediment,
  insertSprintRows,
  rpc,
  situationsOf,
  sql,
  type TestUser,
} from "./helpers";

const TZ = "America/Los_Angeles";

afterAll(async () => {
  await sql.end();
});

/**
 * One 14-day sprint with a day matrix chosen so every figure below is computable by
 * hand. Target is 100 a day (goal 1,400), and `attainment` is Actual ÷ Target.
 *
 *  day  actual  attain   H        B           F        C            recov (H's situation)
 *   1     50     0.50    yes      no          no       yes          yes
 *   2     60     0.60    yes      no          no       yes          no
 *   3     70     0.70    yes      yes         no       no           no
 *   4     80     0.80    yes      yes         yes      no           yes
 *   5    200     2.00    no       no          yes      yes          –
 *   6    150     1.50    no       no          yes      yes          –
 *   7    130     1.30    no       yes         yes      no           –
 *   8    120     1.20    no       no          yes      yes          –
 *   9     90     0.90    unsure   no          unsure   yes          –
 *  10    110     1.10    unansw.  unanswered  yes      unanswered   –
 *  11      0     n/a     no       –           no       –            –     target 0
 *  12      –                                                              cancelled
 *  13–14   –                                                              missed
 *
 * D is a fourth item present on only two days: it is the n = 3 boundary.
 * Day 11 has a zero target, so its attainment is undefined — the view's `target > 0`
 * filter is what keeps it out, and dropping that filter makes every query below error.
 * Day 12 is cancelled: it must never appear as a missed day.
 * F15: every item carries one situation; an occurrence is that situation showing up,
 * and H's recovery is answered per situation on the four days it showed up.
 */
type Answer = "yes" | "no" | "unsure" | "unanswered";

const IMP: Record<string, Answer[]> = {
  H: ["yes", "yes", "yes", "yes", "no", "no", "no", "no", "unsure", "unanswered", "no"],
  B: ["no", "no", "yes", "yes", "no", "no", "yes", "no", "no", "unanswered"],
  D: ["yes", "yes", "no", "no", "no", "no", "no", "no", "no", "no"],
};
const CUE: Record<string, Answer[]> = {
  F: ["no", "no", "no", "yes", "yes", "yes", "yes", "yes", "unsure", "yes", "no"],
  C: ["yes", "yes", "no", "no", "yes", "yes", "no", "yes", "yes", "unanswered"],
};
const ACTUALS = [50, 60, 70, 80, 200, 150, 130, 120, 90, 110, 0];
const RECOVERED = ["yes", "no", "no", "yes"] as const;
const PROOF_THEN = "I reply with the retainer offer within the hour";
const PROOF_RECOVER = "I am back on the outreach list within 15 minutes";

describe("F10 single-sprint insight calculations", () => {
  let u: TestUser;
  let sprintId: string;
  let ids: Record<string, string>;

  beforeAll(async () => {
    u = await createTestUser("f10-insights");
    const today = await dbTodayIn(TZ);
    const [{ d: start }] = await sql<{ d: string }[]>`select to_char(${today}::date - 20, 'YYYY-MM-DD') as d`;
    // Day 11's target is written at seed time: the target lock (0005) refuses to
    // change a target once the day has begun, and every day here is in the past.
    const targets = Array.from({ length: 14 }, (_, i) => (i === 10 ? 0 : 100));
    const seeded = await insertSprintRows(u, { startDate: start, tz: TZ, target: 100, targets });
    sprintId = seeded.sprintId;
    const dayIds = seeded.dayIds;

    ids = {
      H: await insertImpediment(u, "A one-off request lands", {
        explanation: "Retainer outreach slips",
        proofThen: PROOF_THEN,
        proofRecover: PROOF_RECOVER,
        situation: "Saying yes to one-off projects",
      }),
      B: await insertImpediment(u, "Phone distraction"),
      D: await insertImpediment(u, "Starting late"),
      F: await insertCue(u, "Ask how much this pays"),
      C: await insertCue(u, "Outreach block at 9"),
    };
    const sit: Record<string, string> = {};
    for (const k of ["H", "B", "D"]) sit[k] = (await situationsOf("impediment", ids[k]))[0];
    for (const k of ["F", "C"]) sit[k] = (await situationsOf("cue", ids[k]))[0];

    const members = await admin.from("sprint_impediments").insert(
      (["H", "B", "D"] as const).map((k) => ({ sprint_id: sprintId, user_id: u.id, impediment_id: ids[k], is_highest: k === "H" })),
    );
    if (members.error) throw new Error(members.error.message);
    const cues = await admin.from("sprint_cues").insert(
      (["F", "C"] as const).map((k) => ({ sprint_id: sprintId, user_id: u.id, cue_id: ids[k], is_focus: k === "F" })),
    );
    if (cues.error) throw new Error(cues.error.message);

    // Days 1–11 close. Day 11 carries a zero target (a custom plan may hold one).
    for (let i = 0; i < ACTUALS.length; i++) {
      const patch: Record<string, unknown> = {
        actual: ACTUALS[i],
        closed_at: new Date().toISOString(),
        closed_on_time: true,
        highest_impediment_id: ids.H,
      };
      const res = await admin.from("sprint_days").update(patch).eq("id", dayIds[i]);
      if (res.error) throw new Error(res.error.message);
    }
    const cancelled = await admin.from("sprint_days").update({ cancelled: true }).eq("id", dayIds[11]);
    if (cancelled.error) throw new Error(cancelled.error.message);

    const impRows = Object.entries(IMP).flatMap(([k, answers]) =>
      answers.map((occurred, i) => ({
        sprint_day_id: dayIds[i],
        user_id: u.id,
        impediment_id: ids[k],
        name: k,
        occurred,
        was_highest: k === "H",
        proof_then: k === "H" ? PROOF_THEN : null,
        proof_recover: k === "H" ? PROOF_RECOVER : null,
      })),
    );
    const io = await admin.from("day_impediment_observations").insert(impRows).select("id, impediment_id, sprint_day_id, occurred");
    if (io.error) throw new Error(io.error.message);
    // One situation row per observation row (what close_day writes): occurred follows the
    // item's answer; H's recovery is the day's answer on the four days it showed up.
    const impSit = io.data.map((o) => {
      const k = (Object.keys(ids) as string[]).find((key) => ids[key] === o.impediment_id)!;
      const dayIndex = dayIds.indexOf(o.sprint_day_id);
      const showed = o.occurred === "yes";
      return {
        observation_id: o.id,
        user_id: u.id,
        situation_id: sit[k],
        name: `S-${k}`,
        occurred: showed,
        recovered: k === "H" && showed && dayIndex < RECOVERED.length ? RECOVERED[dayIndex] : null,
      };
    });
    const is = await admin.from("day_impediment_situation_observations").insert(impSit);
    if (is.error) throw new Error(is.error.message);

    const cueRows = Object.entries(CUE).flatMap(([k, answers]) =>
      answers.map((used, i) => ({
        sprint_day_id: dayIds[i],
        user_id: u.id,
        cue_id: ids[k],
        name: k,
        used,
        was_focus: k === "F",
      })),
    );
    const co = await admin.from("day_cue_observations").insert(cueRows).select("id, cue_id, used");
    if (co.error) throw new Error(co.error.message);
    const cueSit = co.data.map((o) => {
      const k = (Object.keys(ids) as string[]).find((key) => ids[key] === o.cue_id)!;
      return { observation_id: o.id, user_id: u.id, situation_id: sit[k], name: `S-${k}`, applied: o.used === "yes" };
    });
    const cs = await admin.from("day_cue_situation_observations").insert(cueSit);
    if (cs.error) throw new Error(cs.error.message);
  });

  afterAll(async () => {
    await deleteTestUser(u);
  });

  type ImpactRow = {
    item_id: string;
    is_highest: boolean;
    present_days: number;
    absent_days: number;
    logged_days: number;
    unsure_days: number;
    median_present: string | null;
    median_absent: string | null;
    delta_pts: number | null;
    enough: boolean;
  };

  it("the effective-days view holds exactly the closed, uncancelled, positive-target days", async () => {
    const rows = await sql<{ day_index: number }[]>`
      select day_index from public.sprint_days_effective where sprint_id = ${sprintId} order by day_index`;
    expect(rows.map((r) => r.day_index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("impediment impact: medians, the delta in points, coverage and the n = 3 boundary", async () => {
    const rows = await rpc<ImpactRow[]>(u, "insight_impediment_impact", { p_sprint_id: sprintId });
    const by = Object.fromEntries(rows.map((r) => [r.item_id, r]));

    const h = by[ids.H];
    expect(h.is_highest).toBe(true);
    expect([h.present_days, h.absent_days, h.logged_days, h.unsure_days]).toEqual([4, 4, 9, 1]);
    expect(Number(h.median_present)).toBeCloseTo(0.65, 6); // (0.60 + 0.70) / 2
    expect(Number(h.median_absent)).toBeCloseTo(1.4, 6); //  (1.30 + 1.50) / 2
    expect(h.delta_pts).toBe(-75);
    expect(h.enough).toBe(true);

    const b = by[ids.B];
    expect([b.present_days, b.absent_days, b.logged_days]).toEqual([3, 6, 9]);
    expect(Number(b.median_present)).toBeCloseTo(0.8, 6);
    expect(Number(b.median_absent)).toBeCloseTo(1.05, 6); // (0.90 + 1.20) / 2
    expect(b.delta_pts).toBe(-25);
    expect(b.enough).toBe(true); // exactly 3 on the thin side

    const d = by[ids.D];
    expect([d.present_days, d.absent_days]).toEqual([2, 8]);
    expect(d.enough).toBe(false); // one short
    expect(d.delta_pts).toBeNull();
  });

  it("impediment impact: no perceived-impact tally remains (F15 dropped the cost question)", async () => {
    const rows = await rpc<ImpactRow[]>(u, "insight_impediment_impact", { p_sprint_id: sprintId });
    expect(Object.keys(rows[0]).filter((k) => k.startsWith("felt_"))).toEqual([]);
  });

  it("sprint_totals: one row per sprint with the summary's own total and the effective-day counts (0017)", async () => {
    const [row] = await sql<{ closed_days: number; effective_days: number; on_target_days: number; total: string }[]>`
      select closed_days, effective_days, on_target_days, total from public.sprint_totals where sprint_id = ${sprintId}`;
    // 11 closed days (day 11 has a zero target, so 10 effective); actual ≥ target on days
    // 5, 6, 7, 8 and 10; the total is every closed non-cancelled actual, day 11's 0 included.
    expect([row.closed_days, row.effective_days, row.on_target_days, Number(row.total)]).toEqual([11, 10, 5, 1060]);
    const viaRls = await u.client.from("sprint_totals").select("sprint_id, total").eq("sprint_id", sprintId);
    expect(viaRls.error).toBeNull();
    expect(Number(viaRls.data?.[0]?.total)).toBe(1060);
  });

  it("the *_many wrappers return the per-sprint rows tagged with the sprint, and refuse a foreign id (0017)", async () => {
    const single = await rpc<ImpactRow[]>(u, "insight_impediment_impact", { p_sprint_id: sprintId });
    const many = await rpc<(ImpactRow & { sprint_id: string })[]>(u, "insight_impediment_impact_many", { p_sprint_ids: [sprintId, sprintId] });
    expect(many.map((r) => r.sprint_id)).toEqual(single.map(() => sprintId));
    expect(many.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== "sprint_id")))).toEqual(single);

    const summary = await rpc<{ sprint_id: string; total: number; closed_days: number }[]>(u, "sprint_review_summary_many", { p_sprint_ids: [sprintId] });
    expect(summary).toHaveLength(1);
    expect([summary[0].sprint_id, Number(summary[0].total), summary[0].closed_days]).toEqual([sprintId, 1060, 11]);

    const b = await createTestUser("f10-insights-b");
    try {
      for (const fn of ["insight_impediment_impact_many", "insight_response_recovery_many", "insight_situations_many", "insight_cue_usefulness_many", "sprint_review_summary_many"]) {
        await expectRpcError(b, fn, { p_sprint_ids: [sprintId] }, "sprint_not_found");
      }
    } finally {
      await deleteTestUser(b);
    }
  });

  it("impediment impact: the highest sorts first, then the most damaging", async () => {
    const rows = await rpc<ImpactRow[]>(u, "insight_impediment_impact", { p_sprint_id: sprintId });
    expect(rows.map((r) => r.item_id)).toEqual([ids.H, ids.B, ids.D]);
  });

  type RecoveryRow = {
    item_id: string;
    is_highest: boolean;
    proof_then: string | null;
    proof_recover: string | null;
    occurrences: number;
    verdict_occurrences: number;
    answered: number;
    recovered: number;
    didnt: number;
    rate: number | null;
    enough: boolean;
  };

  it("response recovery (F15): one row per impediment over its situation rows; the highest sorts first", async () => {
    const rows = await rpc<RecoveryRow[]>(u, "insight_response_recovery", { p_sprint_id: sprintId });
    expect(rows.map((r) => r.item_id)).toEqual([ids.H, ids.B, ids.D]);
    const h = rows[0];
    expect([h.occurrences, h.verdict_occurrences, h.answered, h.recovered, h.didnt]).toEqual([4, 4, 4, 2, 2]);
    expect(h.rate).toBe(50);
    expect(h.enough).toBe(true);
    expect([h.proof_then, h.proof_recover]).toEqual([PROOF_THEN, PROOF_RECOVER]);
    // B showed up three times but its situation was never asked about recovery: no rate.
    const b = rows[1];
    expect([b.occurrences, b.verdict_occurrences, b.answered, b.rate, b.enough]).toEqual([3, 0, 0, null, false]);
  });

  type SituationRow = {
    kind: string;
    item_id: string;
    situation_name: string;
    occurrences: number;
    asked_days: number;
    recovered_yes: number;
    recovered_answered: number;
    rate: number | null;
    enough: boolean;
  };

  it("situation breakdown (F15): occurrences and recovery per situation, thresholds at n = 3", async () => {
    const rows = await rpc<SituationRow[]>(u, "insight_situations", { p_sprint_id: sprintId });
    const by = Object.fromEntries(rows.map((r) => [`${r.kind}:${r.item_id}`, r]));
    // H's situation: showed up on 4 of the 9 asked days, recovered 2 of 4 answered.
    expect(by[`impediment:${ids.H}`]).toMatchObject({ situation_name: "S-H", occurrences: 4, asked_days: 9, recovered_yes: 2, recovered_answered: 4, rate: 50, enough: true });
    // B: three occurrences, no recovery answered → not enough for a rate.
    expect(by[`impediment:${ids.B}`]).toMatchObject({ occurrences: 3, asked_days: 9, recovered_answered: 0, rate: null, enough: false });
    // D: two occurrences — below the bar either way.
    expect(by[`impediment:${ids.D}`]).toMatchObject({ occurrences: 2, enough: false });
    // Cues: applied on the used days; F clears the bar, both are asked on 10 days.
    expect(by[`cue:${ids.F}`]).toMatchObject({ situation_name: "S-F", occurrences: 6, asked_days: 10, rate: null, enough: true });
    expect(by[`cue:${ids.C}`]).toMatchObject({ occurrences: 6, asked_days: 9, enough: true });
    // Impediments sort before cues; within a kind by item name.
    expect(rows.map((r) => r.kind)).toEqual(["impediment", "impediment", "impediment", "cue", "cue"]);
  });

  it("cue usefulness: the focus cue sorts first and both cues clear the threshold", async () => {
    type Row = {
      item_id: string;
      is_focus: boolean;
      used_days: number;
      unused_days: number;
      logged_days: number;
      unsure_days: number;
      median_used: string | null;
      median_unused: string | null;
      delta_pts: number | null;
      enough: boolean;
    };
    const rows = await rpc<Row[]>(u, "insight_cue_usefulness", { p_sprint_id: sprintId });
    expect(rows[0].item_id).toBe(ids.F);

    const by = Object.fromEntries(rows.map((r) => [r.item_id, r]));
    const f = by[ids.F];
    expect([f.used_days, f.unused_days, f.logged_days, f.unsure_days]).toEqual([6, 3, 10, 1]);
    expect(Number(f.median_used)).toBeCloseTo(1.25, 6); //   (1.20 + 1.30) / 2
    expect(Number(f.median_unused)).toBeCloseTo(0.6, 6); //  day 2
    expect(f.delta_pts).toBe(65);
    expect(f.is_focus).toBe(true);

    const c = by[ids.C];
    expect([c.used_days, c.unused_days, c.logged_days]).toEqual([6, 3, 9]);
    expect(Number(c.median_used)).toBeCloseTo(1.05, 6);
    expect(Number(c.median_unused)).toBeCloseTo(0.8, 6);
    expect(c.delta_pts).toBe(25);
  });

  it("the result summary counts the cancelled day as neither closed nor missed", async () => {
    type Row = {
      total: number;
      goal: number;
      pct: number;
      met: boolean;
      closed_days: number;
      missed_days: number;
      cancelled_days: number;
      best_streak: number;
      status: string;
    };
    const [row] = await rpc<Row[]>(u, "sprint_review_summary", { p_sprint_id: sprintId });
    expect(Number(row.total)).toBe(1060);
    expect(Number(row.goal)).toBe(1400);
    expect(row.pct).toBe(76);
    expect(row.met).toBe(false);
    expect([row.closed_days, row.missed_days, row.cancelled_days]).toEqual([11, 2, 1]);
    expect(row.best_streak).toBe(11);
  });

  it("every calculation refuses another user's sprint", async () => {
    const b = await createTestUser("f10-insights-b");
    try {
      for (const fn of [
        "insight_impediment_impact",
        "insight_response_recovery",
        "insight_situations",
        "insight_cue_usefulness",
        "sprint_review_summary",
      ]) {
        await expectRpcError(b, fn, { p_sprint_id: sprintId }, "sprint_not_found");
      }
    } finally {
      await deleteTestUser(b);
    }
  });

  it("no calculation reads sprint_days directly — the effective-days view is the only source", async () => {
    const fns = await sql<{ proname: string; def: string }[]>`
      select proname, pg_get_functiondef(oid) as def from pg_proc
      where pronamespace = 'public'::regnamespace
        and proname in ('insight_impediment_impact', 'insight_situations',
                        'insight_response_recovery', 'insight_cue_usefulness')
      order by proname`;
    expect(fns).toHaveLength(4);
    for (const f of fns) {
      expect(f.def, `${f.proname} reads sprint_days directly`).not.toMatch(/public\.sprint_days\b(?!_effective)/);
      expect(f.def, `${f.proname} never reads the effective view`).toMatch(/public\.sprint_days_effective/);
    }
  });
});

// ---------------------------------------------------------------------------
// 0015's best-streak correction (docs/evals/eval-06.md). Its follow-through sibling
// went with the response question in F15.
// ---------------------------------------------------------------------------
describe("best streak treats a cancelled day as removed, not as a break (eval-06 P2-5)", () => {
  let u: TestUser;

  beforeAll(async () => {
    u = await createTestUser("f10-best-cancelled");
  });
  afterAll(async () => {
    await deleteTestUser(u);
  });

  it("agrees with sprint_streak_at on a run interrupted only by a cancelled day", async () => {
    // Day 7 is today, so days 8–14 are still ahead and cannot break the run: the only
    // thing between day 3 and day 5 is the cancelled day.
    const today = await dbTodayIn(TZ);
    const [{ d: start }] = await sql<{ d: string }[]>`select to_char(${today}::date - 6, 'YYYY-MM-DD') as d`;
    const { sprintId, dayIds } = await insertSprintRows(u, { startDate: start, tz: TZ, target: 100 });
    // Days 1–3 and 5–7 closed on time; day 4 cancelled. Closure only ever cancels from
    // the closure date forward, so this shape needs a direct write — it is pinned
    // because the two functions must answer the same question about it.
    for (const i of [0, 1, 2, 4, 5, 6]) {
      const r = await admin
        .from("sprint_days")
        .update({ actual: 100, closed_at: new Date().toISOString(), closed_on_time: true })
        .eq("id", dayIds[i]);
      if (r.error) throw new Error(r.error.message);
    }
    const c = await admin.from("sprint_days").update({ cancelled: true }).eq("id", dayIds[3]);
    if (c.error) throw new Error(c.error.message);

    const [at] = await sql<{ streak: number }[]>`select public.sprint_streak_at(${sprintId}, now()) as streak`;
    expect(at.streak).toBe(6);
    expect(await rpc<number>(u, "sprint_best_streak", { p_sprint_id: sprintId })).toBe(6);
  });
});
