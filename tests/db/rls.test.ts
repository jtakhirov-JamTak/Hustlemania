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

/**
 * Row isolation between two users on visions, sprints and sprint_days.
 *
 * Falsifiability: the last test disables RLS on each table inside the run, proves the
 * other user then sees the rows, and re-enables it. That is what makes "0 rows" a
 * measurement of RLS rather than of an empty table. (Run 2026-09-05: with RLS
 * disabled B saw A's rows on all three tables; re-enabled, 0 rows.)
 */
describe("RLS isolation", () => {
  let a: TestUser;
  let b: TestUser;
  let sprintId: string;
  let impedimentId: string;

  beforeAll(async () => {
    a = await createTestUser("rls-a");
    b = await createTestUser("rls-b");
    await insertVision(a, "wealth");
    const items = await seedItems(a);
    impedimentId = items.p_highest_impediment_id;
    sprintId = await startSprint(a, moneySprintArgs({ ...items, p_start_date: await dbTodayIn("America/Los_Angeles") }));
  });

  afterAll(async () => {
    await deleteTestUser(a);
    await deleteTestUser(b);
    await sql.end();
  });

  it("the owner sees their vision, sprint and 14 days", async () => {
    const v = await a.client.from("visions").select("id");
    const s = await a.client.from("sprints").select("id");
    const d = await a.client.from("sprint_days").select("id").eq("sprint_id", sprintId);
    expect(v.error).toBeNull();
    expect(s.error).toBeNull();
    expect(d.error).toBeNull();
    expect(v.data).toHaveLength(1);
    expect(s.data).toHaveLength(1);
    expect(d.data).toHaveLength(14);
  });

  it("user B selecting user A's rows gets 0 rows on every table", async () => {
    const v = await b.client.from("visions").select("id");
    const s = await b.client.from("sprints").select("id").eq("id", sprintId);
    const d = await b.client.from("sprint_days").select("id").eq("sprint_id", sprintId);
    expect(v.error).toBeNull();
    expect(s.error).toBeNull();
    expect(d.error).toBeNull();
    expect(v.data).toEqual([]);
    expect(s.data).toEqual([]);
    expect(d.data).toEqual([]);
  });

  it("user B cannot update A's mantra or intention (0 rows affected, no error leak)", async () => {
    const s = await b.client.from("sprints").update({ mantra: "hijacked" }).eq("id", sprintId).select("id");
    expect(s.error).toBeNull();
    expect(s.data).toEqual([]);
    const d = await b.client.from("sprint_days").update({ intention: "hijacked" }).eq("sprint_id", sprintId).select("id");
    expect(d.error).toBeNull();
    expect(d.data).toEqual([]);

    const [row] = await sql<{ mantra: string; n: number }[]>`
      select s.mantra, (select count(*)::int from public.sprint_days where sprint_id = s.id and intention = 'hijacked') as n
      from public.sprints s where s.id = ${sprintId}`;
    expect(row.mantra).not.toBe("hijacked");
    expect(row.n).toBe(0);
  });

  it("user B cannot update A's vision body or impediment proof (0 rows affected, rows unchanged)", async () => {
    const v = await b.client.from("visions").update({ body: "hijacked" }).eq("user_id", a.id).select("id");
    expect(v.error).toBeNull();
    expect(v.data).toEqual([]);
    const i = await b.client.from("impediments").update({ proof_when: "hijacked", name: "hijacked" }).eq("id", impedimentId).select("id");
    expect(i.error).toBeNull();
    expect(i.data).toEqual([]);

    const [row] = await sql<{ v: number; i: number }[]>`
      select (select count(*)::int from public.visions where user_id = ${a.id} and body = 'hijacked') as v,
             (select count(*)::int from public.impediments where id = ${impedimentId} and (name = 'hijacked' or proof_when = 'hijacked')) as i`;
    expect(row).toEqual({ v: 0, i: 0 });
  });

  it("user B cannot insert a vision as A", async () => {
    const res = await b.client.from("visions").insert({ user_id: a.id, area: "health", body: "forged" }).select("id");
    expect(res.error).not.toBeNull();
    expect(res.data).toBeNull();
  });

  // Note: dropping the SELECT policy would NOT leak — RLS with no policy denies all.
  // The mutation that proves the isolation is RLS itself is disabling RLS on the table.
  it.each(["visions", "sprints", "sprint_days", "impediments"])(
    "disabling RLS on %s leaks A's rows to B; re-enabling hides them again",
    async (table) => {
      await sql.unsafe(`alter table public.${table} disable row level security`);
      try {
        const leaked = await b.client.from(table).select("id");
        expect(leaked.error).toBeNull();
        expect(leaked.data!.length).toBeGreaterThan(0);
      } finally {
        await sql.unsafe(`alter table public.${table} enable row level security`);
      }
      const hidden = await b.client.from(table).select("id");
      expect(hidden.error).toBeNull();
      expect(hidden.data).toEqual([]);
    },
  );
});
