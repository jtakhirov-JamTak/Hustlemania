import { report } from "@/lib/observe";
import { buildReminder } from "@/lib/reminders/message";
import type { Transport } from "@/lib/reminders/transport";

/** One row of `reminders_due`: a sprint day that is open at 20:00+ in its zone. */
export type DueRow = {
  user_id: string;
  email: string;
  sprint_id: string;
  sprint_day_id: string;
  area: string;
  day_index: number;
  tz: string;
};

/** The three service-role functions, behind an interface so the run is unit-testable without a database. */
export type ReminderDb = {
  due(now: Date): Promise<DueRow[]>;
  /** Returns the ids actually claimed (new, or a retryable failure). */
  claim(sprintDayIds: string[]): Promise<string[]>;
  mark(sprintDayIds: string[], error: string | null): Promise<void>;
};

export type RunSummary = { due: number; users: number; sent: number; failed: number };

/** Sends in flight at once. Resend's rate limit is per second, not per connection; five keeps a 300-user hour under a minute. */
export const SEND_CONCURRENCY = 5;

/**
 * One pass: who is due → one claim for every due day → one email per user, a few at a
 * time → one mark for everything sent, one per failed user. Claim before send, so a
 * second pass inside the window finds nothing to claim and sends nothing; a failed send
 * keeps the rows unsent with the error for the next hour. A user whose claim comes back
 * empty (another pass got there first) is skipped, not counted as failed.
 *
 * The pass used to run claim → send → mark per user in series (three round trips plus
 * the provider each); at a few hundred users due in one hour it outlived the function
 * and the tail was never mailed (full audit 2026-09-13 H4). Its cost now grows with the
 * provider's latency divided by SEND_CONCURRENCY, and the route caps its own duration.
 */
export async function runReminders(db: ReminderDb, transport: Transport, origin: string, now = new Date(), concurrency = SEND_CONCURRENCY): Promise<RunSummary> {
  const rows = await db.due(now);
  if (rows.length === 0) return { due: 0, users: 0, sent: 0, failed: 0 };
  const claimed = new Set(await db.claim(rows.map((d) => d.sprint_day_id)));
  const byUser = new Map<string, DueRow[]>();
  for (const row of rows) byUser.set(row.user_id, [...(byUser.get(row.user_id) ?? []), row]);

  type Outcome = { userId: string; ids: string[]; error: string | null };
  const jobs = [...byUser].map(([userId, days]) => ({ userId, mine: days.filter((d) => claimed.has(d.sprint_day_id)) })).filter((j) => j.mine.length > 0);
  const outcomes: Outcome[] = new Array(jobs.length);
  let next = 0;
  async function worker() {
    for (let i = next++; i < jobs.length; i = next++) {
      const { userId, mine } = jobs[i];
      const message = buildReminder(mine, origin);
      const result = await transport.send({ to: mine[0].email, ...message });
      outcomes[i] = { userId, ids: mine.map((d) => d.sprint_day_id), error: result.ok ? null : result.error };
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, jobs.length)) }, worker));

  const sentIds = outcomes.filter((o) => o.error === null).flatMap((o) => o.ids);
  if (sentIds.length > 0) await db.mark(sentIds, null);
  for (const o of outcomes) {
    if (o.error === null) continue;
    await db.mark(o.ids, o.error);
    report("reminder.send_failed", { message: o.error }, { userId: o.userId, days: o.ids.length, transport: transport.name });
  }
  const failed = outcomes.filter((o) => o.error !== null).length;
  return { due: rows.length, users: byUser.size, sent: outcomes.length - failed, failed };
}
