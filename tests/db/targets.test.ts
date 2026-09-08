import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { zoneOffUtcDate } from "../support/zones";
import { sameDailyTargets } from "@/lib/targets";
import {
  createTestUser,
  dbTodayIn,
  deleteTestUser,
  expectRpcError,
  insertVision,
  moneySprintArgs,
  rpc,
  seedItems,
  sql,
  startSprint,
  type TestUser,
} from "./helpers";

// A zone whose date differs from UTC's right now (tests/support/zones), so a lock
// computed in the server zone instead of the sprint zone would show up.
const TZ = zoneOffUtcDate();

/** Goal ÷ 14 for 8,000.00 USD with the remainder on the first days, in minor units. */
const SAME = sameDailyTargets(800_000, 100);

function withDay(base: number[], edits: Record<number, number>): number[] {
  return base.map((t, i) => edits[i + 1] ?? t);
}

async function targetsOf(sprintId: string): Promise<number[]> {
  const rows = await sql<{ target: string }[]>`select target from public.sprint_days where sprint_id = ${sprintId} order by day_index`;
  return rows.map((r) => Number(r.target));
}

describe("F3 targets: save_targets, locking, ownership", () => {
  let u: TestUser;
  let today: string;
  let tomorrow: string;

  beforeAll(async () => {
    u = await createTestUser("targets");
    today = await dbTodayIn(TZ);
    const [r] = await sql<{ t: string }[]>`select to_char(${today}::date + 1, 'YYYY-MM-DD') as t`;
    tomorrow = r.t;
  });

  afterAll(async () => {
    await deleteTestUser(u);
    await sql.end();
  });

  describe("a sprint that started today: day 1 is locked, 2–14 are open", () => {
    let sprintId: string;

    beforeAll(async () => {
      await insertVision(u);
      sprintId = await startSprint(u, moneySprintArgs({ ...(await seedItems(u)), p_tz: TZ, p_start_date: today }));
    });

    it("starts in 'same' mode with Goal ÷ 14", async () => {
      const [s] = await sql<{ target_mode: string }[]>`select target_mode from public.sprints where id = ${sprintId}`;
      expect(s.target_mode).toBe("same");
      expect(await targetsOf(sprintId)).toEqual(SAME);
    });

    it("rejects a plan whose targets do not sum to the goal (rule 11), leaving every row unchanged", async () => {
      const before = await targetsOf(sprintId);
      await expectRpcError(u, "save_targets", { p_sprint_id: sprintId, p_targets: withDay(SAME, { 7: 0 }) }, "targets_sum_mismatch");
      await expectRpcError(u, "save_targets", { p_sprint_id: sprintId, p_targets: withDay(SAME, { 7: SAME[6] + 100 }) }, "targets_sum_mismatch");
      expect(await targetsOf(sprintId)).toEqual(before);
    });

    it("rejects a negative target", async () => {
      // Sum still equals the goal: -100 on day 7, +100 on day 8.
      const plan = withDay(SAME, { 7: -100, 8: SAME[7] + SAME[6] + 100 });
      await expectRpcError(u, "save_targets", { p_sprint_id: sprintId, p_targets: plan }, "negative_target");
    });

    it("rejects a money target that is not a whole currency unit (precision)", async () => {
      const plan = withDay(SAME, { 7: SAME[6] - 50, 8: SAME[7] + 50 });
      await expectRpcError(u, "save_targets", { p_sprint_id: sprintId, p_targets: plan }, "target_precision");
    });

    it("rejects the wrong number of targets", async () => {
      await expectRpcError(u, "save_targets", { p_sprint_id: sprintId, p_targets: SAME.slice(0, 13) }, "invalid_targets");
      await expectRpcError(u, "save_targets", { p_sprint_id: sprintId, p_targets: [...SAME, 0] }, "invalid_targets");
    });

    it("rejects any change to today's target, even when the plan still balances (rule 10)", async () => {
      const before = await targetsOf(sprintId);
      const plan = withDay(SAME, { 1: SAME[0] - 100, 2: SAME[1] + 100 });
      await expectRpcError(u, "save_targets", { p_sprint_id: sprintId, p_targets: plan }, "target_locked");
      expect(await targetsOf(sprintId)).toEqual(before);
    });

    it("another user's save is 'not found', never a leak", async () => {
      const other = await createTestUser("targets-other");
      try {
        await expectRpcError(other, "save_targets", { p_sprint_id: sprintId, p_targets: SAME }, "sprint_not_found");
      } finally {
        await deleteTestUser(other);
      }
    });

    it("saves a balanced plan: zeroes day 7, loads day 8, keeps day 1, switches to 'custom'", async () => {
      const [before] = await sql<{ updated_at: Date }[]>`select updated_at from public.sprint_days where sprint_id = ${sprintId} and day_index = 7`;
      const plan = withDay(SAME, { 7: 0, 8: SAME[7] + SAME[6] });
      await rpc(u, "save_targets", { p_sprint_id: sprintId, p_targets: plan });
      expect(await targetsOf(sprintId)).toEqual(plan);
      expect(plan.reduce((a, b) => a + b, 0)).toBe(800_000);
      const [s] = await sql<{ target_mode: string }[]>`select target_mode from public.sprints where id = ${sprintId}`;
      expect(s.target_mode).toBe("custom");
      const [after] = await sql<{ updated_at: Date }[]>`select updated_at from public.sprint_days where sprint_id = ${sprintId} and day_index = 7`;
      expect(after.updated_at.getTime()).toBeGreaterThan(before.updated_at.getTime());
    });

    it("nothing was redistributed: only the two edited days changed (rule 12)", async () => {
      const now = await targetsOf(sprintId);
      const changed = now.map((t, i) => (t !== SAME[i] ? i + 1 : null)).filter((x) => x !== null);
      expect(changed).toEqual([7, 8]);
    });

    it("closing a day below target changes no future target (rule 13)", async () => {
      const before = await targetsOf(sprintId);
      const [d1] = await sql<{ id: string }[]>`select id from public.sprint_days where sprint_id = ${sprintId} and day_index = 1`;
      await rpc(u, "close_day", { p_sprint_day_id: d1.id, p_actual: 0, p_notes: null });
      expect(await targetsOf(sprintId)).toEqual(before);
    });

    it("the row trigger rejects a direct UPDATE of today's target for the postgres role (rule 10)", async () => {
      // Day 1 is now closed, so it reports day_closed; the trigger's own code is exercised
      // by the open-and-locked case below through a sprint whose today is open.
      await expect(sql`update public.sprint_days set target = 1 where sprint_id = ${sprintId} and day_index = 1`).rejects.toThrow(/day_closed/);
    });

    it("the row trigger allows a direct UPDATE of a future day's target (the function's own path)", async () => {
      await sql`update public.sprint_days set target = target where sprint_id = ${sprintId} and day_index = 14`;
    });

    it("authenticated has no column privilege to update target directly", async () => {
      const res = await u.client.from("sprint_days").update({ target: 1 }).eq("sprint_id", sprintId).eq("day_index", 14);
      expect(res.error).not.toBeNull();
      expect(res.error!.code).toBe("42501");
    });

    it("rejects a save once the sprint is no longer active", async () => {
      await sql`update public.sprints set status = 'ended_early' where id = ${sprintId}`;
      try {
        await expectRpcError(u, "save_targets", { p_sprint_id: sprintId, p_targets: await targetsOf(sprintId) }, "sprint_not_active");
      } finally {
        await sql`update public.sprints set status = 'active' where id = ${sprintId}`;
      }
    });
  });

  describe("row trigger on an open, begun day", () => {
    let sprintId: string;

    beforeAll(async () => {
      sprintId = await startSprint(u, moneySprintArgs({ ...(await seedItems(u)), p_area: "health", p_tz: TZ, p_start_date: today, p_amount: 1400 }));
    });

    it("rejects UPDATE of today's target with target_locked and leaves the row unchanged", async () => {
      const [before] = await sql`select * from public.sprint_days where sprint_id = ${sprintId} and day_index = 1`;
      await expect(sql`update public.sprint_days set target = 0 where sprint_id = ${sprintId} and day_index = 1`).rejects.toThrow(/target_locked/);
      const [after] = await sql`select * from public.sprint_days where sprint_id = ${sprintId} and day_index = 1`;
      expect(after).toEqual(before);
    });

    it("still lets the intention of today change (the lock is on target alone)", async () => {
      const res = await u.client.from("sprint_days").update({ intention: "Move the money" }).eq("sprint_id", sprintId).eq("day_index", 1).select("intention").single();
      expect(res.error).toBeNull();
      expect(res.data!.intention).toBe("Move the money");
    });

    it("the lock uses the sprint's zone: a day that is 'today' there but not in UTC is locked", async () => {
      // If the trigger compared against the server date (UTC), day 1 would be open or
      // locked on the wrong day; TZ is chosen so its date differs from UTC's right now.
      const [row] = await sql<{ sprint_day: string; utc_day: string; same: boolean }[]>`
        select to_char((now() at time zone ${TZ})::date, 'YYYY-MM-DD') as sprint_day,
               to_char((now() at time zone 'UTC')::date, 'YYYY-MM-DD') as utc_day,
               (now() at time zone ${TZ})::date = (now() at time zone 'UTC')::date as same`;
      expect(row.sprint_day).toBe(today);
      expect(row.same, `${TZ} should not share UTC's date at ${new Date().toISOString()}`).toBe(false);
      // The rule is evaluated in the sprint zone, whichever side of UTC's date it sits.
      await expect(sql`update public.sprint_days set target = 0 where sprint_id = ${sprintId} and day_index = 1`).rejects.toThrow(/target_locked/);
      expect(row.utc_day).not.toBe(row.sprint_day);
    });
  });

  describe("a sprint that starts tomorrow: all 14 days are editable", () => {
    let sprintId: string;

    beforeAll(async () => {
      sprintId = await startSprint(u, moneySprintArgs({ ...(await seedItems(u)), p_area: "relationships", p_tz: TZ, p_start_date: tomorrow }));
    });

    it("day 1 can move before the sprint begins", async () => {
      const plan = withDay(SAME, { 1: 0, 14: SAME[13] + SAME[0] });
      await rpc(u, "save_targets", { p_sprint_id: sprintId, p_targets: plan });
      expect(await targetsOf(sprintId)).toEqual(plan);
    });

    it("zero on every day but one is a valid plan", async () => {
      const plan = Array.from({ length: 14 }, (_, i) => (i === 13 ? 800_000 : 0));
      await rpc(u, "save_targets", { p_sprint_id: sprintId, p_targets: plan });
      expect(await targetsOf(sprintId)).toEqual(plan);
    });
  });

  describe("start_sprint with a custom plan and pre-planned intentions", () => {
    let u2: TestUser;

    beforeAll(async () => {
      u2 = await createTestUser("targets-setup");
      await insertVision(u2);
    });

    afterAll(async () => {
      await deleteTestUser(u2);
    });

    it("rejects a custom plan that does not total the goal (rule 11 at setup) and creates nothing", async () => {
      const items = await seedItems(u2);
      await expectRpcError(u2, "start_sprint", moneySprintArgs({ ...items, p_tz: TZ, p_start_date: today, p_targets: withDay(SAME, { 3: 0 }) }), "targets_sum_mismatch");
      await expectRpcError(u2, "start_sprint", moneySprintArgs({ ...items, p_tz: TZ, p_start_date: today, p_targets: SAME.slice(0, 13) }), "invalid_targets");
      const [c] = await sql<{ n: string }[]>`select count(*) as n from public.sprints where user_id = ${u2.id}`;
      expect(Number(c.n)).toBe(0);
    });

    it("starts in 'custom' mode with the given targets and per-day intentions; today's target locks at start", async () => {
      const items = await seedItems(u2);
      const plan = withDay(SAME, { 1: 0, 2: SAME[1] + SAME[0] });
      const intentions = Array.from({ length: 14 }, (_, i) => (i === 0 ? "  Day one  " : i === 2 ? "Day three" : i === 5 ? "   " : null));
      const id = await startSprint(u2, moneySprintArgs({ ...items, p_tz: TZ, p_start_date: today, p_targets: plan, p_intentions: intentions, p_intention: "ignored when p_intentions[1] is set" }));

      const [s] = await sql<{ target_mode: string }[]>`select target_mode from public.sprints where id = ${id}`;
      expect(s.target_mode).toBe("custom");
      expect(await targetsOf(id)).toEqual(plan);

      const days = await sql<{ day_index: number; intention: string | null }[]>`select day_index, intention from public.sprint_days where sprint_id = ${id} order by day_index`;
      expect(days.map((d) => d.intention)).toEqual(["Day one", null, "Day three", null, null, null, null, null, null, null, null, null, null, null]);

      // Today began, so its (zero) target is now locked.
      await expectRpcError(u2, "save_targets", { p_sprint_id: id, p_targets: withDay(plan, { 1: 100, 2: plan[1] - 100 }) }, "target_locked");
    });

    it("p_intention still fills day 1 when p_intentions is absent", async () => {
      const items = await seedItems(u2);
      const id = await startSprint(u2, moneySprintArgs({ ...items, p_area: "health", p_tz: TZ, p_start_date: today, p_intention: "Only day one" }));
      const days = await sql<{ intention: string | null }[]>`select intention from public.sprint_days where sprint_id = ${id} order by day_index`;
      expect(days[0].intention).toBe("Only day one");
      expect(days.slice(1).every((d) => d.intention === null)).toBe(true);
    });
  });

  describe("ownership of `target` (rules 12–14)", () => {
    it("save_targets is the only function that UPDATEs sprint_days.target; start_sprint alone INSERTs it", async () => {
      const fns = await sql<{ proname: string; prosrc: string }[]>`
        select proname, prosrc from pg_proc where pronamespace = 'public'::regnamespace`;
      const updaters = fns
        .filter((f) => /update\s+public\.sprint_days\b[\s\S]*?\bset\b[\s\S]*?\btarget\s*=/i.test(f.prosrc))
        .map((f) => f.proname)
        .sort();
      expect(updaters).toEqual(["save_targets"]);
      const inserters = fns
        .filter((f) => /insert\s+into\s+public\.sprint_days\s*\([^)]*\btarget\b/i.test(f.prosrc))
        .map((f) => f.proname)
        .sort();
      expect(inserters).toEqual(["start_sprint"]);
    });

    it("no trigger on sprint_days or sprints writes a target", async () => {
      const rows = await sql<{ tgname: string; prosrc: string }[]>`
        select t.tgname, p.prosrc from pg_trigger t
        join pg_proc p on p.oid = t.tgfoid
        where t.tgrelid in ('public.sprint_days'::regclass, 'public.sprints'::regclass) and not t.tgisinternal`;
      expect(rows.length).toBeGreaterThan(0);
      const writers = rows.filter((r) => /new\.target\s*:?=/i.test(r.prosrc)).map((r) => r.tgname);
      expect(writers).toEqual([]);
    });

    it("no scheduled job exists that could touch a plan", async () => {
      const [ext] = await sql<{ n: string }[]>`select count(*) as n from pg_extension where extname = 'pg_cron'`;
      if (Number(ext.n) === 0) return;
      const jobs = await sql<{ command: string }[]>`select command from cron.job`;
      expect(jobs.filter((j) => /sprint_days/i.test(j.command))).toEqual([]);
    });
  });
});
