"use server";

import { revalidatePath } from "next/cache";
import { failed, type Result } from "@/lib/actionResult";
import { loadDayOfferedItems, loadDays, type OfferedItems, type SprintDay } from "@/lib/data";
import { friendlyError, GENERIC_SAVE_ERROR } from "@/lib/errors";
import { report } from "@/lib/observe";
import { createClient } from "@/lib/supabase/server";

export async function saveIntention(dayId: string, text: string): Promise<Result> {
  const supabase = await createClient();
  const res = await supabase
    .from("sprint_days")
    .update({ intention: text.trim() || null })
    .eq("id", dayId)
    .select("id");
  if (res.error) return failed("saveIntention", res.error, { dayId });
  if (res.data.length === 0) return { error: GENERIC_SAVE_ERROR };
  return {};
}

export type CloseDayInput = {
  actual: number;
  notes: string;
  hurt: string[];
  mostDamaging: string | null;
  helped: string[];
  mostUseful: string | null;
};

export type CloseDayResult = Result<{ days: SprintDay[]; streak: number }> & {
  /** Set when the day did close but the fresh rows could not be read: the error is about the refresh, not the close. */
  closed?: true;
};

/**
 * Closes today's day or backfills a missed one (F5); the DB decides which, records it,
 * and returns the streak. The fresh day rows are read afterwards for the result screen.
 */
export async function closeDayAction(dayId: string, sprintId: string, input: CloseDayInput): Promise<CloseDayResult> {
  if (!Number.isInteger(input.actual) || input.actual < 0) return { error: friendlyError("invalid_actual") };
  if (input.hurt.length > 0 && !input.mostDamaging) return { error: friendlyError("most_damaging_required") };
  if (input.helped.length > 0 && !input.mostUseful) return { error: friendlyError("most_useful_required") };
  const supabase = await createClient();
  const res = await supabase.rpc("close_day", {
    p_sprint_day_id: dayId,
    p_actual: input.actual,
    p_notes: input.notes.trim() || undefined,
    p_hurt: input.hurt,
    p_most_damaging: input.hurt.length > 0 ? (input.mostDamaging ?? undefined) : undefined,
    p_helped: input.helped,
    p_most_useful: input.helped.length > 0 ? (input.mostUseful ?? undefined) : undefined,
  });
  if (res.error) return failed("closeDay", res.error, { dayId, sprintId });
  revalidatePath("/sprints", "layout");
  try {
    return { days: await loadDays(supabase, sprintId), streak: res.data };
  } catch (e) {
    // The close committed; only the read after it failed. That is a dead read path,
    // not a UI glitch, so it is reported as its own event.
    report("action.closeDay.refresh", e, { dayId, sprintId });
    return { closed: true, error: "The day is closed, but the page could not refresh. Reload to see it." };
  }
}

/** What Day Close offers for one day (rule 23) — fetched on demand when a missed day is backfilled. */
export async function dayOfferedItemsAction(dayId: string): Promise<Result<{ offered: OfferedItems }>> {
  const supabase = await createClient();
  try {
    return { offered: await loadDayOfferedItems(supabase, dayId) };
  } catch (e) {
    report("action.dayOfferedItems", e, { dayId });
    return { error: friendlyError(e instanceof Error ? e.message : undefined) };
  }
}
