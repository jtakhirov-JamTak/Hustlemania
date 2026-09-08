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
 *  day  actual  attain   H        B           F        C            resp  recov  impact
 *   1     50     0.50    yes      no          no       yes          yes   yes    a_lot
 *   2     60     0.60    yes      no          no       yes          yes   no     some
 *   3     70     0.70    yes      yes         no       no           no    no     a_lot
 *   4     80     0.80    yes      yes         yes      no           no    yes    some
 *   5    200     2.00    no       no          yes      yes          –     –      –
 *   6    150     1.50    no       no          yes      yes          –     –      –
 *   7    130     1.30    no       yes         yes      no           –     –      –
 *   8    120     1.20    no       no          yes      yes          –     –      –
 *   9     90     0.90    unsure   no          unsure   yes          –     –      –
 *  10    110     1.10    unansw.  unanswered  yes      unanswered   –     –      –
 *  11      0     n/a     no       –           no       –            –     –      –     target 0
 *  12      –                                                                           cancelled
 *  13–14   –                                                                           missed
 *
 * D is a fourth item present on only two days: it is the n = 3 boundary.
 * Day 11 has a zero target, so its attainment is undefined — the view's `target > 0`
 * filter is what keeps it out, and dropping that filter makes every query below error.
 * Day 12 is cancelled: it must never appear as a missed day.
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
const RESPONSE = ["yes", "yes", "no", "no"] as const;
const RECOVERED = ["yes", "no", "no", "yes"] as const;
const IMPACT = ["a_lot", "some", "a_lot", "some"] as const;

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
      H: await insertImpediment(u, "Saying yes to one-off projects", {
        explanation: "Retainer outreach slips",
        proofWhen: "a one-off request lands",
        proofThen: "I reply with the retainer offer within the hour",
        proofRecover: "I am back on the outreach list within 15 minutes",
      }),
      B: await insertImpediment(u, "Phone distraction"),
      D: await insertImpediment(u, "Starting late"),
      F: await insertCue(u, "Ask how much this pays"),
      C: await insertCue(u, "Outreach block at 9"),
    };

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
        proof_when: "a one-off request lands",
        proof_then: "I reply with the retainer offer within the hour",
        proof_recover: "I am back on the outreach list within 15 minutes",
      };
      if (i < RESPONSE.length) {
        patch.response = RESPONSE[i];
        patch.recovered = RECOVERED[i];
        patch.impact = IMPACT[i];
      }
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
      })),
    );
    const io = await admin.from("day_impediment_observations").insert(impRows);
    if (io.error) throw new Error(io.error.message);

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
    const co = await admin.from("day_cue_observations").insert(cueRows);
    if (co.error) throw new Error(co.error.message);
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
    felt_a_lot: number;
    felt_some: number;
    felt_nothing: number;
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

  it("impediment impact: the perceived-impact tally is the highest's own, not every row's", async () => {
    const rows = await rpc<ImpactRow[]>(u, "insight_impediment_impact", { p_sprint_id: sprintId });
    const by = Object.fromEntries(rows.map((r) => [r.item_id, r]));
    expect([by[ids.H].felt_a_lot, by[ids.H].felt_some, by[ids.H].felt_nothing]).toEqual([2, 2, 0]);
    // `impact` is the day's answer about the HIGHEST impediment. Attributing it to
    // another row would read as evidence about that row.
    expect([by[ids.B].felt_a_lot, by[ids.B].felt_some, by[ids.B].felt_nothing]).toEqual([0, 0, 0]);
    expect([by[ids.D].felt_a_lot, by[ids.D].felt_some, by[ids.D].felt_nothing]).toEqual([0, 0, 0]);
  });

  it("impediment impact: the highest sorts first, then the most damaging", async () => {
    const rows = await rpc<ImpactRow[]>(u, "insight_impediment_impact", { p_sprint_id: sprintId });
    expect(rows.map((r) => r.item_id)).toEqual([ids.H, ids.B, ids.D]);
  });

  it("response follow-through: partially is reported separately and never counts as ran", async () => {
    type Row = {
      occurrences: number;
      answered: number;
      ran: number;
      didnt: number;
      partially: number;
      unsure: number;
      rate: number | null;
      enough: boolean;
      proof_then: string;
    };
    const [row] = await rpc<Row[]>(u, "insight_response_followthrough", { p_sprint_id: sprintId });
    expect([row.occurrences, row.answered, row.ran, row.didnt, row.partially, row.unsure]).toEqual([4, 4, 2, 2, 0, 0]);
    expect(row.rate).toBe(50);
    expect(row.enough).toBe(true);
    expect(row.proof_then).toBe("I reply with the retainer offer within the hour");
  });

  it("response recovery: with the response vs without it", async () => {
    type Row = {
      with_response: number;
      with_recovered: number;
      without_response: number;
      without_recovered: number;
      answered: number;
      rate: number | null;
      enough: boolean;
      median_recovered: string | null;
      median_not: string | null;
      outcome_enough: boolean;
    };
    const [row] = await rpc<Row[]>(u, "insight_response_recovery", { p_sprint_id: sprintId });
    expect([row.with_response, row.with_recovered]).toEqual([2, 1]);
    expect([row.without_response, row.without_recovered]).toEqual([2, 1]);
    expect(row.answered).toBe(4);
    expect(row.rate).toBe(50);
    expect(row.enough).toBe(true);
    expect(Number(row.median_recovered)).toBeCloseTo(0.65, 6); // days 1 and 4
    expect(Number(row.median_not)).toBeCloseTo(0.65, 6); //      days 2 and 3
    expect(row.outcome_enough).toBe(true);
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
        "insight_response_followthrough",
        "insight_response_recovery",
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
        and proname in ('insight_impediment_impact', 'insight_response_followthrough',
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
// The two corrections 0015 made after the F10 evaluation (docs/evals/eval-06.md).
// ---------------------------------------------------------------------------
describe("follow-through counts `partially` as an answer (eval-06 P2-3)", () => {
  let u: TestUser;
  let sprintId: string;

  beforeAll(async () => {
    u = await createTestUser("f10-partially");
    const today = await dbTodayIn(TZ);
    const [{ d: start }] = await sql<{ d: string }[]>`select to_char(${today}::date - 20, 'YYYY-MM-DD') as d`;
    const seeded = await insertSprintRows(u, { startDate: start, tz: TZ, target: 100 });
    sprintId = seeded.sprintId;
    const imp = await insertImpediment(u, "Late meetings", {
      proofWhen: "a meeting runs past 6",
      proofThen: "I run the short loop",
      proofRecover: "I am out of the door within 20 minutes",
    });
    const m = await admin.from("sprint_impediments").insert({ sprint_id: sprintId, user_id: u.id, impediment_id: imp, is_highest: true });
    if (m.error) throw new Error(m.error.message);

    // Three occurrences, every one of them answered: yes, no, partially.
    const responses = ["yes", "no", "partially"] as const;
    for (let i = 0; i < responses.length; i++) {
      const d = await admin
        .from("sprint_days")
        .update({
          actual: 100,
          closed_at: new Date().toISOString(),
          closed_on_time: true,
          highest_impediment_id: imp,
          proof_then: "I run the short loop",
          proof_recover: "I am out of the door within 20 minutes",
          response: responses[i],
          recovered: "yes",
        })
        .eq("id", seeded.dayIds[i])
        .select("id")
        .single();
      if (d.error) throw new Error(d.error.message);
      const o = await admin
        .from("day_impediment_observations")
        .insert({ sprint_day_id: d.data.id, user_id: u.id, impediment_id: imp, name: "Late meetings", occurred: "yes", was_highest: true });
      if (o.error) throw new Error(o.error.message);
    }
  });

  afterAll(async () => {
    await deleteTestUser(u);
  });

  it("a day answered `partially` is answered: the card is not suppressed", async () => {
    type Row = { occurrences: number; answered: number; ran: number; didnt: number; partially: number; rate: number | null; enough: boolean };
    const [row] = await rpc<Row[]>(u, "insight_response_followthrough", { p_sprint_id: sprintId });
    expect([row.occurrences, row.answered, row.ran, row.didnt, row.partially]).toEqual([3, 3, 1, 1, 1]);
    // Ran is `yes` only, so a third of three answered is 33% — the honest reading of a
    // response that only half ran. Counting `partially` out of the denominator instead
    // would leave 2 answered, below the threshold, and hide the row entirely.
    expect(row.rate).toBe(33);
    expect(row.enough).toBe(true);
  });
});

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
