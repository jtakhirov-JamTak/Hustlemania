"use server";

import { revalidatePath } from "next/cache";
import { failed, type Result } from "@/lib/actionResult";
import { isItemScope, type ItemKind, type ItemScope } from "@/lib/data";
import { friendlyError, GENERIC_SAVE_ERROR, HIGHEST_PROOF_EDIT_ERROR } from "@/lib/errors";
import { createClient, requireUser } from "@/lib/supabase/server";

// Libraries (F2, F6) and sprint membership during a sprint.

export type ItemInput = {
  name: string;
  explanation: string;
  scope: ItemScope;
  /** F6: a cue's WHEN. Required by every UI path that creates or edits a cue (D5: nullable in the DB). */
  cueWhen?: string;
  proofWhen?: string;
  proofThen?: string;
  proofRecover?: string;
};

export type ProofInput = { when: string; then: string; recover: string };

function table(kind: ItemKind) {
  return kind === "cue" ? ("cues" as const) : ("impediments" as const);
}

const blank = (s: string | undefined) => s?.trim() || null;

/** Creates a library item as the signed-in user; the DB appends it at the end of the library. */
export async function createItem(kind: ItemKind, input: ItemInput): Promise<Result<{ id: string }>> {
  const name = input.name.trim();
  if (!name) return { error: friendlyError(`${table(kind)}_name_check`) };
  if (!isItemScope(input.scope)) return { error: friendlyError("invalid_scope") };
  const { supabase, user } = await requireUser();
  if (!user) return { error: friendlyError("not_authenticated") };

  // rank is NOT NULL and assigned by the BEFORE INSERT trigger; the generated types
  // still list it as required, so it is sent as undefined (dropped from the JSON).
  const rank = undefined as unknown as number;
  const res =
    kind === "cue"
      ? await supabase
          .from("cues")
          .insert({ user_id: user.id, name, explanation: blank(input.explanation), scope: input.scope, cue_when: blank(input.cueWhen), rank })
          .select("id")
          .single()
      : await supabase
          .from("impediments")
          .insert({
            user_id: user.id,
            rank,
            name,
            explanation: blank(input.explanation),
            scope: input.scope,
            proof_when: blank(input.proofWhen),
            proof_then: blank(input.proofThen),
            proof_recover: blank(input.proofRecover),
          })
          .select("id")
          .single();
  if (res.error) return failed("createItem", res.error, { kind });
  revalidatePath("/", "layout");
  return { id: res.data.id };
}

/** Edits the free-text columns. Scope goes through setItemScope (rule 20). */
export async function updateItem(kind: ItemKind, id: string, input: Omit<ItemInput, "scope">): Promise<Result> {
  const name = input.name.trim();
  if (!name) return { error: friendlyError(`${table(kind)}_name_check`) };
  // Direct-table writes: an expired session updates zero rows under RLS rather than
  // erroring, which would read as "try again" forever, so the session is checked first.
  const { supabase, user } = await requireUser();
  if (!user) return { error: friendlyError("not_authenticated") };
  const res =
    kind === "cue"
      ? await supabase.from("cues").update({ name, explanation: blank(input.explanation), cue_when: blank(input.cueWhen) }).eq("id", id).select("id")
      : await supabase
          .from("impediments")
          .update({
            name,
            explanation: blank(input.explanation),
            proof_when: blank(input.proofWhen),
            proof_then: blank(input.proofThen),
            proof_recover: blank(input.proofRecover),
          })
          .eq("id", id)
          .select("id");
  if (res.error) {
    const out = failed("updateItem", res.error, { kind, itemId: id });
    return res.error.message.includes("proof_point_required") ? { error: HIGHEST_PROOF_EDIT_ERROR } : out;
  }
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
  if (res.error) return failed("archiveItem", res.error, { kind, itemId: id });
  const out = res.data as ItemRuleResult;
  if (!out.ok) return { blocked: out.failing ?? [] };
  revalidatePath("/", "layout");
  return { blocked: [] };
}

export async function setItemScope(kind: ItemKind, id: string, scope: ItemScope): Promise<Result<{ blocked: BlockedSprint[] }>> {
  if (!isItemScope(scope)) return { error: friendlyError("invalid_scope") };
  const supabase = await createClient();
  const res = await supabase.rpc("set_item_scope", { p_kind: kind, p_item_id: id, p_scope: scope });
  if (res.error) return failed("setItemScope", res.error, { kind, itemId: id, scope });
  const out = res.data as ItemRuleResult;
  if (!out.ok) return { blocked: out.failing ?? [] };
  revalidatePath("/", "layout");
  return { blocked: [] };
}

