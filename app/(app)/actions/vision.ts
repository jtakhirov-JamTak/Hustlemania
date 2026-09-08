"use server";

import { revalidatePath } from "next/cache";
import { failed, type Result } from "@/lib/actionResult";
import { friendlyError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

// F9: every vision write is a SECURITY DEFINER function; identity comes from the session.

export type VisionInput = { body: string; deadline: string; proof: string; meaning: string; baseline: string };

/** Step 1: inserts the account's vision or edits it in place. Returns the vision id. */
export async function saveVision(input: VisionInput): Promise<Result<{ id: string }>> {
  if (!input.body.trim()) return { error: friendlyError("vision_body_required") };
  if (!input.proof.trim()) return { error: friendlyError("vision_proof_required") };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.deadline)) return { error: friendlyError("vision_deadline_past") };
  const supabase = await createClient();
  const res = await supabase.rpc("save_vision", {
    p_body: input.body.trim(),
    p_deadline: input.deadline,
    p_proof: input.proof.trim(),
    p_meaning: input.meaning.trim() || undefined,
    p_baseline: input.baseline.trim() || undefined,
  });
  if (res.error) return failed("saveVision", res.error);
  revalidatePath("/", "layout");
  return { id: res.data };
}

export type ObstacleInput = { impedimentId: string | null; name: string; explanation: string };

/** Step 2: picks a global impediment or creates one, and links it as the main obstacle. Returns the impediment id. */
export async function setVisionObstacle(input: ObstacleInput): Promise<Result<{ id: string }>> {
  const name = input.name.trim();
  if ((input.impedimentId === null) === (name === "")) return { error: friendlyError("obstacle_pick_or_name") };
  const supabase = await createClient();
  const res = await supabase.rpc("set_vision_obstacle", {
    // Sent explicitly as null: an omitted key changes the call signature and PostgREST finds no function.
    p_impediment_id: (input.impedimentId ?? null) as unknown as string,
    p_name: name || undefined,
    p_explanation: input.explanation.trim() || undefined,
  });
  if (res.error) return failed("setVisionObstacle", res.error, { picked: input.impedimentId !== null });
  revalidatePath("/", "layout");
  return { id: res.data };
}

export type RuleInput = { when: string; then: string; recover: string };

/** Step 3: writes WHEN · THEN · RECOVERED WHEN onto the obstacle impediment. */
export async function setVisionRule(input: RuleInput): Promise<Result> {
  if (!input.when.trim() || !input.then.trim() || !input.recover.trim()) return { error: friendlyError("rule_incomplete") };
  const supabase = await createClient();
  const res = await supabase.rpc("set_vision_rule", { p_when: input.when.trim(), p_then: input.then.trim(), p_recover: input.recover.trim() });
  if (res.error) return failed("setVisionRule", res.error);
  revalidatePath("/", "layout");
  return {};
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
