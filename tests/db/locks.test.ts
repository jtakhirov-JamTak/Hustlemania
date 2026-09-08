import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestUser,
  dbTodayIn,
  deleteTestUser,
  expectRpcError,
  insertVision,
  moneySprintArgs,
  seedItems,
  sql,
  startSprint,
  type TestUser,
} from "./helpers";

const TZ = "America/Los_Angeles";

describe("locks: sprint after start, day after close", () => {
  let u: TestUser;
  let sprintId: string;
  let day1: string;
  let day2: string;

  beforeAll(async () => {
    u = await createTestUser("locks");
    await insertVision(u);
    sprintId = await startSprint(u, moneySprintArgs({ ...(await seedItems(u)), p_tz: TZ, p_start_date: await dbTodayIn(TZ), p_amount: 1400 }));
    const days = await sql<{ id: string; day_index: number }[]>`
      select id, day_index from public.sprint_days where sprint_id = ${sprintId} order by day_index`;
    day1 = days[0].id;
    day2 = days[1].id;
  });

  afterAll(async () => {
    await deleteTestUser(u);
    await sql.end();
  });

  describe("sprints_lock_after_start (rules 8–9)", () => {
    it.each([
      ["amount", "1"],
      ["measurement", "'hours'"],
      ["currency", "'EUR'"],
      ["unit", "'reps'"],
      ["start_date", "start_date + 1"],
      ["tz", "'UTC'"],
    ])("rejects UPDATE of %s even for the postgres role, and the row is unchanged", async (column, value) => {
      const [before] = await sql`select * from public.sprints where id = ${sprintId}`;
      await expect(sql.unsafe(`update public.sprints set ${column} = ${value} where id = '${sprintId}'`)).rejects.toThrow(/sprint_locked/);
      const [after] = await sql`select * from public.sprints where id = ${sprintId}`;
      expect(after).toEqual(before);
    });

    it("still allows the mantra to change, and bumps updated_at", async () => {
      const [before] = await sql<{ updated_at: Date }[]>`select updated_at from public.sprints where id = ${sprintId}`;
      const res = await u.client.from("sprints").update({ mantra: "New mantra" }).eq("id", sprintId).select("mantra").single();
      expect(res.error).toBeNull();
      expect(res.data!.mantra).toBe("New mantra");
      const [after] = await sql<{ updated_at: Date }[]>`select updated_at from public.sprints where id = ${sprintId}`;
      expect(after.updated_at.getTime()).toBeGreaterThan(before.updated_at.getTime());
    });

    it("authenticated has no column privilege to update amount directly", async () => {
      const res = await u.client.from("sprints").update({ amount: 1 }).eq("id", sprintId);
      expect(res.error).not.toBeNull();
      expect(res.error!.code).toBe("42501"); // insufficient_privilege
    });
  });

  describe("close_day and sprint_days_immutable_after_close (rule 17)", () => {
    it("intention can be saved on an open day", async () => {
      const res = await u.client.from("sprint_days").update({ intention: "Today I will" }).eq("id", day1).select("intention").single();
      expect(res.error).toBeNull();
      expect(res.data!.intention).toBe("Today I will");
    });

    it("rejects a future day", async () => {
      await expectRpcError(u, "close_day", { p_sprint_day_id: day2, p_actual: 10, p_notes: null }, "day_in_future");
    });

    it("rejects a negative actual", async () => {
      await expectRpcError(u, "close_day", { p_sprint_day_id: day1, p_actual: -1, p_notes: null }, "invalid_actual");
    });

    it("closes day 1 with actual and trimmed notes", async () => {
      const res = await u.client.rpc("close_day", { p_sprint_day_id: day1, p_actual: 0, p_notes: "  a truthful zero  " });
      expect(res.error).toBeNull();
      expect(res.error).toBeNull();
      const [row] = await sql<{ actual: string; notes: string; closed_at: Date | null }[]>`
        select actual, notes, closed_at from public.sprint_days where id = ${day1}`;
      expect(Number(row.actual)).toBe(0);
      expect(row.notes).toBe("a truthful zero");
      expect(row.closed_at).not.toBeNull();
    });

    it("a second close_day call is rejected", async () => {
      await expectRpcError(u, "close_day", { p_sprint_day_id: day1, p_actual: 50, p_notes: null }, "day_closed");
    });

    it("another user's close_day on this day is 'not found', never a leak", async () => {
      const other = await createTestUser("locks-other");
      try {
        await expectRpcError(other, "close_day", { p_sprint_day_id: day1, p_actual: 5, p_notes: null }, "day_not_found");
      } finally {
        await deleteTestUser(other);
      }
    });

    it.each([
      ["actual", "99"],
      ["intention", "'rewritten'"],
      ["notes", "'rewritten'"],
      ["closed_at", "null"],
      ["target", "target + 1"],
      ["proof_recover", "'x'"],
      ["response", "'yes'"],
      ["recovered", "'yes'"],
      ["impact", "'some'"],
    ])("rejects direct UPDATE of %s on the closed row (postgres role) and leaves it unchanged", async (column, value) => {
      const [before] = await sql`select * from public.sprint_days where id = ${day1}`;
      await expect(sql.unsafe(`update public.sprint_days set ${column} = ${value} where id = '${day1}'`)).rejects.toThrow(/day_closed/);
      const [after] = await sql`select * from public.sprint_days where id = ${day1}`;
      expect(after).toEqual(before);
    });

    it("the owner cannot change the intention of a closed day through the API", async () => {
      const res = await u.client.from("sprint_days").update({ intention: "late edit" }).eq("id", day1);
      expect(res.error).not.toBeNull();
      expect(res.error!.message).toMatch(/day_closed/);
    });

    it("authenticated has no column privilege to set actual or closed_at directly", async () => {
      const res = await u.client.from("sprint_days").update({ actual: 5 }).eq("id", day2);
      expect(res.error).not.toBeNull();
      expect(res.error!.code).toBe("42501");
    });

    it("day_index and date never change, closed or not", async () => {
      await expect(sql`update public.sprint_days set day_index = 3 where id = ${day2}`).rejects.toThrow(/sprint_day_locked/);
    });
  });
});
