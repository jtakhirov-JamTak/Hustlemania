"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { failed, type Result } from "@/lib/actionResult";
import { isAreaKey, type AreaKey } from "@/lib/areas";
import { loadDays, type SprintDay } from "@/lib/data";
import { friendlyError, GENERIC_SAVE_ERROR } from "@/lib/errors";
import type { Measurement } from "@/lib/format";
import { report } from "@/lib/observe";
import { createClient } from "@/lib/supabase/server";

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
  cueIds: string[];
  impedimentIds: string[];
  highestImpedimentId: string | null;
  proofWhen: string | null;
  proofThen: string | null;
  proofRecover: string | null;
  /** F3: a custom plan in base units (14 entries summing to `amount`), or null for Goal ÷ 14. */
  targets: number[] | null;
  /** F3: pre-planned Daily Intentions by day (14 entries; blank = none). Day 1 travels here too. */
  intentions: string[] | null;
};

/** Calls start_sprint; on success redirects to the new sprint's Today. */
export async function startSprintAction(input: StartSprintInput): Promise<{ error: string }> {
  if (!isAreaKey(input.area)) return { error: "Unknown area." };
  if (!input.highestImpedimentId) return { error: friendlyError("no_highest_impediment") };
  if (input.targets) {
    const bad = validTargets(input.targets);
    if (bad) return { error: bad };
    if (input.targets.reduce((a, b) => a + b, 0) !== input.amount) return { error: friendlyError("targets_sum_mismatch") };
  }
  const intentions = input.intentions?.map((t) => t.trim());
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
    p_cue_ids: input.cueIds,
    p_impediment_ids: input.impedimentIds,
    p_highest_impediment_id: input.highestImpedimentId,
    p_proof_when: input.proofWhen?.trim() || undefined,
    p_proof_then: input.proofThen?.trim() || undefined,
    p_proof_recover: input.proofRecover?.trim() || undefined,
    p_targets: input.targets ?? undefined,
    p_intentions: intentions?.some((t) => t) ? intentions : undefined,
  });
  if (res.error) return failed("startSprint", res.error, { area: input.area, measurement: input.measurement });

  revalidatePath("/", "layout");
  redirect(`/sprints/${input.area}`);
}

function validTargets(targets: number[]): string | null {
  if (targets.length !== 14) return friendlyError("invalid_targets");
  if (targets.some((t) => !Number.isInteger(t) || t < 0)) return friendlyError("negative_target");
  return null;
}

/**
 * F3: replaces the plan through save_targets, which enforces the sum (rule 11) and the
 * lock on begun days (rule 10). Returns the fresh day rows so the card re-renders.
 */
export async function saveTargetsAction(sprintId: string, targets: number[]): Promise<Result<{ days: SprintDay[] }>> {
  const bad = validTargets(targets);
  if (bad) return { error: bad };
  const supabase = await createClient();
  const res = await supabase.rpc("save_targets", { p_sprint_id: sprintId, p_targets: targets });
  if (res.error) return failed("saveTargets", res.error, { sprintId });
  try {
    const days = await loadDays(supabase, sprintId);
    revalidatePath("/sprints", "layout");
    return { days };
  } catch (e) {
    report("action.saveTargets.refresh", e, { sprintId });
    revalidatePath("/sprints", "layout");
    return { error: "The plan is saved, but the page could not refresh. Reload to see it." };
  }
}

export async function saveMantra(sprintId: string, text: string): Promise<Result> {
  const mantra = text.trim();
  if (!mantra) return { error: friendlyError("sprints_mantra_check") };
  const supabase = await createClient();
  const res = await supabase.from("sprints").update({ mantra }).eq("id", sprintId).select("id");
  if (res.error) return failed("saveMantra", res.error, { sprintId });
  if (res.data.length === 0) return { error: GENERIC_SAVE_ERROR };
  revalidatePath("/sprints", "layout");
  return {};
}
