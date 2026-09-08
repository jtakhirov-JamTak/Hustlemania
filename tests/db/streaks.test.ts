import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { zoneOffUtcDate } from "../support/zones";
import { createTestUser, deleteTestUser, expectRpcError, insertSprintRows, rpc, sql, type TestUser } from "./helpers";

const TZ = "America/Los_Angeles";
// The live sprint's zone is on a different date from UTC for the whole run, so a
// close_day or streak read that used the UTC date would put "today" on the wrong day.
const LIVE_TZ = zoneOffUtcDate();

/**
 * F5 — day boundaries, streaks, missed days, backfill (PRD §9, rule 18).
 *
 * Two sprints. The live one has day 5 = today in a zone whose date differs from UTC
 * (tests/support/zones), so days 1–4 are already missed and close_day runs against the
 * real clock. The fixed-clock one spans the US
 * DST end (2026-11-01) and feeds the streak table test through sprint_streak_at, each
 * scenario inside a transaction that is rolled back.
 */
describe("streaks", () => {
  let a: TestUser;
  let b: TestUser;
  let live: { sprintId: string; dayIds: string[] };
  let dst: { sprintId: string; dayIds: string[] };

  beforeAll(async () => {
    a = await createTestUser("streaks-a");
    b = await createTestUser("streaks-b");
    const [r] = await sql<{ d: string }[]>`select to_char((now() at time zone ${LIVE_TZ})::date - 4, 'YYYY-MM-DD') as d`;
    live = await insertSprintRows(a, { startDate: r.d, tz: LIVE_TZ });
    dst = await insertSprintRows(a, { startDate: "2026-10-25", tz: TZ, area: "health" });
  });

  afterAll(async () => {
    await deleteTestUser(a);
    await deleteTestUser(b);
    await sql.end();
  });

  /** Streak of the DST sprint after closing `closes` ([dayIndex, onTime]) as of `asof`, then rolled back. */
  async function streakAt(closes: [number, boolean][], asof: string): Promise<number> {
    const ROLLBACK = new Error("rollback");
    let streak = -1;
    await sql
      .begin(async (tx) => {
        for (const [index, onTime] of closes) {
          await tx`update public.sprint_days set actual = 100, closed_at = now(), closed_on_time = ${onTime} where id = ${dst.dayIds[index - 1]}`;
        }
        const [row] = await tx<{ streak: number }[]>`select public.sprint_streak_at(${dst.sprintId}, ${asof}::timestamptz) as streak`;
        streak = row.streak;
        throw ROLLBACK;
      })
      .catch((e) => {
        if (e !== ROLLBACK) throw e;
      });
    return streak;
  }

  // Day n of the DST sprint is 2026-10-(24+n); day 8 is Nov 1, the day US clocks fall back.
  const noonPdt = (day: number) => `2026-10-${24 + day}T19:00:00Z`;
  const onTime = (...days: number[]): [number, boolean][] => days.map((d) => [d, true]);

  /** The streak the app reads: one sprint_streaks() call for the caller's active sprints. */
  async function streakOf(user: TestUser, sprintId: string): Promise<number> {
    const rows = await rpc<{ sprint_id: string; streak: number }[]>(user, "sprint_streaks", {});
    return rows.find((r) => r.sprint_id === sprintId)?.streak ?? 0;
  }

  describe("sprint_streak_at table test (fixed clocks)", () => {
    it.each<[string, [number, boolean][], string, number]>([
      ["before day 1 nothing counts", [], "2026-10-24T19:00:00Z", 0],
      ["day 1 still open on day 1 is not missed", [], noonPdt(1), 0],
      ["three on-time closes, today open", onTime(1, 2, 3), noonPdt(4), 3],
      ["today closed on time counts", onTime(1, 2, 3, 4), noonPdt(4), 4],
      ["a missed middle day ends the earlier run", onTime(1, 2, 4, 5), noonPdt(6), 2],
      ["a backfilled middle day never repairs it (rule 18)", [...onTime(1, 2), [3, false], ...onTime(4, 5)], noonPdt(6), 2],
      ["yesterday missed: streak is 0 however long the run before", onTime(1, 2, 3, 4), noonPdt(6), 0],
      // 2026-11-02T07:30Z is 23:30 on Nov 1 in Los Angeles (PST, UTC−8, after the change).
      // A UTC date, or a stale −7 offset, would already be Nov 2 and count day 8 missed.
      ["DST end: 23:30 local on Nov 1 is still Nov 1", onTime(1, 2, 3, 4, 5, 6, 7), "2026-11-02T07:30:00Z", 7],
      ["DST end: 00:30 local on Nov 2 makes Nov 1 missed", onTime(1, 2, 3, 4, 5, 6, 7), "2026-11-02T08:30:00Z", 0],
      ["all 14 on time, read after the sprint", onTime(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14), "2026-11-20T19:00:00Z", 14],
    ])("%s", async (_name, closes, asof, expected) => {
      expect(await streakAt(closes, asof)).toBe(expected);
    });

    it("an unknown sprint reads as 0", async () => {
      const [row] = await sql<{ streak: number }[]>`select public.sprint_streak_at(gen_random_uuid(), now()) as streak`;
      expect(row.streak).toBe(0);
    });
  });

  describe("0007's backfill of closed_on_time (the statement from the migration file, rolled back)", () => {
    it("reads closed_at in the sprint's zone: 23:30 local is on time, 00:30 the next day is not — a UTC read calls both late", async () => {
      const migration = readFileSync("supabase/migrations/0007_streaks.sql", "utf8");
      const statement = /update public\.sprint_days d\s+set closed_on_time[^;]+;/.exec(migration)?.[0];
      expect(statement).toBeDefined();
      const ROLLBACK = new Error("rollback");
      await sql
        .begin(async (tx) => {
          // The migration ran before the CHECK and the widened immutability trigger existed.
          await tx`set local session_replication_role = replica`;
          await tx`alter table public.sprint_days drop constraint sprint_days_on_time_iff_closed_check`;
          // DST-sprint day 1 is 2026-10-25 (PDT, UTC−7): 23:30 local is 06:30Z on the 26th.
          // Day 2 is 10-26: 00:30 local on the 27th is 07:30Z on the 27th.
          await tx`update public.sprint_days set actual = 100, closed_at = '2026-10-26T06:30:00Z' where id = ${dst.dayIds[0]}`;
          await tx`update public.sprint_days set actual = 100, closed_at = '2026-10-27T07:30:00Z' where id = ${dst.dayIds[1]}`;
          await tx.unsafe(statement!);
          const rows = await tx<{ day_index: number; closed_on_time: boolean; utc_read: boolean }[]>`
            select day_index, closed_on_time, (closed_at at time zone 'UTC')::date <= date as utc_read
            from public.sprint_days where sprint_id = ${dst.sprintId} and closed_at is not null order by day_index`;
          expect(rows).toEqual([
            { day_index: 1, closed_on_time: true, utc_read: false },
            { day_index: 2, closed_on_time: false, utc_read: false },
          ]);
          throw ROLLBACK;
        })
        .catch((e) => {
          if (e !== ROLLBACK) throw e;
        });
      const [after] = await sql<{ n: number }[]>`select count(*)::int as n from public.sprint_days where sprint_id = ${dst.sprintId} and closed_at is not null`;
      expect(after.n).toBe(0);
    });
  });

  describe("close_day on the live clock", () => {
    it("today's day cannot be pre-empted by tomorrow", async () => {
      await expectRpcError(a, "close_day", { p_sprint_day_id: live.dayIds[5], p_actual: 10 }, "day_in_future");
    });

    it("closing today records closed_on_time = true, returns the streak, and starts it", async () => {
      const returned = await rpc<number>(a, "close_day", { p_sprint_day_id: live.dayIds[4], p_actual: 120 });
      expect(returned).toBe(1);
      const [row] = await sql<{ closed_on_time: boolean }[]>`select closed_on_time from public.sprint_days where id = ${live.dayIds[4]}`;
      expect(row.closed_on_time).toBe(true);
      expect(await streakOf(a, live.sprintId)).toBe(1);
    });

    it("backfilling a missed day records closed_on_time = false, counts toward totals, leaves the streak unchanged", async () => {
      await rpc(a, "close_day", { p_sprint_day_id: live.dayIds[2], p_actual: 80, p_notes: "late" });
      const [row] = await sql<{ closed_on_time: boolean; actual: string }[]>`select closed_on_time, actual from public.sprint_days where id = ${live.dayIds[2]}`;
      expect(row.closed_on_time).toBe(false);
      const [sum] = await sql<{ total: string }[]>`select sum(actual)::text as total from public.sprint_days where sprint_id = ${live.sprintId}`;
      expect(sum.total).toBe("200");
      expect(await streakOf(a, live.sprintId)).toBe(1);
    });

    it("the day just before today, backfilled, still does not extend the streak backwards", async () => {
      await rpc(a, "close_day", { p_sprint_day_id: live.dayIds[3], p_actual: 100 });
      expect(await streakOf(a, live.sprintId)).toBe(1);
    });

    it("closed_on_time is locked with the day, whoever writes", async () => {
      await expect(sql`update public.sprint_days set closed_on_time = true where id = ${live.dayIds[2]}`).rejects.toThrow(/day_closed/);
    });

    it("closed_on_time cannot exist without closed_at, nor closed_at without it", async () => {
      await expect(sql`update public.sprint_days set closed_on_time = true where id = ${live.dayIds[0]}`).rejects.toThrow(/sprint_days_on_time_iff_closed_check/);
      await expect(sql`update public.sprint_days set closed_at = now(), actual = 1 where id = ${live.dayIds[0]}`).rejects.toThrow(
        /sprint_days_on_time_iff_closed_check/,
      );
    });

    it("authenticated has no privilege to write closed_on_time directly", async () => {
      const res = await a.client.from("sprint_days").update({ closed_on_time: true }).eq("id", live.dayIds[0]);
      expect(res.error).not.toBeNull();
      expect(res.error!.code).toBe("42501");
    });

    it("sprint_streaks lists the caller's active sprints only; another user never sees this one", async () => {
      const mine = await rpc<{ sprint_id: string; streak: number }[]>(a, "sprint_streaks", {});
      expect(mine.map((r) => r.sprint_id).sort()).toEqual([live.sprintId, dst.sprintId].sort());
      const theirs = await rpc<{ sprint_id: string; streak: number }[]>(b, "sprint_streaks", {});
      expect(theirs).toEqual([]);
    });

    it("no backfill after the sprint is closed", async () => {
      await sql`update public.sprints set status = 'completed', closed_at = now() where id = ${live.sprintId}`;
      await expectRpcError(a, "close_day", { p_sprint_day_id: live.dayIds[0], p_actual: 5 }, "sprint_not_active");
    });
  });

  describe("no grace or repair path exists (rule 18)", () => {
    it("no function in public assigns closed_on_time except close_day (SET, :=, or a column list)", async () => {
      const rows = await sql<{ proname: string }[]>`
        select proname from pg_proc
        where pronamespace = 'public'::regnamespace
          and (prosrc ~* 'closed_on_time\\s*:?=' or prosrc ~* '\\(\\s*[^)]*closed_on_time[^)]*\\)\\s*='
               or (prosrc ~* 'closed_on_time' and prosrc ~* '\\bexecute\\b'))
          and proname <> 'close_day'`;
      expect(rows.map((r) => r.proname)).toEqual([]);
    });

    it("the triggers on sprint_days are exactly the known three, so no repair trigger can slip in", async () => {
      const rows = await sql<{ tgname: string }[]>`
        select tgname from pg_trigger
        where tgrelid = 'public.sprint_days'::regclass and not tgisinternal
        order by 1`;
      expect(rows.map((r) => r.tgname)).toEqual(["sprint_days_immutable_after_close", "sprint_days_set_updated_at", "sprint_days_target_locked"]);
    });
  });
});
