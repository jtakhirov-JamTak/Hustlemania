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
export type ResponseAnswer = "yes" | "no" | "partially" | "unsure";
export type ImpactAnswer = "nothing" | "some" | "a_lot" | "unsure";

/**
 * F7 observations. An item absent from `impediments` / `cues` is stored as unanswered
 * by the DB; the three Highest answers apply only when the Highest's own answer is yes.
 */
export type CloseDayInput = {
  actual: number;
  notes: string;
  impediments: { id: string; answer: Answer }[];
  cues: { id: string; answer: Answer }[];
  response: ResponseAnswer | null;
  recovered: Answer | null;
  impact: ImpactAnswer | null;
  /** The sprint's highest impediment as rendered, so the rule can be checked before the round trip. */
  highestId: string | null;
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
  const occurred = input.highestId !== null && input.impediments.some((i) => i.id === input.highestId && i.answer === "yes");
  if (occurred && !input.response) return { error: friendlyError("response_required") };
  if (occurred && !input.recovered) return { error: friendlyError("recovered_required") };
  if (!occurred && (input.response || input.recovered || input.impact)) return { error: friendlyError("response_not_applicable") };
  const supabase = await createClient();
  const res = await supabase.rpc("close_day", {
    p_sprint_day_id: dayId,
    p_actual: input.actual,
    p_notes: input.notes.trim() || undefined,
    p_impediments: input.impediments.map((i) => ({ item_id: i.id, answer: i.answer })),
    p_cues: input.cues.map((c) => ({ item_id: c.id, answer: c.answer })),
    p_response: occurred ? (input.response ?? undefined) : undefined,
    p_recovered: occurred ? (input.recovered ?? undefined) : undefined,
    p_impact: occurred ? (input.impact ?? undefined) : undefined,
  });
  if (res.error) {
    // The form validated against the highest it rendered; if another tab changed it
    // since, the DB's "not applicable" / "required" is about a different item, and the
    // copy has to say reload rather than contradict what is on screen.
    if (/response_not_applicable|response_required|recovered_required/.test(res.error.message)) {
      const current = await supabase.from("sprint_impediments").select("impediment_id").eq("sprint_id", sprintId).eq("is_highest", true).maybeSingle();
      if (!current.error && (current.data?.impediment_id ?? null) !== input.highestId) {
        report("action.closeDay.highest_changed", res.error, { dayId, sprintId });
        return { error: friendlyError("highest_changed") };
      }
    }
    return failed("closeDay", res.error, { dayId, sprintId });
  }
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
