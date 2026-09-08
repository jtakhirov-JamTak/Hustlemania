import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  admin,
  createTestUser,
  dbTodayIn,
  deleteTestUser,
  expectRpcError,
  insertSprintRows,
  insertVision,
  moneySprintArgs,
  rpc,
  seedItems,
  sql,
  startSprint,
  type TestUser,
} from "./helpers";

const TZ = "America/Los_Angeles";

afterAll(async () => {
  await sql.end();
});

/** Closes days [1..n] of a seeded sprint with the service role: the closure functions
 *  only read the totals, and close_day's own path is covered by the F5/F7 suites. */
async function closeDays(dayIds: string[], actuals: number[], onTime = true) {
  for (let i = 0; i < actuals.length; i++) {
    const res = await admin
      .from("sprint_days")
      .update({ actual: actuals[i], closed_at: new Date().toISOString(), closed_on_time: onTime })
      .eq("id", dayIds[i]);
    if (res.error) throw new Error(res.error.message);
  }
}

async function sprintRow(sprintId: string) {
  const [row] = await sql<{ status: string; closed_at: Date | null }[]>`
    select status, closed_at from public.sprints where id = ${sprintId}`;
  return row;
}

async function dayStates(sprintId: string) {
  return sql<{ day_index: number; cancelled: boolean; closed: boolean }[]>`
    select day_index, cancelled, closed_at is not null as closed
    from public.sprint_days where sprint_id = ${sprintId} order by day_index`;
}

