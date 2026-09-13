"use server";

import { failed, type Result } from "@/lib/actionResult";
import type { Task } from "@/lib/data";
import { friendlyError, GENERIC_SAVE_ERROR } from "@/lib/errors";
import { requireUser } from "@/lib/supabase/server";

// Tasks (F4) — direct table writes under RLS; the DB trigger locks a closed day
// (rule 17) and pins a task to its day (rule 16). Nothing here touches totals (rule 15).
// Every action checks the session first: under RLS an expired session updates zero rows
// instead of erroring, which would read as "try again" forever.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `id` is optional and chosen by the client (`crypto.randomUUID()`): a retry after a lost
 * response carries the same id, the insert hits the primary key, and the row that already
 * committed is returned instead of a second one. A foreign id cannot be claimed — the
 * select runs under RLS, so a collision with another user's row reads as a plain failure.
 */
export async function createTask(dayId: string, text: string, id?: string): Promise<Result<{ task: Task }>> {
  const body = text.trim();
  if (!body) return { error: friendlyError("tasks_text_check") };
  if (id !== undefined && !UUID.test(id)) return { error: GENERIC_SAVE_ERROR };
  const { supabase, user } = await requireUser();
  if (!user) return { error: friendlyError("not_authenticated") };
  const res = await supabase
    .from("tasks")
    .insert({ ...(id ? { id } : {}), user_id: user.id, sprint_day_id: dayId, text: body })
    .select("*")
    .single();
  if (res.error?.code === "23505" && id) {
    const existing = await supabase.from("tasks").select("*").eq("id", id).eq("sprint_day_id", dayId).maybeSingle();
    if (existing.error) return failed("createTask", existing.error, { dayId });
    if (existing.data) return { task: existing.data };
  }
  if (res.error) return failed("createTask", res.error, { dayId });
  return { task: res.data };
}

export async function updateTask(id: string, patch: { text?: string; done?: boolean }): Promise<Result<{ task: Task }>> {
  const values: { text?: string; done?: boolean } = {};
  if (patch.text !== undefined) {
    const body = patch.text.trim();
    if (!body) return { error: friendlyError("tasks_text_check") };
    values.text = body;
  }
  if (patch.done !== undefined) values.done = patch.done;
  if (Object.keys(values).length === 0) return { error: GENERIC_SAVE_ERROR };
  const { supabase, user } = await requireUser();
  if (!user) return { error: friendlyError("not_authenticated") };
  const res = await supabase.from("tasks").update(values).eq("id", id).select("*");
  if (res.error) return failed("updateTask", res.error, { taskId: id });
  if (res.data.length === 0) return { error: GENERIC_SAVE_ERROR };
  return { task: res.data[0] };
}

/** Remove = archive; the row stays for History and Insights (PRD §11). */
export async function removeTask(id: string): Promise<Result> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: friendlyError("not_authenticated") };
  const res = await supabase.from("tasks").update({ archived_at: new Date().toISOString() }).eq("id", id).select("id");
  if (res.error) return failed("removeTask", res.error, { taskId: id });
  if (res.data.length === 0) return { error: GENERIC_SAVE_ERROR };
  return {};
}