export async function restoreItem(kind: ItemKind, id: string): Promise<Result> {
  const supabase = await createClient();
  const res = await supabase.rpc("restore_item", { p_kind: kind, p_item_id: id });
  if (res.error) return failed("restoreItem", res.error, { kind, itemId: id });
  revalidatePath("/", "layout");
  return {};
}

/** Permanent delete; RLS allows it only for an item with no sprint history (rule 19). */
export async function deleteItem(kind: ItemKind, id: string): Promise<Result> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: friendlyError("not_authenticated") };
  const res = await supabase.from(table(kind)).delete().eq("id", id).select("id");
  if (res.error) return failed("deleteItem", res.error, { kind, itemId: id });
  if (res.data.length === 0) return { error: friendlyError("violates foreign key") };
  revalidatePath("/", "layout");
  return {};
}

export async function moveItem(kind: ItemKind, id: string, direction: "up" | "down"): Promise<Result> {
  const supabase = await createClient();
  const res = await supabase.rpc("move_item", { p_kind: kind, p_item_id: id, p_direction: direction });
  if (res.error) return failed("moveItem", res.error, { kind, itemId: id, direction });
  revalidatePath("/", "layout");
  return {};
}

export async function addSprintItem(sprintId: string, kind: ItemKind, itemId: string): Promise<Result> {
  const supabase = await createClient();
  const res = await supabase.rpc("add_sprint_item", { p_sprint_id: sprintId, p_kind: kind, p_item_id: itemId });
  if (res.error) return failed("addSprintItem", res.error, { sprintId, kind, itemId });
  revalidatePath("/sprints", "layout");
  return {};
}

export async function removeSprintItem(sprintId: string, kind: ItemKind, itemId: string): Promise<Result> {
  const supabase = await createClient();
  const res = await supabase.rpc("remove_sprint_item", { p_sprint_id: sprintId, p_kind: kind, p_item_id: itemId });
  if (res.error) return failed("removeSprintItem", res.error, { sprintId, kind, itemId });
  revalidatePath("/sprints", "layout");
  return {};
}

/** F7: moves the sprint's focus cue to another of its cues; the DB keeps exactly one. */
export async function setFocusCue(sprintId: string, cueId: string): Promise<Result> {
  const supabase = await createClient();
  const res = await supabase.rpc("set_focus_cue", { p_sprint_id: sprintId, p_cue_id: cueId });
  if (res.error) return failed("setFocusCue", res.error, { sprintId, cueId });
  revalidatePath("/sprints", "layout");
  return {};
}

/**
 * Designates the Highest Impediment. A Proof Point supplied with it is written by the
 * same DB function, so a rejected designation changes nothing in the library.
 */
export async function setHighestImpediment(sprintId: string, impedimentId: string, proof?: ProofInput): Promise<Result> {
  const when = proof?.when.trim();
  const then = proof?.then.trim();
  const recover = proof?.recover.trim();
  if (proof && (!when || !then || !recover)) return { error: friendlyError("proof_point_required") };
  const supabase = await createClient();
  const res = await supabase.rpc("set_highest_impediment", {
    p_sprint_id: sprintId,
    p_impediment_id: impedimentId,
    p_proof_when: when || undefined,
    p_proof_then: then || undefined,
    p_proof_recover: recover || undefined,
  });
  if (res.error) return failed("setHighestImpediment", res.error, { sprintId, impedimentId, withProof: Boolean(proof) });
  revalidatePath("/sprints", "layout");
  return {};
}

/** Edits a Proof Point in place (rule 22 is enforced by the DB trigger). */
export async function saveProofPoint(impedimentId: string, proof: ProofInput): Promise<Result> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: friendlyError("not_authenticated") };
  const res = await supabase
    .from("impediments")
    .update({ proof_when: blank(proof.when), proof_then: blank(proof.then), proof_recover: blank(proof.recover) })
    .eq("id", impedimentId)
    .select("id");
  if (res.error) return failed("saveProofPoint", res.error, { impedimentId });
  if (res.data.length === 0) return { error: GENERIC_SAVE_ERROR };
  revalidatePath("/", "layout");
  return {};
}