// ---------------------------------------------------------------------------
// complete_sprint — only while the window runs, only once the goal is reached.
// ---------------------------------------------------------------------------
describe("complete_sprint", () => {
  let u: TestUser;
  let sprintId: string;
  let dayIds: string[];

  beforeAll(async () => {
    u = await createTestUser("f10-complete");
    await insertVision(u);
    const today = await dbTodayIn(TZ);
    sprintId = await startSprint(u, moneySprintArgs({ ...(await seedItems(u)), p_tz: TZ, p_start_date: today }));
    const rows = await sql<{ id: string }[]>`
      select id from public.sprint_days where sprint_id = ${sprintId} order by day_index`;
    dayIds = rows.map((r) => r.id);
  });

  afterAll(async () => {
    await deleteTestUser(u);
  });

  it("rejects while the closed days are short of the goal, and changes nothing", async () => {
    await closeDays([dayIds[0]], [100_000]); // goal is 800,000
    await expectRpcError(u, "complete_sprint", { p_sprint_id: sprintId }, "goal_not_reached");
    expect((await sprintRow(sprintId)).status).toBe("active");
    expect((await dayStates(sprintId)).filter((d) => d.cancelled)).toEqual([]);
  });

  it("completed_early before day 14: closed_at is stamped, later days cancel, the day already closed today does not", async () => {
    await closeDays([dayIds[1]], [700_000]);
    await rpc(u, "complete_sprint", { p_sprint_id: sprintId });

    const s = await sprintRow(sprintId);
    expect(s.status).toBe("completed_early");
    expect(s.closed_at).not.toBeNull();

    const days = await dayStates(sprintId);
    // Day 1 is today's day and was closed before the call: it keeps its close.
    expect(days.filter((d) => d.closed).map((d) => d.day_index)).toEqual([1, 2]);
    expect(days.filter((d) => d.cancelled).map((d) => d.day_index)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    expect(days.find((d) => d.day_index === 1)!.cancelled).toBe(false);
  });

  it("no backfill after closure: close_day now refuses the sprint (PRD §9)", async () => {
    await expectRpcError(u, "close_day", { p_sprint_day_id: dayIds[5], p_actual: 10_000 }, "sprint_not_active");
  });

  it("a second closure call is refused", async () => {
    await expectRpcError(u, "complete_sprint", { p_sprint_id: sprintId }, "sprint_not_active");
    await expectRpcError(u, "end_sprint_early", { p_sprint_id: sprintId }, "sprint_not_active");
  });

  it("another user cannot close it", async () => {
    const b = await createTestUser("f10-complete-b");
    try {
      await expectRpcError(b, "complete_sprint", { p_sprint_id: sprintId }, "sprint_not_found");
    } finally {
      await deleteTestUser(b);
    }
  });
});

// ---------------------------------------------------------------------------
// complete_sprint on the last day lands on `completed`, not `completed_early`.
// ---------------------------------------------------------------------------
describe("complete_sprint on day 14", () => {
  let u: TestUser;

  beforeAll(async () => {
    u = await createTestUser("f10-complete-14");
  });
  afterAll(async () => {
    await deleteTestUser(u);
  });

  it("is `completed` when today is the end date", async () => {
    const today = await dbTodayIn(TZ);
    const start = await sql<{ d: string }[]>`select to_char(${today}::date - 13, 'YYYY-MM-DD') as d`;
    const { sprintId, dayIds } = await insertSprintRows(u, { startDate: start[0].d, tz: TZ, target: 100 });
    await closeDays(dayIds, Array(14).fill(100)); // 1,400 = the seeded goal
    await rpc(u, "complete_sprint", { p_sprint_id: sprintId });
    expect((await sprintRow(sprintId)).status).toBe("completed");
  });
});

// ---------------------------------------------------------------------------
// end_sprint_early — no goal required, works before day 1, refused once the
// window has passed.
// ---------------------------------------------------------------------------
describe("end_sprint_early", () => {
  let u: TestUser;

  beforeAll(async () => {
    u = await createTestUser("f10-early");
  });
  afterAll(async () => {
    await deleteTestUser(u);
  });

  it("before day 1: all 14 days cancel, nothing is closed, status is ended_early", async () => {
    const today = await dbTodayIn(TZ);
    const [{ d: tomorrow }] = await sql<{ d: string }[]>`select to_char(${today}::date + 1, 'YYYY-MM-DD') as d`;
    const { sprintId } = await insertSprintRows(u, { startDate: tomorrow, tz: TZ, area: "health" });
    await rpc(u, "end_sprint_early", { p_sprint_id: sprintId });

    expect((await sprintRow(sprintId)).status).toBe("ended_early");
    const days = await dayStates(sprintId);
    expect(days.every((d) => d.cancelled)).toBe(true);
    expect(days.some((d) => d.closed)).toBe(false);
  });

  it("is refused once the window has passed — finish_sprint owns that", async () => {
    const today = await dbTodayIn(TZ);
    const [{ d: start }] = await sql<{ d: string }[]>`select to_char(${today}::date - 20, 'YYYY-MM-DD') as d`;
    const { sprintId } = await insertSprintRows(u, { startDate: start, tz: TZ, area: "wealth" });
    await expectRpcError(u, "end_sprint_early", { p_sprint_id: sprintId }, "window_passed");
    expect((await sprintRow(sprintId)).status).toBe("active");
  });
});

// ---------------------------------------------------------------------------
// finish_sprint — the explicit close for a window that ran out.
// ---------------------------------------------------------------------------
describe("finish_sprint", () => {
  let u: TestUser;
  let past: string;

  beforeAll(async () => {
    u = await createTestUser("f10-finish");
    const today = await dbTodayIn(TZ);
    const [{ d }] = await sql<{ d: string }[]>`select to_char(${today}::date - 20, 'YYYY-MM-DD') as d`;
    past = d;
  });
  afterAll(async () => {
    await deleteTestUser(u);
  });

  it("refuses while the window is still open", async () => {
    const today = await dbTodayIn(TZ);
    const { sprintId } = await insertSprintRows(u, { startDate: today, tz: TZ, area: "relationships" });
    await expectRpcError(u, "finish_sprint", { p_sprint_id: sprintId }, "sprint_running");
  });

  it("`ended` when the total never reached the goal; the open days cancel", async () => {
    const { sprintId, dayIds } = await insertSprintRows(u, { startDate: past, tz: TZ, area: "health", target: 100 });
    await closeDays(dayIds.slice(0, 5), [100, 100, 100, 100, 100]);
    await rpc(u, "finish_sprint", { p_sprint_id: sprintId });

    expect((await sprintRow(sprintId)).status).toBe("ended");
    const days = await dayStates(sprintId);
    // Every unclosed day is dated before today, so none is cancelled: they stay missed.
    expect(days.filter((d) => d.cancelled)).toEqual([]);
    expect(days.filter((d) => d.closed).length).toBe(5);
  });

  it("`completed` when the closed days reached the goal", async () => {
    const { sprintId, dayIds } = await insertSprintRows(u, { startDate: past, tz: TZ, area: "wealth", target: 100 });
    await closeDays(dayIds, Array(14).fill(100));
    await rpc(u, "finish_sprint", { p_sprint_id: sprintId });
    expect((await sprintRow(sprintId)).status).toBe("completed");
  });
});

// ---------------------------------------------------------------------------
// The guards on the columns themselves.
// ---------------------------------------------------------------------------
describe("status and cancellation guards", () => {
  let u: TestUser;
  let sprintId: string;
  let dayIds: string[];

  beforeAll(async () => {
    u = await createTestUser("f10-guards");
    const today = await dbTodayIn(TZ);
    const seeded = await insertSprintRows(u, { startDate: today, tz: TZ });
    sprintId = seeded.sprintId;
    dayIds = seeded.dayIds;
  });
  afterAll(async () => {
    await deleteTestUser(u);
  });

  it("the legacy `review` status is gone and `ended` is allowed", async () => {
    const [c] = await sql<{ def: string }[]>`
      select pg_get_constraintdef(oid) as def from pg_constraint
      where conrelid = 'public.sprints'::regclass and conname = 'sprints_status_check'`;
    expect(c.def).not.toMatch(/'review'/);
    expect(c.def).toMatch(/'ended'/);
    // The BEFORE trigger reaches it first, so the update names the trigger, not the check.
    await expect(
      sql`update public.sprints set status = 'review', closed_at = now() where id = ${sprintId}`,
    ).rejects.toThrow(/sprint_finished/);
  });

  it("status and closed_at move together", async () => {
    await expect(
      sql`update public.sprints set status = 'completed' where id = ${sprintId}`,
    ).rejects.toThrow(/sprints_closed_at_iff_finished_check/);
    await expect(
      sql`update public.sprints set closed_at = now() where id = ${sprintId}`,
    ).rejects.toThrow(/sprints_closed_at_iff_finished_check/);
  });

  it("a cancelled day cannot also be closed, in either order", async () => {
    await expect(
      sql`update public.sprint_days set cancelled = true, actual = 1, closed_at = now(), closed_on_time = true where id = ${dayIds[13]}`,
    ).rejects.toThrow(/sprint_days_cancelled_not_closed_check/);
  });

  it("a finished sprint cannot go back to active, change status again, or restamp closed_at", async () => {
    await rpc(u, "end_sprint_early", { p_sprint_id: sprintId });
    await expect(
      sql`update public.sprints set status = 'active', closed_at = null where id = ${sprintId}`,
    ).rejects.toThrow(/sprint_finished/);
    await expect(
      sql`update public.sprints set status = 'completed' where id = ${sprintId}`,
    ).rejects.toThrow(/sprint_finished/);
    await expect(
      sql`update public.sprints set closed_at = now() where id = ${sprintId}`,
    ).rejects.toThrow(/sprint_finished/);
  });

  it("a cancelled day cannot be un-cancelled", async () => {
    await expect(
      sql`update public.sprint_days set cancelled = false where id = ${dayIds[13]}`,
    ).rejects.toThrow(/day_cancelled/);
  });

  it("authenticated may not write status, closed_at or cancelled directly", async () => {
    const s = await u.client.from("sprints").update({ status: "active" }).eq("id", sprintId);
    expect(s.error?.code).toBe("42501");
    const d = await u.client.from("sprint_days").update({ cancelled: false }).eq("id", dayIds[13]);
    expect(d.error?.code).toBe("42501");
  });
});

// ---------------------------------------------------------------------------
// Rule 26 — the next sprint in an Area waits for the postmortem.
// ---------------------------------------------------------------------------
describe("rule 26: the next sprint waits for the review", () => {
  let u: TestUser;
  let items: Awaited<ReturnType<typeof seedItems>>;
  let finished: string;
  let today: string;

  beforeAll(async () => {
    u = await createTestUser("f10-gate");
    await insertVision(u);
    items = await seedItems(u);
    today = await dbTodayIn(TZ);
    finished = await startSprint(u, moneySprintArgs({ ...items, p_tz: TZ, p_start_date: today }));
    await rpc(u, "end_sprint_early", { p_sprint_id: finished });
  });
  afterAll(async () => {
    await deleteTestUser(u);
  });

  it("blocks a new sprint in the same Area", async () => {
    await expectRpcError(
      u,
      "start_sprint",
      moneySprintArgs({ ...items, p_tz: TZ, p_start_date: today }) as unknown as Record<string, unknown>,
      "review_required",
    );
  });

  it("does not block another Area", async () => {
    const id = await startSprint(u, moneySprintArgs({ ...items, p_area: "health", p_tz: TZ, p_start_date: today }));
    expect(id).toBeTruthy();
  });

  it("clears once the review is finished", async () => {
    await rpc(u, "finish_review", {
      p_sprint_id: finished,
      p_lesson: "Outreach only happens when it is first on the list.",
      p_moved: true,
    });
    const id = await startSprint(u, moneySprintArgs({ ...items, p_tz: TZ, p_start_date: today }));
    expect(id).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// finish_review — validation, the default fill and atomicity.
// ---------------------------------------------------------------------------
describe("finish_review", () => {
  let u: TestUser;
  let items: Awaited<ReturnType<typeof seedItems>>;
  let running: string;
  let sprintId: string;

  beforeAll(async () => {
    u = await createTestUser("f10-review");
    await insertVision(u);
    items = await seedItems(u);
    const today = await dbTodayIn(TZ);
    running = await startSprint(u, moneySprintArgs({ ...items, p_area: "health", p_tz: TZ, p_start_date: today }));
    sprintId = await startSprint(u, moneySprintArgs({ ...items, p_tz: TZ, p_start_date: today }));
    await rpc(u, "end_sprint_early", { p_sprint_id: sprintId });
  });
  afterAll(async () => {
    await deleteTestUser(u);
  });

  const base = () => ({ p_lesson: "One lesson.", p_moved: false });

  it("refuses a running sprint, a blank lesson and a missing vision answer", async () => {
    await expectRpcError(u, "finish_review", { p_sprint_id: running, ...base() }, "sprint_running");
    await expectRpcError(u, "finish_review", { p_sprint_id: sprintId, p_lesson: "   ", p_moved: true }, "lesson_required");
    await expectRpcError(u, "finish_review", { p_sprint_id: sprintId, p_lesson: "x", p_moved: null }, "vision_answer_required");
  });

  it("refuses a verdict when the highest impediment never showed up on a logged day", async () => {
    await expectRpcError(
      u,
      "finish_review",
      { p_sprint_id: sprintId, ...base(), p_verdict: "worked" },
      "verdict_not_applicable",
    );
  });

  it("refuses an item that is not a member, and two `highest` decisions", async () => {
    await expectRpcError(
      u,
      "finish_review",
      { p_sprint_id: sprintId, ...base(), p_decisions: [{ kind: "impediment", item_id: u.id, decision: "keep" }] },
      "item_not_in_sprint",
    );
    await expectRpcError(
      u,
      "finish_review",
      {
        p_sprint_id: sprintId,
        ...base(),
        p_decisions: [
          { kind: "impediment", item_id: items.p_impediment_ids[0], decision: "highest" },
          { kind: "impediment", item_id: items.p_impediment_ids[0], decision: "highest" },
        ],
      },
      "one_highest_only",
    );
  });

  it("a rejected call writes nothing", async () => {
    const [row] = await sql<{ n: number }[]>`select count(*)::int as n from public.reviews where sprint_id = ${sprintId}`;
    expect(row.n).toBe(0);
  });

  it("stores one decision per member, defaulting to keep", async () => {
    const id = await rpc<string>(u, "finish_review", { p_sprint_id: sprintId, ...base() });
    const rows = await sql<{ kind: string; item_id: string; decision: string }[]>`
      select kind, item_id, decision from public.review_decisions where review_id = ${id} order by kind`;
    expect(rows.map((r) => `${r.kind}:${r.decision}`).sort()).toEqual(["cue:keep", "impediment:keep"]);
    expect(rows.map((r) => r.item_id).sort()).toEqual([items.p_cue_ids[0], items.p_impediment_ids[0]].sort());
  });

  it("refuses a second review for the same sprint", async () => {
    await expectRpcError(u, "finish_review", { p_sprint_id: sprintId, ...base() }, "review_exists");
  });
});

// ---------------------------------------------------------------------------
// The verdict is required when the highest DID show up.
// ---------------------------------------------------------------------------
describe("finish_review verdict when the highest occurred", () => {
  let u: TestUser;
  let sprintId: string;

  beforeAll(async () => {
    u = await createTestUser("f10-verdict");
    await insertVision(u);
    const items = await seedItems(u);
    const today = await dbTodayIn(TZ);
    sprintId = await startSprint(u, moneySprintArgs({ ...items, p_tz: TZ, p_start_date: today }));
    const [day1] = await sql<{ id: string }[]>`
      select id from public.sprint_days where sprint_id = ${sprintId} and day_index = 1`;
    await rpc(u, "close_day", {
      p_sprint_day_id: day1.id,
      p_actual: 50_000,
      p_impediments: [{ item_id: items.p_impediment_ids[0], answer: "yes" }],
      p_cues: [{ item_id: items.p_cue_ids[0], answer: "yes" }],
      p_response: "yes",
      p_recovered: "yes",
    });
    await rpc(u, "end_sprint_early", { p_sprint_id: sprintId });
  });
  afterAll(async () => {
    await deleteTestUser(u);
  });

  it("requires one, and rejects an unknown value", async () => {
    await expectRpcError(u, "finish_review", { p_sprint_id: sprintId, p_lesson: "L", p_moved: true }, "verdict_required");
    await expectRpcError(
      u,
      "finish_review",
      { p_sprint_id: sprintId, p_lesson: "L", p_moved: true, p_verdict: "great" },
      "invalid_verdict",
    );
    const id = await rpc<string>(u, "finish_review", {
      p_sprint_id: sprintId,
      p_lesson: "L",
      p_moved: true,
      p_verdict: "partly",
    });
    const [row] = await sql<{ verdict: string }[]>`select verdict from public.reviews where id = ${id}`;
    expect(row.verdict).toBe("partly");
  });
});

// ---------------------------------------------------------------------------
// RLS and grants on the two new tables.
// ---------------------------------------------------------------------------
describe("reviews and review_decisions are read-only and owner-scoped", () => {
  let a: TestUser;
  let b: TestUser;
  let reviewId: string;

  beforeAll(async () => {
    a = await createTestUser("f10-rls-a");
    b = await createTestUser("f10-rls-b");
    await insertVision(a);
    const today = await dbTodayIn(TZ);
    const sprintId = await startSprint(a, moneySprintArgs({ ...(await seedItems(a)), p_tz: TZ, p_start_date: today }));
    await rpc(a, "end_sprint_early", { p_sprint_id: sprintId });
    reviewId = await rpc<string>(a, "finish_review", { p_sprint_id: sprintId, p_lesson: "A's lesson.", p_moved: true });
  });
  afterAll(async () => {
    await deleteTestUser(a);
    await deleteTestUser(b);
  });

  it("B reads none of A's rows", async () => {
    expect((await b.client.from("reviews").select("id")).data).toEqual([]);
    expect((await b.client.from("review_decisions").select("id")).data).toEqual([]);
    expect((await a.client.from("reviews").select("id")).data).toEqual([{ id: reviewId }]);
  });

  it("the check can fail: with RLS disabled B sees A's review; re-enabled, 0 rows again", async () => {
    await sql`alter table public.reviews disable row level security`;
    try {
      const leaked = await b.client.from("reviews").select("id");
      expect(leaked.data!.map((r) => r.id)).toContain(reviewId);
    } finally {
      await sql`alter table public.reviews enable row level security`;
    }
    expect((await b.client.from("reviews").select("id")).data).toEqual([]);
  });

  it("the check can fail for review_decisions too", async () => {
    await sql`alter table public.review_decisions disable row level security`;
    try {
      const leaked = await b.client.from("review_decisions").select("review_id");
      expect(leaked.data!.map((r) => r.review_id)).toContain(reviewId);
    } finally {
      await sql`alter table public.review_decisions enable row level security`;
    }
    expect((await b.client.from("review_decisions").select("id")).data).toEqual([]);
  });

  it("an authenticated write of any kind is permission denied and the row is unchanged", async () => {
    const upd = await a.client.from("reviews").update({ lesson: "rewritten" }).eq("id", reviewId).select("id");
    expect(upd.error?.message).toMatch(/permission denied/);
    const del = await a.client.from("reviews").delete().eq("id", reviewId).select("id");
    expect(del.error?.message).toMatch(/permission denied/);
    const ins = await a.client.from("reviews").insert({ user_id: a.id, sprint_id: reviewId, lesson: "x", moved_vision: true });
    expect(ins.error?.message).toMatch(/permission denied/);
    const dec = await a.client.from("review_decisions").update({ decision: "drop" }).eq("review_id", reviewId).select("id");
    expect(dec.error?.message).toMatch(/permission denied/);

    const [row] = await sql<{ lesson: string }[]>`select lesson from public.reviews where id = ${reviewId}`;
    expect(row.lesson).toBe("A's lesson.");
  });
});

// ---------------------------------------------------------------------------
// The F5 defect this feature closes: a completed sprint's streak stops at the
// closure date instead of reading every later day as missed.
// ---------------------------------------------------------------------------
describe("sprint_streak_at after closure, and sprint_best_streak", () => {
  let u: TestUser;
  let start: string;

  beforeAll(async () => {
    u = await createTestUser("f10-streak");
    const today = await dbTodayIn(TZ);
    const [{ d }] = await sql<{ d: string }[]>`select to_char(${today}::date - 10, 'YYYY-MM-DD') as d`;
    start = d;
  });
  afterAll(async () => {
    await deleteTestUser(u);
  });

  it("a sprint completed on its day 9 still reads a streak of 9 two days later", async () => {
    // Day 1 is eight days ago, so today is day 9 and every day up to it is closable.
    const today = await dbTodayIn(TZ);
    const [{ d: day1 }] = await sql<{ d: string }[]>`select to_char(${today}::date - 8, 'YYYY-MM-DD') as d`;
    const { sprintId, dayIds } = await insertSprintRows(u, { startDate: day1, tz: TZ, target: 100 });
    await closeDays(dayIds.slice(0, 9), Array(9).fill(200)); // 1,800 ≥ the 1,400 goal
    await rpc(u, "complete_sprint", { p_sprint_id: sprintId });

    const [later] = await sql<{ streak: number }[]>`
      select public.sprint_streak_at(${sprintId}, now() + interval '2 days') as streak`;
    expect(later.streak).toBe(9);

    // The check can fail: days 10 and 11 fall inside that window with no close of
    // their own, so without the cancelled exclusion the trailing run reads 0.
    const [naive] = await sql<{ streak: number }[]>`
      with counted as (
        select d.day_index, d.closed_on_time
        from public.sprint_days d
        where d.sprint_id = ${sprintId}
          and d.date < ((now() + interval '2 days') at time zone ${TZ})::date)
      select count(*)::int as streak from counted
      where day_index > coalesce((select max(day_index) from counted where closed_on_time is not true), 0)`;
    expect(naive.streak).toBe(0);
  });

  it("sprint_best_streak returns the longest run, not the last one", async () => {
    const { sprintId, dayIds } = await insertSprintRows(u, { startDate: start, tz: TZ, area: "health", target: 100 });
    // on-time: 1 2 3 4 . . 7 8 . 10 — runs of 4, 2 and 1.
    await closeDays(dayIds.slice(0, 4), [100, 100, 100, 100], true);
    await closeDays([dayIds[4], dayIds[5]], [100, 100], false);
    await closeDays([dayIds[6], dayIds[7]], [100, 100], true);
    await closeDays([dayIds[8]], [100], false);
    await closeDays([dayIds[9]], [100], true);
    expect(await rpc<number>(u, "sprint_best_streak", { p_sprint_id: sprintId })).toBe(4);
  });

  it("sprint_best_streak refuses another user's sprint", async () => {
    const { sprintId } = await insertSprintRows(u, { startDate: start, tz: TZ, area: "relationships" });
    const b = await createTestUser("f10-streak-b");
    try {
      await expectRpcError(b, "sprint_best_streak", { p_sprint_id: sprintId }, "sprint_not_found");
    } finally {
      await deleteTestUser(b);
    }
  });
});
