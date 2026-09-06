import type { AdminClient } from "./local";
import { addDays } from "../../lib/sprintDay";

/**
 * A sprint whose day 1 is `startDate` (any date, past included) with 14 open days,
 * written straight into the tables with the service role. start_sprint only accepts
 * today or tomorrow, so this is how both suites get days that are already missed.
 * Amount is 14 × target, so the same-daily plan is exact.
 */
export async function insertSprintRows(
  admin: AdminClient,
  userId: string,
  opts: { startDate: string; tz: string; area?: string; target?: number; outcome?: string; mantra?: string },
): Promise<{ sprintId: string; dayIds: string[] }> {
  const area = opts.area ?? "wealth";
  const target = opts.target ?? 100;
  const vision = await admin.from("visions").insert({ user_id: userId, area, body: `A ${area} vision` }).select("id").single();
  if (vision.error) throw new Error(vision.error.message);
  const sprint = await admin
    .from("sprints")
    .insert({
      user_id: userId,
      vision_id: vision.data.id,
      area,
      outcome: opts.outcome ?? "Past-dated sprint",
      measurement: "money",
      currency: "USD",
      amount: target * 14,
      confidence: 7,
      why: "why",
      celebration: "celebration",
      mantra: opts.mantra ?? "mantra",
      tz: opts.tz,
      start_date: opts.startDate,
      end_date: addDays(opts.startDate, 13),
    })
    .select("id")
    .single();
  if (sprint.error) throw new Error(sprint.error.message);
  const rows = Array.from({ length: 14 }, (_, i) => ({ sprint_id: sprint.data.id, user_id: userId, day_index: i + 1, date: addDays(opts.startDate, i), target }));
  const days = await admin.from("sprint_days").insert(rows).select("id, day_index");
  if (days.error) throw new Error(days.error.message);
  return { sprintId: sprint.data.id, dayIds: days.data.sort((a, b) => a.day_index - b.day_index).map((d) => d.id) };
}
