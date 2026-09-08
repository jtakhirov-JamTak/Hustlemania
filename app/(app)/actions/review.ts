"use server";

import { revalidatePath } from "next/cache";
import { failed, type Result } from "@/lib/actionResult";
import type { ReviewDecision } from "@/lib/data";
import { friendlyError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

/**
 * F10 closure. Each of the three is a separate DB function with its own window, so the
 * button the user pressed is the rule that ran: complete_sprint only while the sprint
 * runs and only at the goal, end_sprint_early only while it runs, finish_sprint only
 * once the 14 days have passed. Nothing here decides which — the DB refuses the wrong
 * one, and the copy names the reason.
 */
async function closure(fn: "complete_sprint" | "end_sprint_early" | "finish_sprint", sprintId: string): Promise<Result> {
  const supabase = await createClient();
  const res = await supabase.rpc(fn, { p_sprint_id: sprintId });
  if (res.error) return failed(fn, res.error, { sprintId });
  revalidatePath("/", "layout");
  return {};
}

export async function completeSprint(sprintId: string): Promise<Result> {
  return closure("complete_sprint", sprintId);
}

export async function endSprintEarly(sprintId: string): Promise<Result> {
  return closure("end_sprint_early", sprintId);
}

export async function finishSprint(sprintId: string): Promise<Result> {
  return closure("finish_sprint", sprintId);
}

export type FinishReviewInput = {
  lesson: string;
  movedVision: boolean | null;
  /** null when the highest impediment never showed up on a logged day. */
  verdict: "worked" | "partly" | "didnt" | null;
  decisions: ReviewDecision[];
};

/**
 * Writes the postmortem. The lesson and the vision answer are checked here so the
 * blocked primary and the DB agree, and again in finish_review, which is the only
 * write path to `reviews` and `review_decisions`.
 */
export async function finishReview(sprintId: string, input: FinishReviewInput): Promise<Result<{ id: string }>> {
  const lesson = input.lesson.trim();
  if (!lesson) return { error: friendlyError("lesson_required") };
  if (input.movedVision === null) return { error: friendlyError("vision_answer_required") };

  const supabase = await createClient();
  const res = await supabase.rpc("finish_review", {
    p_sprint_id: sprintId,
    p_lesson: lesson,
    p_moved: input.movedVision,
    p_verdict: input.verdict as unknown as string,
    p_decisions: input.decisions,
  });
  if (res.error) return failed("finishReview", res.error, { sprintId });
  revalidatePath("/", "layout");
  return { id: res.data as string };
}
