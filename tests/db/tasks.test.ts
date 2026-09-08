import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestUser,
  dbTodayIn,
  deleteTestUser,
  insertVision,
  moneySprintArgs,
  seedItems,
  sql,
  startSprint,
  type TestUser,
} from "./helpers";

const TZ = "America/Los_Angeles";

/**
 * F4 — tasks (PRD §8, rules 15–17). Falsifiability, run 2026-09-05: RLS off on
 * `tasks` let user B read A's rows; the lock trigger dropped let a task land on the
 * closed day; the anchor check removed let a task move to another day; a function that
 * copies tasks forward turned the rule-16 scan red. Each restored and green again.
 */
describe("tasks", () => {
  let a: TestUser;
  let b: TestUser;
  let sprintId: string;
  let day1: string;
  let day2: string;
  let bDay1: string;

  beforeAll(async () => {
    a = await createTestUser("tasks-a");
    b = await createTestUser("tasks-b");
    await insertVision(a);
    await insertVision(b);
    const today = await dbTodayIn(TZ);
    sprintId = await startSprint(a, moneySprintArgs({ ...(await seedItems(a)), p_tz: TZ, p_start_date: today, p_amount: 1400 }));
    const bSprint = await startSprint(b, moneySprintArgs({ ...(await seedItems(b)), p_tz: TZ, p_start_date: today, p_amount: 1400 }));
    const days = await sql<{ id: string; day_index: number }[]>`
      select id, day_index from public.sprint_days where sprint_id = ${sprintId} order by day_index`;
    day1 = days[0].id;
    day2 = days[1].id;
    const [bd] = await sql<{ id: string }[]>`select id from public.sprint_days where sprint_id = ${bSprint} and day_index = 1`;
    bDay1 = bd.id;
  });

  afterAll(async () => {
    await deleteTestUser(a);
    await deleteTestUser(b);
    await sql.end();
  });

  describe("a day's task list (autosave surface)", () => {
    let taskId: string;

    it("the owner inserts a task on an open day; done defaults to false", async () => {
      const res = await a.client.from("tasks").insert({ user_id: a.id, sprint_day_id: day1, text: "Call the bank" }).select("*").single();
      expect(res.error).toBeNull();
      expect(res.data!.done).toBe(false);
      expect(res.data!.archived_at).toBeNull();
      taskId = res.data!.id;
    });

    it("a blank task is rejected by the check constraint", async () => {
      const res = await a.client.from("tasks").insert({ user_id: a.id, sprint_day_id: day1, text: "   " }).select("id");
      expect(res.error).not.toBeNull();
      expect(res.error!.message).toMatch(/tasks_text_check/);
    });

    it("text and done can be edited; updated_at moves", async () => {
      const [before] = await sql<{ updated_at: Date }[]>`select updated_at from public.tasks where id = ${taskId}`;
      const res = await a.client.from("tasks").update({ text: "Call the bank about the fee", done: true }).eq("id", taskId).select("text, done").single();
      expect(res.error).toBeNull();
      expect(res.data).toEqual({ text: "Call the bank about the fee", done: true });
      const [after] = await sql<{ updated_at: Date }[]>`select updated_at from public.tasks where id = ${taskId}`;
      expect(after.updated_at.getTime()).toBeGreaterThan(before.updated_at.getTime());
    });

    it("remove is archived_at, and the row survives", async () => {
      const res = await a.client.from("tasks").update({ archived_at: new Date().toISOString() }).eq("id", taskId).select("archived_at").single();
      expect(res.error).toBeNull();
      expect(res.data!.archived_at).not.toBeNull();
      const [row] = await sql<{ n: number }[]>`select count(*)::int as n from public.tasks where id = ${taskId}`;
      expect(row.n).toBe(1);
    });

    it("authenticated has no DELETE privilege on tasks (history is kept)", async () => {
      const res = await a.client.from("tasks").delete().eq("id", taskId);
      expect(res.error).not.toBeNull();
      expect(res.error!.code).toBe("42501");
    });

    it("authenticated cannot move a task to another day (no column privilege)", async () => {
      const res = await a.client.from("tasks").update({ sprint_day_id: day2 }).eq("id", taskId);
      expect(res.error).not.toBeNull();
      expect(res.error!.code).toBe("42501");
    });

    it("the postgres role cannot move a task either (task_locked), and the row is unchanged", async () => {
      const [before] = await sql`select * from public.tasks where id = ${taskId}`;
      await expect(sql`update public.tasks set sprint_day_id = ${day2} where id = ${taskId}`).rejects.toThrow(/task_locked/);
      await expect(sql`update public.tasks set user_id = ${b.id} where id = ${taskId}`).rejects.toThrow(/task_locked/);
      const [after] = await sql`select * from public.tasks where id = ${taskId}`;
      expect(after).toEqual(before);
    });
  });

  describe("RLS: rows are private to their owner", () => {
    let aTask: string;

    beforeAll(async () => {
      const res = await a.client.from("tasks").insert({ user_id: a.id, sprint_day_id: day1, text: "Private to A" }).select("id").single();
      if (res.error) throw new Error(res.error.message);
      aTask = res.data.id;
    });

    it("user B sees none of A's tasks", async () => {
      const res = await b.client.from("tasks").select("id").eq("sprint_day_id", day1);
      expect(res.error).toBeNull();
      expect(res.data).toEqual([]);
    });

    it("user B cannot edit or archive A's task (0 rows, no error leak)", async () => {
      const res = await b.client.from("tasks").update({ done: true, archived_at: new Date().toISOString() }).eq("id", aTask).select("id");
      expect(res.error).toBeNull();
      expect(res.data).toEqual([]);
      const [row] = await sql<{ done: boolean; archived_at: Date | null }[]>`select done, archived_at from public.tasks where id = ${aTask}`;
      expect(row).toEqual({ done: false, archived_at: null });
    });

    it("user B cannot insert a task as A (the lock trigger runs before WITH CHECK and cannot see A's day)", async () => {
      const res = await b.client.from("tasks").insert({ user_id: a.id, sprint_day_id: day1, text: "forged" }).select("id");
      expect(res.error).not.toBeNull();
      expect(res.error!.message).toMatch(/day_not_found/);
      const [row] = await sql<{ n: number }[]>`select count(*)::int as n from public.tasks where text = 'forged'`;
      expect(row.n).toBe(0);
    });

    it("user B cannot attach their own task to A's day: 'day_not_found', never 'day_closed'", async () => {
      const res = await b.client.from("tasks").insert({ user_id: b.id, sprint_day_id: day1, text: "squatting" }).select("id");
      expect(res.error).not.toBeNull();
      expect(res.error!.message).toMatch(/day_not_found/);
      const [row] = await sql<{ n: number }[]>`select count(*)::int as n from public.tasks where sprint_day_id = ${day1} and user_id = ${b.id}`;
      expect(row.n).toBe(0);
    });

    it("even the postgres role cannot file B's task under A's day (the trigger's ownership check, not RLS)", async () => {
      await expect(
        sql`insert into public.tasks (user_id, sprint_day_id, text) values (${b.id}, ${day1}, 'superuser squatting')`,
      ).rejects.toThrow(/day_not_found/);
    });

    it("B's own day accepts B's task", async () => {
      const res = await b.client.from("tasks").insert({ user_id: b.id, sprint_day_id: bDay1, text: "B's task" }).select("id").single();
      expect(res.error).toBeNull();
    });

    it("with RLS disabled B would see A's tasks — so the 0 rows above measured the policy", async () => {
      await sql`alter table public.tasks disable row level security`;
      try {
        const res = await b.client.from("tasks").select("id").eq("sprint_day_id", day1);
        expect(res.error).toBeNull();
        expect(res.data!.length).toBeGreaterThan(0);
      } finally {
        await sql`alter table public.tasks enable row level security`;
      }
      const again = await b.client.from("tasks").select("id").eq("sprint_day_id", day1);
      expect(again.data).toEqual([]);
    });
  });

  describe("rule 15: completion changes nothing about the goal", () => {
    it("completing every task leaves the sprint row and all 14 day rows byte-identical", async () => {
      await a.client.from("tasks").insert([
        { user_id: a.id, sprint_day_id: day1, text: "One" },
        { user_id: a.id, sprint_day_id: day1, text: "Two" },
        { user_id: a.id, sprint_day_id: day2, text: "Three" },
      ]);
      const sprintBefore = await sql`select * from public.sprints where id = ${sprintId}`;
      const daysBefore = await sql`select * from public.sprint_days where sprint_id = ${sprintId} order by day_index`;

      const res = await a.client.from("tasks").update({ done: true }).is("archived_at", null).select("id");
      expect(res.error).toBeNull();
      expect(res.data!.length).toBeGreaterThanOrEqual(3);
      const [open] = await sql<{ n: number }[]>`
        select count(*)::int as n from public.tasks where user_id = ${a.id} and archived_at is null and not done`;
      expect(open.n).toBe(0);

      const sprintAfter = await sql`select * from public.sprints where id = ${sprintId}`;
      const daysAfter = await sql`select * from public.sprint_days where sprint_id = ${sprintId} order by day_index`;
      expect(sprintAfter).toEqual(sprintBefore);
      expect(daysAfter).toEqual(daysBefore);
      expect(sprintAfter[0].status).toBe("active");
      expect(daysAfter.every((d) => d.actual === null && d.closed_at === null)).toBe(true);
    });
  });

  describe("rule 16: nothing rolls over", () => {
    it("no function in public reads or writes public.tasks", async () => {
      const fns = await sql<{ proname: string; prosrc: string }[]>`
        select proname, prosrc from pg_proc where pronamespace = 'public'::regnamespace`;
      expect(fns.length).toBeGreaterThan(0);
      const touching = fns.filter((f) => /\bpublic\.tasks\b/i.test(f.prosrc)).map((f) => f.proname);
      expect(touching).toEqual([]);
    });

    it("the only triggers on tasks are updated_at and the lock", async () => {
      const rows = await sql<{ tgname: string }[]>`
        select tgname from pg_trigger where tgrelid = 'public.tasks'::regclass and not tgisinternal order by 1`;
      expect(rows.map((r) => r.tgname)).toEqual(["tasks_lock_with_day", "tasks_set_updated_at"]);
    });

    it("no trigger on sprint_days or sprints touches tasks (closing a day copies nothing forward)", async () => {
      const rows = await sql<{ tgname: string; prosrc: string }[]>`
        select t.tgname, p.prosrc from pg_trigger t
        join pg_proc p on p.oid = t.tgfoid
        where t.tgrelid in ('public.sprint_days'::regclass, 'public.sprints'::regclass) and not t.tgisinternal`;
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.filter((r) => /\btasks\b/i.test(r.prosrc)).map((r) => r.tgname)).toEqual([]);
    });

    it("no scheduled job touches tasks", async () => {
      const [ext] = await sql<{ n: string }[]>`select count(*) as n from pg_extension where extname = 'pg_cron'`;
      if (Number(ext.n) === 0) return;
      const jobs = await sql<{ command: string }[]>`select command from cron.job`;
      expect(jobs.filter((j) => /tasks/i.test(j.command))).toEqual([]);
    });

    it("closing day 1 with open tasks leaves day 2's list exactly as it was", async () => {
      const before = await sql<{ id: string; text: string; done: boolean }[]>`
        select id, text, done from public.tasks where sprint_day_id = ${day2} order by created_at, id`;
      await a.client.from("tasks").insert({ user_id: a.id, sprint_day_id: day1, text: "Still open at close" });
      const res = await a.client.rpc("close_day", { p_sprint_day_id: day1, p_actual: 100, p_notes: null });
      expect(res.error).toBeNull();
      const after = await sql<{ id: string; text: string; done: boolean }[]>`
        select id, text, done from public.tasks where sprint_day_id = ${day2} order by created_at, id`;
      expect(after).toEqual(before);
      const [n] = await sql<{ n: number }[]>`select count(*)::int as n from public.tasks where sprint_day_id = ${day1} and text = 'Still open at close'`;
      expect(n.n).toBe(1);
    });
  });

  describe("rule 17: tasks lock with the closed day", () => {
    let lockedTask: string;

    beforeAll(async () => {
      const [row] = await sql<{ id: string }[]>`
        select id from public.tasks where sprint_day_id = ${day1} and text = 'Still open at close'`;
      lockedTask = row.id;
    });

    it("the owner cannot add a task to the closed day", async () => {
      const res = await a.client.from("tasks").insert({ user_id: a.id, sprint_day_id: day1, text: "late add" }).select("id");
      expect(res.error).not.toBeNull();
      expect(res.error!.message).toMatch(/day_closed/);
    });

    it.each([
      ["text", "'rewritten'"],
      ["done", "true"],
      ["archived_at", "now()"],
    ])("rejects UPDATE of %s on the closed day's task for the postgres role, row unchanged", async (column, value) => {
      const [before] = await sql`select * from public.tasks where id = ${lockedTask}`;
      await expect(sql.unsafe(`update public.tasks set ${column} = ${value} where id = '${lockedTask}'`)).rejects.toThrow(/day_closed/);
      const [after] = await sql`select * from public.tasks where id = ${lockedTask}`;
      expect(after).toEqual(before);
    });

    it("the owner cannot complete or remove a task on the closed day through the API", async () => {
      const done = await a.client.from("tasks").update({ done: true }).eq("id", lockedTask);
      expect(done.error).not.toBeNull();
      expect(done.error!.message).toMatch(/day_closed/);
      const gone = await a.client.from("tasks").update({ archived_at: new Date().toISOString() }).eq("id", lockedTask);
      expect(gone.error).not.toBeNull();
      expect(gone.error!.message).toMatch(/day_closed/);
    });

    it("the postgres role cannot insert onto the closed day either", async () => {
      await expect(
        sql`insert into public.tasks (user_id, sprint_day_id, text) values (${a.id}, ${day1}, 'superuser late add')`,
      ).rejects.toThrow(/day_closed/);
    });

    it("day 2 is still open for tasks", async () => {
      const res = await a.client.from("tasks").insert({ user_id: a.id, sprint_day_id: day2, text: "Tomorrow's task" }).select("id").single();
      expect(res.error).toBeNull();
    });
  });
});
