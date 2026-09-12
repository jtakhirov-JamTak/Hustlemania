"use server";

import { revalidatePath } from "next/cache";
import { failed, type Result } from "@/lib/actionResult";
import { loadDayOfferedItems, loadDays, type OfferedItems, type SprintDay } from "@/lib/data";
import { friendlyError, GENERIC_SAVE_ERROR } from "@/lib/errors";
import { report } from "@/lib/observe";
import { createClient, requireUser } from "@/lib/supabase/server";

export async function saveIntention(dayId: string, text: string): Promise<Result> {
  // Under RLS an expired session updates zero rows rather than erroring, which would read
  // as "try again" forever; the session is checked first so the copy says sign in.
  const { supabase, user } = await requireUser();
  if (!user) return { error: friendlyError("not_authenticated") };
  const res = await supabase
    .from("sprint_days")
    .update({ intention: text.trim() || null })
    .eq("id", dayId)
    .select("id");
  if (res.error) return failed("saveIntention", res.error, { dayId });
  if (res.data.length === 0) return { error: GENERIC_SAVE_ERROR };
  return {};
}

export type Answer = "yes" | "no" | "unsure";
export type Recovered = "yes" | "no";

/**
 * F15 observations. An item absent from `impediments` / `cues` is stored as unanswered
 * by the DB. A `yes` carries the situations it showed up in (at least one); for an
 * impediment each ticked situation carries a recovery answer or null (left blank).
 */
export type CloseDayInput = {
  actual: number;
  notes: string;
  impediments: { id: string; answer: Answer; situations: { situationId: string; recovered: Recovered | null }[] }[];
  cues: { id: string; answer: Answer; situations: string[] }[];
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
  for (const i of [...input.impediments, ...input.cues]) {
    if (i.answer === "yes" && i.situations.length === 0) return { error: friendlyError("situations_required") };
    if (i.answer !== "yes" && i.situations.length > 0) return { error: friendlyError("situations_not_applicable") };
  }
  const supabase = await createClient();
  const res = await supabase.rpc("close_day", {
    p_sprint_day_id: dayId,
    p_actual: input.actual,
    p_notes: input.notes.trim() || undefined,
    p_impediments: input.impediments.map((i) => ({ item_id: i.id, answer: i.answer, situations: i.situations.map((s) => ({ situation_id: s.situationId, recovered: s.recovered })) })),
    p_cues: input.cues.map((c) => ({ item_id: c.id, answer: c.answer, situations: c.situations.map((situation_id) => ({ situation_id })) })),
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
