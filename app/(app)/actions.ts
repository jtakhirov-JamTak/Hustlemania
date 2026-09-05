"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAreaKey, type AreaKey } from "@/lib/areas";
import { loadDays, type SprintDay } from "@/lib/data";
import { friendlyError, GENERIC_SAVE_ERROR } from "@/lib/errors";
import type { Measurement } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

type Result<T = object> = ({ error: string } & Partial<T>) | ({ error?: undefined } & T);

/** Insert the area's vision, or update the active one. Identity comes from the session. */
export async function saveVision(area: AreaKey, body: string): Promise<Result> {
  if (!isAreaKey(area)) return { error: "Unknown area." };
  const text = body.trim();
  if (!text) return { error: friendlyError("visions_body_check") };

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: friendlyError("not_authenticated") };

  const existing = await supabase.from("visions").select("id").eq("area", area).is("archived_at", null).maybeSingle();
  if (existing.error) return { error: friendlyError(existing.error.message) };

  const res = existing.data
    ? await supabase.from("visions").update({ body: text }).eq("id", existing.data.id).select("id").single()
    : await supabase.from("visions").insert({ user_id: auth.user.id, area, body: text }).select("id").single();
  if (res.error) return { error: friendlyError(res.error.message) };

  revalidatePath("/", "layout");
  return {};
}

export type StartSprintInput = {
  area: AreaKey;
  outcome: string;
  measurement: Measurement;
  currency: string | null;
  unit: string | null;
  amount: number; // base units
  confidence: number;
  why: string;
  celebration: string;
  mantra: string;
  usageOfFunds: { label: string; amount: number }[];
  tz: string;
  startDate: string;
  intention: string | null;
};

/** Calls start_sprint; on success redirects to the new sprint's Today. */
export async function startSprintAction(input: StartSprintInput): Promise<{ error: string }> {
  if (!isAreaKey(input.area)) return { error: "Unknown area." };
  const supabase = await createClient();
  const res = await supabase.rpc("start_sprint", {
    p_area: input.area,
    p_outcome: input.outcome.trim(),
    p_measurement: input.measurement,
    // The SQL parameters are nullable text; the generated types mark them as string.
    p_currency: (input.currency?.trim().toUpperCase() || null) as unknown as string,
    p_unit: (input.unit?.trim() || null) as unknown as string,
    p_amount: input.amount,
    p_confidence: input.confidence,
    p_why: input.why.trim(),
    p_celebration: input.celebration.trim(),
    p_mantra: input.mantra.trim(),
    p_usage_of_funds: input.usageOfFunds,
    p_tz: input.tz,
    p_start_date: input.startDate,
    p_intention: input.intention?.trim() || undefined,
  });
  if (res.error) return { error: friendlyError(res.error.message) };

  revalidatePath("/", "layout");
  redirect(`/sprints/${input.area}`);
}

export async function saveIntention(dayId: string, text: string): Promise<Result> {
  const supabase = await createClient();
  const res = await supabase
    .from("sprint_days")
    .update({ intention: text.trim() || null })
    .eq("id", dayId)
    .select("id");
  if (res.error) return { error: friendlyError(res.error.message) };
  if (res.data.length === 0) return { error: GENERIC_SAVE_ERROR };
  return {};
}

export async function saveMantra(sprintId: string, text: string): Promise<Result> {
  const mantra = text.trim();
  if (!mantra) return { error: friendlyError("sprints_mantra_check") };
  const supabase = await createClient();
  const res = await supabase.from("sprints").update({ mantra }).eq("id", sprintId).select("id");
  if (res.error) return { error: friendlyError(res.error.message) };
  if (res.data.length === 0) return { error: GENERIC_SAVE_ERROR };
  revalidatePath("/sprints", "layout");
  return {};
}

/** Calls close_day and returns the sprint's fresh day rows for the result screen. */
export async function closeDayAction(
  dayId: string,
  sprintId: string,
  actual: number,
  notes: string,
): Promise<Result<{ days: SprintDay[] }>> {
  if (!Number.isInteger(actual) || actual < 0) return { error: friendlyError("invalid_actual") };
  const supabase = await createClient();
  const res = await supabase.rpc("close_day", { p_sprint_day_id: dayId, p_actual: actual, p_notes: notes.trim() || undefined });
  if (res.error) return { error: friendlyError(res.error.message) };
  const days = await loadDays(supabase, sprintId);
  revalidatePath("/sprints", "layout");
  return { days };
}
