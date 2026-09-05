"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAreaKey, type AreaKey } from "@/lib/areas";
import { isItemScope, loadDays, type ItemKind, type ItemScope, type SprintDay } from "@/lib/data";
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
  cueIds: string[];
  impedimentIds: string[];
  highestImpedimentId: string | null;
  proofWhen: string | null;
  proofThen: string | null;
};

/** Calls start_sprint; on success redirects to the new sprint's Today. */
export async function startSprintAction(input: StartSprintInput): Promise<{ error: string }> {
  if (!isAreaKey(input.area)) return { error: "Unknown area." };
  if (!input.highestImpedimentId) return { error: friendlyError("no_highest_impediment") };
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
    p_intention: input.intention?.trim() || undefined,
    p_proof_when: input.proofWhen?.trim() || undefined,
    p_proof_then: input.proofThen?.trim() || undefined,
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

export type CloseDayInput = {
  actual: number;
  notes: string;
  hurt: string[];
  mostDamaging: string | null;
  helped: string[];
  mostUseful: string | null;
};

/** Calls close_day and returns the sprint's fresh day rows for the result screen. */
export async function closeDayAction(dayId: string, sprintId: string, input: CloseDayInput): Promise<Result<{ days: SprintDay[] }>> {
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
  if (res.error) return { error: friendlyError(res.error.message) };
  const days = await loadDays(supabase, sprintId);
  revalidatePath("/sprints", "layout");
  return { days };
}

// ---------------------------------------------------------------------------
// Libraries (F2)
// ---------------------------------------------------------------------------

export type ItemInput = {
  name: string;
  explanation: string;
  scope: ItemScope;
  proofWhen?: string;
  proofThen?: string;
};

function table(kind: ItemKind) {
  return kind === "cue" ? ("cues" as const) : ("impediments" as const);
}

/** Creates a library item as the signed-in user; the DB appends it at the end of the library. */
export async function createItem(kind: ItemKind, input: ItemInput): Promise<Result<{ id: string }>> {
  const name = input.name.trim();
  if (!name) return { error: friendlyError(`${table(kind)}_name_check`) };
  if (!isItemScope(input.scope)) return { error: friendlyError("invalid_scope") };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: friendlyError("not_authenticated") };

  // rank is NOT NULL and assigned by the BEFORE INSERT trigger; the generated types
  // still list it as required, so it is sent as undefined (dropped from the JSON).
  const rank = undefined as unknown as number;
  const res =
    kind === "cue"
      ? await supabase
          .from("cues")
          .insert({ user_id: auth.user.id, name, explanation: input.explanation.trim() || null, scope: input.scope, rank })
          .select("id")
          .single()
      : await supabase
          .from("impediments")
          .insert({
            user_id: auth.user.id,
            rank,
            name,
            explanation: input.explanation.trim() || null,
            scope: input.scope,
            proof_when: input.proofWhen?.trim() || null,
            proof_then: input.proofThen?.trim() || null,
          })
          .select("id")
          .single();
  if (res.error) return { error: friendlyError(res.error.message) };
  revalidatePath("/", "layout");
  return { id: res.data.id };
}

/** Edits the free-text columns. Scope goes through setItemScope (rule 20). */
export async function updateItem(kind: ItemKind, id: string, input: Omit<ItemInput, "scope">): Promise<Result> {
  const name = input.name.trim();
  if (!name) return { error: friendlyError(`${table(kind)}_name_check`) };
  const supabase = await createClient();
  const res =
    kind === "cue"
      ? await supabase.from("cues").update({ name, explanation: input.explanation.trim() || null }).eq("id", id).select("id")
      : await supabase
          .from("impediments")
          .update({
            name,
            explanation: input.explanation.trim() || null,
            proof_when: input.proofWhen?.trim() || null,
            proof_then: input.proofThen?.trim() || null,
          })
          .eq("id", id)
          .select("id");
  if (res.error) return { error: friendlyError(res.error.message) };
  if (res.data.length === 0) return { error: GENERIC_SAVE_ERROR };
  revalidatePath("/", "layout");
  return {};
}

export type BlockedSprint = { sprint_id: string; area: string; outcome: string; reason: string };
type ItemRuleResult = { ok: boolean; removed_from?: number; failing?: BlockedSprint[] };

