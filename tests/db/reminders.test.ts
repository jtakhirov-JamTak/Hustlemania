import type { Sql, TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestUser, deleteTestUser, expectRpcError, insertSprintRows, sql, type TestUser } from "./helpers";

const TZ = "America/Los_Angeles";
// Day n is 2026-10-(24+n); day 8 is Nov 1, the day US clocks fall back (PDT → PST).
const START = "2026-10-25";

type Due = { user_id: string; email: string; sprint_id: string; sprint_day_id: string; area: string; day_index: number; tz: string };
type Q = Sql | TransactionSql;

/**
 * F13 — who is due, the claim / mark lifecycle, the cron job and the privileges
 * (SPEC F13). The clock is a parameter of reminders_due, so every case is fixed;
 * claim and mark use now(), so their cases move updated_at instead.
 */
describe("F13 evening reminder", () => {
  let a: TestUser;
  let b: TestUser;
  let sprint: { sprintId: string; dayIds: string[] };
  const day = (n: number) => sprint.dayIds[n - 1];

  beforeAll(async () => {
    a = await createTestUser("reminder-a");
    b = await createTestUser("reminder-b");
    sprint = await insertSprintRows(a, { startDate: START, tz: TZ, area: "health" });
  });

  afterAll(async () => {
    await deleteTestUser(a);
    await deleteTestUser(b);
    await sql.end();
  });

  const dueAt = (q: Q, iso: string) =>
    q<Due[]>`select * from public.reminders_due(${iso}::timestamptz) where user_id = ${a.id} order by area`;

  const ROLLBACK = new Error("rollback");
  async function rolledBack(fn: (tx: TransactionSql) => Promise<void>) {
    await sql
      .begin(async (tx) => {
        await fn(tx);
        throw ROLLBACK;
      })
      .catch((e) => {
        if (e !== ROLLBACK) throw e;
      });
  }

  describe("reminders_due", () => {
    it("19:59 local is not due; 20:00 is, with the email, area and day number", async () => {
      expect(await dueAt(sql, "2026-10-28T02:59:00Z")).toEqual([]); // Oct 27 19:59 PDT
      const rows = await dueAt(sql, "2026-10-28T03:00:00Z"); // Oct 27 20:00 PDT
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ user_id: a.id, email: a.email, sprint_id: sprint.sprintId, sprint_day_id: day(3), area: "health", day_index: 3, tz: TZ });
    });

    it("23:59 local is still due; local midnight is the next day, not yet 20:00", async () => {
      expect((await dueAt(sql, "2026-10-28T06:59:59Z")).map((r) => r.day_index)).toEqual([3]);
      expect(await dueAt(sql, "2026-10-28T07:00:00Z")).toEqual([]);
    });

    it("resolves 20:00 local on both sides of the DST end and on the transition day", async () => {
      expect((await dueAt(sql, "2026-10-31T03:00:00Z")).map((r) => r.day_index)).toEqual([6]); // Oct 30 20:00 PDT (UTC−7)
      expect(await dueAt(sql, "2026-11-02T03:59:00Z")).toEqual([]); // Nov 1 19:59 PST (UTC−8)
      expect((await dueAt(sql, "2026-11-02T04:00:00Z")).map((r) => r.day_index)).toEqual([8]); // Nov 1 20:00 PST
      expect(await dueAt(sql, "2026-11-03T03:59:00Z")).toEqual([]); // Nov 2 19:59 PST
      expect((await dueAt(sql, "2026-11-03T04:00:00Z")).map((r) => r.day_index)).toEqual([9]); // Nov 2 20:00 PST
    });

    it("nothing before day 1 or after day 14", async () => {
      expect(await dueAt(sql, "2026-10-25T03:00:00Z")).toEqual([]); // Oct 24 20:00 PDT
      expect(await dueAt(sql, "2026-11-09T04:00:00Z")).toEqual([]); // Nov 8 20:00 PST
    });

    it("a closed day is not due", async () => {
      await rolledBack(async (tx) => {
        await tx`update public.sprint_days set actual = 100, closed_at = now(), closed_on_time = true where id = ${day(3)}`;
        expect(await dueAt(tx, "2026-10-28T03:00:00Z")).toEqual([]);
      });
    });

    it("a sprint that is no longer active is not due", async () => {
      await rolledBack(async (tx) => {
        await tx`update public.sprints set status = 'ended_early', closed_at = now() where id = ${sprint.sprintId}`;
        expect(await dueAt(tx, "2026-10-28T03:00:00Z")).toEqual([]);
      });
    });

    it("a reminded day is not due; a failed attempt is due again after ten minutes, three times at most", async () => {
      const at = "2026-10-28T03:00:00Z";
      const seed = (tx: TransactionSql, sent: boolean, minutesAgo: number, attempts: number) =>
        tx`insert into public.reminder_log (user_id, sprint_day_id, sent_at, updated_at, attempts)
           values (${a.id}, ${day(3)}, ${sent ? at : null}, ${at}::timestamptz - make_interval(mins => ${minutesAgo}), ${attempts})`;
      await rolledBack(async (tx) => {
        await seed(tx, true, 30, 1);
        expect(await dueAt(tx, at)).toEqual([]);
      });
      await rolledBack(async (tx) => {
        await seed(tx, false, 5, 1); // in flight
        expect(await dueAt(tx, at)).toEqual([]);
      });
      await rolledBack(async (tx) => {
        await seed(tx, false, 11, 1);
        expect((await dueAt(tx, at)).map((r) => r.day_index)).toEqual([3]);
      });
      await rolledBack(async (tx) => {
        await seed(tx, false, 11, 2);
        expect((await dueAt(tx, at)).map((r) => r.day_index)).toEqual([3]);
      });
      await rolledBack(async (tx) => {
        await seed(tx, false, 11, 3);
        expect(await dueAt(tx, at)).toEqual([]);
      });
    });

    it("is read-only: the body has no INSERT, UPDATE or DELETE", async () => {
      const [row] = await sql<{ def: string }[]>`select pg_get_functiondef('public.reminders_due(timestamptz)'::regprocedure) as def`;
      const body = row.def.slice(row.def.indexOf("AS $function$"));
      expect(body).not.toMatch(/\b(insert|update|delete)\b/i);
    });
  });

  describe("reminders_claim and reminders_mark", () => {
    const claim = (tx: TransactionSql, ids: string[]) => tx<{ id: string }[]>`select public.reminders_claim(${ids}::uuid[]) as id`;
    // Moves the row's last touch back in time. The updated_at trigger would overwrite a
    // plain UPDATE with now(), so it is switched off for that one statement (rolled back
    // with the rest); the claim that follows runs with the trigger on, as in production.
    const backdate = async (tx: TransactionSql, minutes: number, extra = "") => {
      await tx`alter table public.reminder_log disable trigger reminder_log_set_updated_at`;
      if (extra === "attempts=3") await tx`update public.reminder_log set attempts = 3 where sprint_day_id = ${day(3)}`;
      await tx`update public.reminder_log set updated_at = now() - make_interval(mins => ${minutes}) where sprint_day_id = ${day(3)}`;
      await tx`alter table public.reminder_log enable trigger reminder_log_set_updated_at`;
    };
    const logRow = async (tx: TransactionSql) => {
      const [row] = await tx<{ attempts: number; sent_at: string | null; error: string | null }[]>`
        select attempts, sent_at, error from public.reminder_log where sprint_day_id = ${day(3)}`;
      return row;
    };

    it("claims a new day once, refuses it while in flight, retries a failure after ten minutes, and caps at three", async () => {
      await rolledBack(async (tx) => {
        expect((await claim(tx, [day(3)])).map((r) => r.id)).toEqual([day(3)]);
        expect(await logRow(tx)).toEqual({ attempts: 1, sent_at: null, error: null });
        expect(await claim(tx, [day(3)])).toEqual([]);

        await tx`select public.reminders_mark(${[day(3)]}::uuid[], ${"resend 422: Invalid `from` field"})`;
        expect(await logRow(tx)).toEqual({ attempts: 1, sent_at: null, error: "resend 422: Invalid `from` field" });
        expect(await claim(tx, [day(3)])).toEqual([]); // just touched

        await backdate(tx, 9);
        expect(await claim(tx, [day(3)])).toEqual([]); // nine minutes: still in flight

        await backdate(tx, 11);
        expect((await claim(tx, [day(3)])).map((r) => r.id)).toEqual([day(3)]);
        expect(await logRow(tx)).toMatchObject({ attempts: 2, sent_at: null, error: null });

        await backdate(tx, 11, "attempts=3");
        expect(await claim(tx, [day(3)])).toEqual([]);
      });
    });

    it("mark(null) records the send; a sent row is never reclaimed or overwritten, and is not due", async () => {
      await rolledBack(async (tx) => {
        await claim(tx, [day(3)]);
        await tx`select public.reminders_mark(${[day(3)]}::uuid[], null)`;
        const sent = await logRow(tx);
        expect(sent.sent_at).not.toBeNull();
        expect(sent.error).toBeNull();

        await backdate(tx, 11);
        expect(await claim(tx, [day(3)])).toEqual([]);
        await tx`select public.reminders_mark(${[day(3)]}::uuid[], ${"late failure"})`;
        expect(await logRow(tx)).toEqual({ ...sent, attempts: 1 });
        expect(await dueAt(tx, "2026-10-28T03:00:00Z")).toEqual([]);
      });
    });

    it("an unknown day claims nothing; a claim carries the day's own user_id", async () => {
      await rolledBack(async (tx) => {
        expect(await claim(tx, ["00000000-0000-0000-0000-000000000000"])).toEqual([]);
        await claim(tx, [day(5)]);
        const [row] = await tx<{ user_id: string }[]>`select user_id from public.reminder_log where sprint_day_id = ${day(5)}`;
        expect(row.user_id).toBe(a.id);
      });
    });
  });

  describe("privileges and the scheduler", () => {
    it("the API roles cannot call any of the three functions", async () => {
      await expectRpcError(a, "reminders_due", { p_now: "2026-10-28T03:00:00Z" }, "permission denied");
      await expectRpcError(a, "reminders_claim", { p_sprint_day_ids: [day(3)] }, "permission denied");
      await expectRpcError(a, "reminders_mark", { p_sprint_day_ids: [day(3)], p_error: null }, "permission denied");
      const read = await b.client.from("reminder_log").select("id");
      expect(read.error?.message ?? "").toMatch(/permission denied/);
    });

    it("pg_cron and pg_net are installed and the hourly job reads its URL and bearer from Vault", async () => {
      const ext = await sql<{ extname: string }[]>`select extname from pg_extension where extname in ('pg_cron', 'pg_net') order by 1`;
      expect(ext.map((e) => e.extname)).toEqual(["pg_cron", "pg_net"]);
      const jobs = await sql<{ schedule: string; command: string; active: boolean }[]>`
        select schedule, command, active from cron.job where jobname = 'reminders-hourly'`;
      expect(jobs).toHaveLength(1);
      expect(jobs[0].schedule).toBe("5 * * * *");
      expect(jobs[0].active).toBe(true);
      expect(jobs[0].command).toMatch(/net\.http_post/);
      expect(jobs[0].command).toMatch(/vault\.decrypted_secrets/);
      expect(jobs[0].command).toMatch(/'reminders_url'/);
      expect(jobs[0].command).toMatch(/'reminders_secret'/);
      expect(jobs[0].command).not.toMatch(/sprint_days|tasks/i);
    });

    it("the job's command selects zero rows while the Vault secrets are absent (no request, no error)", async () => {
      const [{ n }] = await sql<{ n: string }[]>`
        select count(*) as n from vault.decrypted_secrets where name in ('reminders_url', 'reminders_secret')`;
      expect(Number(n)).toBe(0);
      const [{ rows }] = await sql<{ rows: string }[]>`
        select count(*) as rows from vault.decrypted_secrets u
        join vault.decrypted_secrets s on s.name = 'reminders_secret'
        where u.name = 'reminders_url'`;
      expect(Number(rows)).toBe(0);
    });
  });

  it("two active sprints in two areas are two rows for the one user", async () => {
    await insertSprintRows(a, { startDate: START, tz: TZ, area: "wealth" });
    const rows = await dueAt(sql, "2026-10-28T03:00:00Z");
    expect(rows.map((r) => [r.area, r.day_index])).toEqual([
      ["health", 3],
      ["wealth", 3],
    ]);
    expect(new Set(rows.map((r) => r.user_id))).toEqual(new Set([a.id]));
  });
});
