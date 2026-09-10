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

/**
 * One pass: who is due → claim their days → one email per user → record the outcome.
 * Claim before send, so a second pass inside the window finds nothing to claim and
 * sends nothing; a failed send keeps the rows unsent with the error for the next hour.
 * A user whose claim comes back empty (another pass got there first) is skipped, not
 * counted as failed.
 */
export async function runReminders(db: ReminderDb, transport: Transport, origin: string, now = new Date()): Promise<RunSummary> {
  const rows = await db.due(now);
  const byUser = new Map<string, DueRow[]>();
  for (const row of rows) byUser.set(row.user_id, [...(byUser.get(row.user_id) ?? []), row]);

  let sent = 0;
  let failed = 0;
  for (const [userId, days] of byUser) {
    const claimed = new Set(await db.claim(days.map((d) => d.sprint_day_id)));
    const mine = days.filter((d) => claimed.has(d.sprint_day_id));
    if (mine.length === 0) continue;
    const ids = mine.map((d) => d.sprint_day_id);
    const message = buildReminder(mine, origin);
    const result = await transport.send({ to: mine[0].email, ...message });
    if (result.ok) {
      await db.mark(ids, null);
      sent += 1;
    } else {
      await db.mark(ids, result.error);
      report("reminder.send_failed", { message: result.error }, { userId, days: ids.length, transport: transport.name });
      failed += 1;
    }
  }
  return { due: rows.length, users: byUser.size, sent, failed };
}