/** archive_item: blocked sprints come back as `blocked` with nothing changed (rule 20). */
export async function archiveItem(kind: ItemKind, id: string): Promise<Result<{ blocked: BlockedSprint[] }>> {
  const supabase = await createClient();
  const res = await supabase.rpc("archive_item", { p_kind: kind, p_item_id: id });
  if (res.error) return { error: friendlyError(res.error.message) };
  const out = res.data as ItemRuleResult;
  if (!out.ok) return { blocked: out.failing ?? [] };
  revalidatePath("/", "layout");
  return { blocked: [] };
}

export async function setItemScope(kind: ItemKind, id: string, scope: ItemScope): Promise<Result<{ blocked: BlockedSprint[] }>> {
  if (!isItemScope(scope)) return { error: friendlyError("invalid_scope") };
  const supabase = await createClient();
  const res = await supabase.rpc("set_item_scope", { p_kind: kind, p_item_id: id, p_scope: scope });
  if (res.error) return { error: friendlyError(res.error.message) };
  const out = res.data as ItemRuleResult;
  if (!out.ok) return { blocked: out.failing ?? [] };
  revalidatePath("/", "layout");
  return { blocked: [] };
}

export async function restoreItem(kind: ItemKind, id: string): Promise<Result> {
  const supabase = await createClient();
  const res = await supabase.rpc("restore_item", { p_kind: kind, p_item_id: id });
  if (res.error) return { error: friendlyError(res.error.message) };
  revalidatePath("/", "layout");
  return {};
}

/** Permanent delete; RLS allows it only for an item with no sprint history (rule 19). */
export async function deleteItem(kind: ItemKind, id: string): Promise<Result> {
  const supabase = await createClient();
  const res = await supabase.from(table(kind)).delete().eq("id", id).select("id");
  if (res.error) return { error: friendlyError(res.error.message) };
  if (res.data.length === 0) return { error: friendlyError("violates foreign key") };
  revalidatePath("/", "layout");
  return {};
}

export async function moveItem(kind: ItemKind, id: string, direction: "up" | "down"): Promise<Result> {
  const supabase = await createClient();
  const res = await supabase.rpc("move_item", { p_kind: kind, p_item_id: id, p_direction: direction });
  if (res.error) return { error: friendlyError(res.error.message) };
  revalidatePath("/", "layout");
  return {};
}

// ---------------------------------------------------------------------------
// Sprint membership during a sprint (F2)
// ---------------------------------------------------------------------------

export async function addSprintItem(sprintId: string, kind: ItemKind, itemId: string): Promise<Result> {
  const supabase = await createClient();
  const res = await supabase.rpc("add_sprint_item", { p_sprint_id: sprintId, p_kind: kind, p_item_id: itemId });
  if (res.error) return { error: friendlyError(res.error.message) };
  revalidatePath("/sprints", "layout");
  return {};
}

export async function removeSprintItem(sprintId: string, kind: ItemKind, itemId: string): Promise<Result> {
  const supabase = await createClient();
  const res = await supabase.rpc("remove_sprint_item", { p_sprint_id: sprintId, p_kind: kind, p_item_id: itemId });
  if (res.error) return { error: friendlyError(res.error.message) };
  revalidatePath("/sprints", "layout");
  return {};
}

/** Designates the Highest Impediment, writing a Proof Point first when one is supplied. */
export async function setHighestImpediment(
  sprintId: string,
  impedimentId: string,
  proof?: { when: string; then: string },
): Promise<Result> {
  const supabase = await createClient();
  if (proof) {
    const when = proof.when.trim();
    const then = proof.then.trim();
    if (!when || !then) return { error: friendlyError("proof_point_required") };
    const upd = await supabase.from("impediments").update({ proof_when: when, proof_then: then }).eq("id", impedimentId).select("id");
    if (upd.error) return { error: friendlyError(upd.error.message) };
    if (upd.data.length === 0) return { error: GENERIC_SAVE_ERROR };
  }
  const res = await supabase.rpc("set_highest_impediment", { p_sprint_id: sprintId, p_impediment_id: impedimentId });
  if (res.error) return { error: friendlyError(res.error.message) };
  revalidatePath("/sprints", "layout");
  return {};
}

/** Edits a Proof Point in place (rule 22 is enforced by the DB trigger). */
export async function saveProofPoint(impedimentId: string, when: string, then: string): Promise<Result> {
  const supabase = await createClient();
  const res = await supabase
    .from("impediments")
    .update({ proof_when: when.trim() || null, proof_then: then.trim() || null })
    .eq("id", impedimentId)
    .select("id");
  if (res.error) return { error: friendlyError(res.error.message) };
  if (res.data.length === 0) return { error: GENERIC_SAVE_ERROR };
  revalidatePath("/", "layout");
  return {};
}
