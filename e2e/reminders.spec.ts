import { expect, test } from "@playwright/test";
import { addDays, localDateIn } from "../lib/sprintDay";
import { insertSprintRows } from "../tests/support/sprints";
import { zoneAtLocalHour } from "../tests/support/zones";
import { admin, deleteUser, seedUser } from "./helpers";

/**
 * F13 — the cron route end to end against the dev server: bearer gate, one send per
 * open day, idempotent rerun, nothing for a closed day. The transport is `log` here
 * (no RESEND_API_KEY on the local stack), so the proof of a send is the
 * `reminder_log` row the service role wrote. Request-only: one project is enough.
 */
test.describe("evening reminder route", () => {
  const requestOnly = () => test.skip(test.info().project.name !== "desktop", "request-only; runs once");

  const SECRET = process.env.CRON_SECRET;
  const ROUTE = "/api/cron/reminders";
  // Local time is 20:xx in this zone right now, so the seeded sprint's day 3 is due.
  const TZ = zoneAtLocalHour(20);

  let open: { id: string; email: string };
  let closed: { id: string; email: string };
  let openDay: string;
  let closedDay: string;

  async function logRows(userId: string) {
    const res = await admin.from("reminder_log").select("sprint_day_id, sent_at, attempts, error").eq("user_id", userId);
    if (res.error) throw new Error(res.error.message);
    return res.data;
  }

  test.beforeAll(async () => {
    if (test.info().project.name !== "desktop") return;
    if (!SECRET) throw new Error("CRON_SECRET is not set; scripts/local-env.mjs writes it to .env.local");
    const start = addDays(localDateIn(TZ, new Date()), -2);
    open = await seedUser("reminder-open");
    closed = await seedUser("reminder-closed");
    openDay = (await insertSprintRows(admin, open.id, { startDate: start, tz: TZ, area: "health" })).dayIds[2];
    closedDay = (await insertSprintRows(admin, closed.id, { startDate: start, tz: TZ, area: "health" })).dayIds[2];
    const shut = await admin.from("sprint_days").update({ actual: 100, closed_at: new Date().toISOString(), closed_on_time: true }).eq("id", closedDay);
    if (shut.error) throw new Error(shut.error.message);
  });

  test.afterAll(async () => {
    await deleteUser(open?.id);
    await deleteUser(closed?.id);
  });

  test("wrong or missing bearer is 401 and claims nothing; GET is 405", async ({ request }) => {
    requestOnly();
    const wrong = await request.post(ROUTE, { headers: { Authorization: `Bearer ${SECRET}x` } });
    expect(wrong.status()).toBe(401);
    expect(await wrong.text()).toBe("");
    const missing = await request.post(ROUTE);
    expect(missing.status()).toBe(401);
    const get = await request.get(ROUTE);
    expect(get.status()).toBe(405);
    expect(await logRows(open.id)).toEqual([]);
  });

  test("the right bearer mails the open day once, never the closed one, and a rerun sends nothing", async ({ request }) => {
    requestOnly();
    const first = await request.post(ROUTE, { headers: { Authorization: `Bearer ${SECRET}` } });
    expect(first.status()).toBe(200);
    const summary = (await first.json()) as { due: number; users: number; sent: number; failed: number };
    expect(summary.sent).toBeGreaterThanOrEqual(1);
    expect(summary.failed).toBe(0);

    const rows = await logRows(open.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].sprint_day_id).toBe(openDay);
    expect(rows[0].sent_at).not.toBeNull();
    expect(rows[0].attempts).toBe(1);
    expect(rows[0].error).toBeNull();
    expect(await logRows(closed.id)).toEqual([]);

    const second = await request.post(ROUTE, { headers: { Authorization: `Bearer ${SECRET}` } });
    expect(second.status()).toBe(200);
    expect(await logRows(open.id)).toEqual(rows);
    expect(await logRows(closed.id)).toEqual([]);
  });
});
