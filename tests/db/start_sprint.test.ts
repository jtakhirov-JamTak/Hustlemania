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
  seedItems,
  sql,
  type SprintItems,
  startSprint,
  type TestUser,
} from "./helpers";

// A zone 14 hours ahead of UTC, so "today" here differs from UTC for most of the day
// and the today/tomorrow check is exercised against the sprint zone, not the server's.
const TZ = zoneOffUtcDate();

describe("start_sprint", () => {
  let u: TestUser;
  let today: string;
  let tomorrow: string;
  let dayAfter: string;
  let yesterday: string;
  let items: SprintItems;

  beforeAll(async () => {
    u = await createTestUser("start");
    items = await seedItems(u);
    today = await dbTodayIn(TZ);
    const [r] = await sql<{ t: string; d: string; y: string }[]>`
      select to_char(${today}::date + 1, 'YYYY-MM-DD') as t,
             to_char(${today}::date + 2, 'YYYY-MM-DD') as d,
             to_char(${today}::date - 1, 'YYYY-MM-DD') as y`;
    tomorrow = r.t;
    dayAfter = r.d;
    yesterday = r.y;
  });

  afterAll(async () => {
    await deleteTestUser(u);
    await sql.end();
  });

  it("rejects when the area has no active vision (rule 2)", async () => {
    await expectRpcError(u, "start_sprint", moneySprintArgs({ ...items, p_tz: TZ, p_start_date: today }), "no_active_vision");
  });

  it("creates the sprint and exactly 14 days whose targets sum to the goal", async () => {
    await insertVision(u);
    const id = await startSprint(u, moneySprintArgs({ ...items, p_tz: TZ, p_start_date: today, p_amount: 10_000, p_intention: "  Move the money  " }));

    const s = await u.client.from("sprints").select("*").eq("id", id).single();
    expect(s.error).toBeNull();
    expect(s.data.status).toBe("active");
    expect(s.data.tz).toBe(TZ);
    expect(s.data.start_date).toBe(today);
    expect(s.data.end_date).toBe(await plusDays(today, 13));

    const d = await u.client.from("sprint_days").select("day_index, date, target, intention, closed_at, actual").eq("sprint_id", id).order("day_index");
    expect(d.error).toBeNull();
    expect(d.data).toHaveLength(14);
    expect(d.data!.map((x) => x.day_index)).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
    expect(d.data!.reduce((acc, x) => acc + Number(x.target), 0)).toBe(10_000);
    expect(d.data!.map((x) => Number(x.target))).toEqual(sameDailyTargets(10_000, 100));
    expect(d.data![0].intention).toBe("Move the money");
    expect(d.data![1].intention).toBeNull();
    expect(d.data!.every((x) => x.closed_at === null && x.actual === null)).toBe(true);
    expect(d.data![13].date).toBe(await plusDays(today, 13));
  });

  it("rejects a second active sprint in the same area (rule 1)", async () => {
    await expectRpcError(u, "start_sprint", moneySprintArgs({ ...items, p_tz: TZ, p_start_date: today }), "active_sprint_exists");
  });

  it("the partial unique index also rejects a direct duplicate insert (rule 1, belt and braces)", async () => {
    const [{ id: visionId }] = await sql<{ id: string }[]>`select id from public.visions where user_id = ${u.id} and archived_at is null`;
    await expect(
      sql`insert into public.sprints (user_id, vision_id, area, outcome, measurement, currency, amount, confidence, celebration, mantra, tz, start_date, end_date)
          values (${u.id}, ${visionId}, 'wealth', 'dup', 'money', 'USD', 1, 5, 'c', 'm', ${TZ}, ${today}, ${today}::date + 13)`,
    ).rejects.toThrow(/sprints_one_active_per_area/);
  });

  it("SQL and TypeScript agree on the same-daily distribution for the SPEC table", async () => {
    for (const goal of [14, 15, 27, 100, 1]) {
      const [row] = await sql<{ t: string[] }[]>`select public.same_daily_targets(${goal}::bigint, 1) as t`;
      expect(row.t.map(Number)).toEqual(sameDailyTargets(goal));
      expect(row.t.map(Number).reduce((a, b) => a + b, 0)).toBe(goal);
    }
    // Money: the same goals in whole currency units (× 100 minor), spread in steps of 100.
    for (const goal of [14, 15, 27, 100, 1]) {
      const [row] = await sql<{ t: string[] }[]>`select public.same_daily_targets(${goal * 100}::bigint, 100) as t`;
      expect(row.t.map(Number)).toEqual(sameDailyTargets(goal * 100, 100));
      expect(row.t.map(Number).every((x) => x % 100 === 0)).toBe(true);
    }
  });

  it("rejects a money amount that is not a whole currency unit", async () => {
    // F9: the one vision covers every Area, so relationships is unlocked by the wealth vision above.
    await expectRpcError(u, "start_sprint", moneySprintArgs({ ...items, p_area: "relationships", p_tz: TZ, p_start_date: today, p_amount: 150 }), "invalid_amount");
  });

  describe("setup validation (health area)", () => {
    const base = () => moneySprintArgs({ ...items, p_area: "health", p_tz: TZ, p_start_date: today });

    it("accepts tomorrow but rejects yesterday and the day after tomorrow", async () => {
      await expectRpcError(u, "start_sprint", { ...base(), p_start_date: yesterday }, "invalid_start_date");
      await expectRpcError(u, "start_sprint", { ...base(), p_start_date: dayAfter }, "invalid_start_date");
      // Tomorrow is valid: prove it by starting, then confirm the dates, then clean up.
      const id = await startSprint(u, { ...base(), p_start_date: tomorrow });
      try {
        const s = await u.client.from("sprints").select("start_date, end_date").eq("id", id).single();
        expect(s.data!.start_date).toBe(tomorrow);
        expect(s.data!.end_date).toBe(await plusDays(tomorrow, 13));
      } finally {
        await sql`delete from public.sprints where id = ${id}`;
      }
    });

    it("rejects an unknown time zone", async () => {
      await expectRpcError(u, "start_sprint", { ...base(), p_tz: "Mars/Olympus" }, "invalid_tz");
    });

    it("rejects an empty or whitespace mantra (rule 7)", async () => {
      await expectRpcError(u, "start_sprint", { ...base(), p_mantra: "   " }, "sprints_mantra_check");
    });

    it("rejects goal <= 0", async () => {
      await expectRpcError(u, "start_sprint", { ...base(), p_amount: 0 }, "invalid_amount");
    });

    it("rejects confidence outside 1–10", async () => {
      await expectRpcError(u, "start_sprint", { ...base(), p_confidence: 0 }, "sprints_confidence_check");
      await expectRpcError(u, "start_sprint", { ...base(), p_confidence: 11 }, "sprints_confidence_check");
    });

    it("rejects an unknown measurement", async () => {
      await expectRpcError(u, "start_sprint", { ...base(), p_measurement: "steps" as never }, "sprints_measurement_check");
    });

    it("rejects money without a 3-letter currency", async () => {
      await expectRpcError(u, "start_sprint", { ...base(), p_currency: null }, "sprints_measurement_fields_check");
      await expectRpcError(u, "start_sprint", { ...base(), p_currency: "usd" }, "sprints_currency_check");
    });

    it("rejects quantity without a unit name, and hours with one", async () => {
      await expectRpcError(
        u,
        "start_sprint",
        { ...base(), p_measurement: "quantity", p_currency: null, p_unit: null },
        "sprints_measurement_fields_check",
      );
      await expectRpcError(
        u,
        "start_sprint",
        { ...base(), p_measurement: "hours", p_currency: null, p_unit: "reps" },
        "sprints_measurement_fields_check",
      );
    });

    it("rejects an anonymous caller", async () => {
      const { createClient } = await import("@supabase/supabase-js");
      const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      const res = await anon.rpc("start_sprint", base());
      expect(res.error).not.toBeNull();
    });
  });
});

async function plusDays(date: string, n: number): Promise<string> {
  const [r] = await sql<{ d: string }[]>`select to_char(${date}::date + ${n}::int, 'YYYY-MM-DD') as d`;
  return r.d;
}
