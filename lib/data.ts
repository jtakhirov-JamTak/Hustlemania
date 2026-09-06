import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";
import { AREAS, type AreaKey } from "@/lib/areas";
import type { Database, Tables } from "@/lib/database.types";

export type Vision = Tables<"visions">;
export type Sprint = Tables<"sprints">;
export type SprintDay = Tables<"sprint_days">;
export type Task = Tables<"tasks">;
export type Cue = Tables<"cues">;
export type Impediment = Tables<"impediments">;
export type Client = SupabaseClient<Database>;

export type ItemKind = "cue" | "impediment";
export type ItemScope = "global" | AreaKey;
export const SCOPES: { key: ItemScope; label: string }[] = [
  { key: "global", label: "Global" },
  ...AREAS.map((a) => ({ key: a.key, label: a.name })),
];
export function isItemScope(value: string): value is ItemScope {
  return SCOPES.some((s) => s.key === value);
}

/** One library entry, cue or impediment, in the shape every list and picker renders. */
export type LibraryItem = {
  id: string;
  kind: ItemKind;
  name: string;
  explanation: string | null;
  scope: ItemScope;
  rank: number;
  archived_at: string | null;
  proof_when: string | null;
  proof_then: string | null;
  /** Has ever been a member of any sprint (rule 19: then it can only be archived). */
  used: boolean;
};

export type AreaOverview = {
  key: AreaKey;
  name: string;
  vision: Vision | null;
  sprint: Sprint | null;
};

/** Active vision and active sprint per area, for sidebars and empty states. */
export async function loadOverview(supabase: Client): Promise<AreaOverview[]> {
  const [visions, sprints] = await Promise.all([
    supabase.from("visions").select("*").is("archived_at", null),
    supabase.from("sprints").select("*").eq("status", "active"),
  ]);
  if (visions.error) throw new Error(`visions: ${visions.error.message}`);
  if (sprints.error) throw new Error(`sprints: ${sprints.error.message}`);
  return AREAS.map((a) => ({
    key: a.key,
    name: a.name,
    vision: visions.data.find((v) => v.area === a.key) ?? null,
    sprint: sprints.data.find((s) => s.area === a.key) ?? null,
  }));
}

export async function loadActiveVision(supabase: Client, area: AreaKey): Promise<Vision | null> {
  const res = await supabase.from("visions").select("*").eq("area", area).is("archived_at", null).maybeSingle();
  if (res.error) throw new Error(`vision: ${res.error.message}`);
  return res.data;
}

export async function loadActiveSprint(
  supabase: Client,
  area: AreaKey,
): Promise<{ sprint: Sprint; days: SprintDay[] } | null> {
  const sprint = await supabase.from("sprints").select("*").eq("area", area).eq("status", "active").maybeSingle();
  if (sprint.error) throw new Error(`sprint: ${sprint.error.message}`);
  if (!sprint.data) return null;
  const days = await supabase.from("sprint_days").select("*").eq("sprint_id", sprint.data.id).order("day_index");
  if (days.error) throw new Error(`sprint_days: ${days.error.message}`);
  return { sprint: sprint.data, days: days.data };
}

/** One day's live task list (F4): removed tasks are archived and never listed here. */
export async function loadTasks(supabase: Client, dayId: string): Promise<Task[]> {
  const res = await supabase.from("tasks").select("*").eq("sprint_day_id", dayId).is("archived_at", null).order("created_at").order("id");
  if (res.error) throw new Error(`tasks: ${res.error.message}`);
  return res.data;
}

/**
 * Streak per active sprint (F5): consecutive on-time closes ending at the latest
 * closable day, from the SQL that owns it. One RPC for all areas, memoised per request
 * on the client identity so the sprints layout and its page share the result.
 */
export const loadStreaks = cache(async (supabase: Client): Promise<Map<string, number>> => {
  const res = await supabase.rpc("sprint_streaks");
  if (res.error) throw new Error(`sprint_streaks: ${res.error.message}`);
  return new Map(res.data.map((r) => [r.sprint_id, r.streak]));
});

export async function loadDays(supabase: Client, sprintId: string): Promise<SprintDay[]> {
  const days = await supabase.from("sprint_days").select("*").eq("sprint_id", sprintId).order("day_index");
  if (days.error) throw new Error(`sprint_days: ${days.error.message}`);
  return days.data;
}

function toItem(kind: ItemKind, row: Cue | Impediment, usedIds: Set<string>): LibraryItem {
  const imp = kind === "impediment" ? (row as Impediment) : null;
  return {
    id: row.id,
    kind,
    name: row.name,
    explanation: row.explanation,
    scope: row.scope as ItemScope,
    rank: row.rank,
    archived_at: row.archived_at,
    proof_when: imp?.proof_when ?? null,
    proof_then: imp?.proof_then ?? null,
    used: usedIds.has(row.id),
  };
}

