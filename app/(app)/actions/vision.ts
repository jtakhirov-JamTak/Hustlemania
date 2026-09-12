"use server";

import { revalidatePath } from "next/cache";
import { failed, type Result } from "@/lib/actionResult";
import { friendlyError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

// F9 / F16: every vision write is a SECURITY DEFINER function; identity comes from the session.

/** Step 1: the picture of a day one year from today. Inserts the account's vision or edits the picture in place. Returns the vision id. */
export async function saveVisionPicture(picture: string): Promise<Result<{ id: string }>> {
  if (!picture.trim()) return { error: friendlyError("vision_picture_required") };
  const supabase = await createClient();
  const res = await supabase.rpc("save_vision_picture", { p_picture: picture.trim() });
  if (res.error) return failed("saveVisionPicture", res.error);
  revalidatePath("/", "layout");
  return { id: res.data };
}

export type GoalInput = { body: string; proof: string; confidence: number | null; reason: string };

/** Step 2: the one-year goal, its observable proof, the 0–10 confidence and, at 6 or below, the main reason. The deadline is set by the database on the first save. */
export async function saveVisionGoal(input: GoalInput): Promise<Result<{ id: string }>> {
  if (!input.body.trim()) return { error: friendlyError("vision_body_required") };
  if (!input.proof.trim()) return { error: friendlyError("vision_proof_required") };
  if (input.confidence === null || !Number.isInteger(input.confidence) || input.confidence < 0 || input.confidence > 10) return { error: friendlyError("confidence_out_of_range") };
  if (input.confidence <= 6 && !input.reason.trim()) return { error: friendlyError("confidence_reason_required") };
  const supabase = await createClient();
  const res = await supabase.rpc("save_vision_goal", {
    p_body: input.body.trim(),
    p_proof: input.proof.trim(),
    p_confidence: input.confidence,
    // Sent explicitly as null: an omitted key changes the call signature and PostgREST finds no function.
    p_reason: (input.confidence <= 6 ? input.reason.trim() : null) as unknown as string,
  });
  if (res.error) return failed("saveVisionGoal", res.error);
  revalidatePath("/", "layout");
  return { id: res.data };
}

export type ObstacleInput = { impedimentId: string | null; when: string; then: string; recover: string };

/**
 * Step 3: picks a global impediment (renamed to WHEN) or creates one, writes THEN and
 * RECOVERED WHEN onto it, and links it as the main obstacle — one call. Returns the
 * impediment id.
 */
export async function setVisionObstacle(input: ObstacleInput): Promise<Result<{ id: string }>> {
  if (!input.when.trim() || !input.then.trim() || !input.recover.trim()) return { error: friendlyError("rule_incomplete") };
  const supabase = await createClient();
  const res = await supabase.rpc("set_vision_obstacle", {
    // Sent explicitly as null: an omitted key changes the call signature and PostgREST finds no function.
    p_impediment_id: (input.impedimentId ?? null) as unknown as string,
    p_when: input.when.trim(),
    p_then: input.then.trim(),
    p_recover: input.recover.trim(),
  });
  if (res.error) return failed("setVisionObstacle", res.error, { picked: input.impedimentId !== null });
  revalidatePath("/", "layout");
  return { id: res.data };
}

/** Replace: archives the active vision. Sprints keep their reference; the obstacle stays in the library. */
export async function replaceVision(): Promise<Result> {
  const supabase = await createClient();
  const res = await supabase.rpc("replace_vision");
  if (res.error) return failed("replaceVision", res.error);
  revalidatePath("/", "layout");
  return {};
}

export type Verdict = "still_true" | "needs_changes";

/** Review: one dated row per call, never overwritten. */
export async function reviewVision(verdict: Verdict, note: string): Promise<Result> {
  if (verdict !== "still_true" && verdict !== "needs_changes") return { error: friendlyError("invalid_verdict") };
  const supabase = await createClient();
  const res = await supabase.rpc("review_vision", { p_verdict: verdict, p_note: note.trim() || undefined });
  if (res.error) return failed("reviewVision", res.error, { verdict });
  revalidatePath("/", "layout");
  return {};
}