/** The whole library of one kind, archived rows included, in rank order. */
export async function loadLibrary(supabase: Client, kind: ItemKind): Promise<LibraryItem[]> {
  if (kind === "cue") {
    const [rows, used] = await Promise.all([
      supabase.from("cues").select("*").order("rank").order("created_at"),
      supabase.from("sprint_cues").select("cue_id"),
    ]);
    if (rows.error) throw new Error(`cues: ${rows.error.message}`);
    if (used.error) throw new Error(`sprint_cues: ${used.error.message}`);
    const usedIds = new Set(used.data.map((m) => m.cue_id));
    return rows.data.map((r) => toItem("cue", r, usedIds));
  }
  const [rows, used] = await Promise.all([
    supabase.from("impediments").select("*").order("rank").order("created_at"),
    supabase.from("sprint_impediments").select("impediment_id"),
  ]);
  if (rows.error) throw new Error(`impediments: ${rows.error.message}`);
  if (used.error) throw new Error(`sprint_impediments: ${used.error.message}`);
  const usedIds = new Set(used.data.map((m) => m.impediment_id));
  return rows.data.map((r) => toItem("impediment", r, usedIds));
}

/** Active (non-archived) items of both kinds, for pickers. Rule 24: archived never appear here. */
export async function loadActiveLibrary(supabase: Client): Promise<{ cues: LibraryItem[]; impediments: LibraryItem[] }> {
  const [cues, impediments] = await Promise.all([loadLibrary(supabase, "cue"), loadLibrary(supabase, "impediment")]);
  return {
    cues: cues.filter((c) => c.archived_at === null),
    impediments: impediments.filter((i) => i.archived_at === null),
  };
}

export async function loadLibraryCounts(supabase: Client): Promise<{ cues: number; impediments: number }> {
  const [c, i] = await Promise.all([
    supabase.from("cues").select("id", { count: "exact", head: true }).is("archived_at", null),
    supabase.from("impediments").select("id", { count: "exact", head: true }).is("archived_at", null),
  ]);
  if (c.error) throw new Error(`cues: ${c.error.message}`);
  if (i.error) throw new Error(`impediments: ${i.error.message}`);
  return { cues: c.count ?? 0, impediments: i.count ?? 0 };
}

export type SprintItems = {
  cues: LibraryItem[];
  impediments: (LibraryItem & { is_highest: boolean })[];
};

/** The sprint's current members (active memberships only), each with its library row. */
export async function loadSprintItems(supabase: Client, sprintId: string): Promise<SprintItems> {
  const [cues, imps] = await Promise.all([
    supabase.from("sprint_cues").select("cue_id, cues(*)").eq("sprint_id", sprintId).is("removed_at", null),
    supabase.from("sprint_impediments").select("impediment_id, is_highest, impediments(*)").eq("sprint_id", sprintId).is("removed_at", null),
  ]);
  if (cues.error) throw new Error(`sprint_cues: ${cues.error.message}`);
  if (imps.error) throw new Error(`sprint_impediments: ${imps.error.message}`);
  const all = new Set<string>();
  const byRank = (a: LibraryItem, b: LibraryItem) => a.rank - b.rank || a.name.localeCompare(b.name);
  return {
    cues: cues.data
      .filter((m) => m.cues)
      .map((m) => toItem("cue", m.cues as Cue, all))
      .map((c) => ({ ...c, used: true }))
      .sort(byRank),
    impediments: imps.data
      .filter((m) => m.impediments)
      .map((m) => ({ ...toItem("impediment", m.impediments as Impediment, all), used: true, is_highest: m.is_highest }))
      .sort(byRank),
  };
}

export type OfferedItems = { cues: LibraryItem[]; impediments: LibraryItem[] };

/** What Day Close offers for this day (rule 23), straight from the DB function the close uses. */
export async function loadDayOfferedItems(supabase: Client, dayId: string): Promise<OfferedItems> {
  const res = await supabase.rpc("day_offered_items", { p_sprint_day_id: dayId });
  if (res.error) throw new Error(`day_offered_items: ${res.error.message}`);
  const rows = res.data.map((r) => ({
    id: r.item_id,
    kind: r.kind as ItemKind,
    name: r.name,
    explanation: r.explanation,
    scope: "global" as ItemScope,
    rank: r.rank,
    archived_at: null,
    proof_when: r.proof_when,
    proof_then: r.proof_then,
    used: true,
  }));
  const byRank = (a: LibraryItem, b: LibraryItem) => a.rank - b.rank || a.name.localeCompare(b.name);
  return {
    cues: rows.filter((r) => r.kind === "cue").sort(byRank),
    impediments: rows.filter((r) => r.kind === "impediment").sort(byRank),
  };
}
