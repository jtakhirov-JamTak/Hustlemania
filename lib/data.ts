import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";
import { AREAS, type AreaKey } from "@/lib/areas";
import type { Database, Tables } from "@/lib/database.types";
import { NO_OBSERVATIONS, type DayObservations } from "@/lib/daySummary";
import { report } from "@/lib/observe";

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
  /** F6: the moment a cue fires (cue only; null on cues saved before F6 until edited). */
  cue_when: string | null;
  proof_when: string | null;
  proof_then: string | null;
  /** F6: RECOVERED WHEN — what you would observe to know you are back on track. */
  proof_recover: string | null;
  /** Has ever been a member of any sprint (rule 19: then it can only be archived). */
  used: boolean;
  /** Is a current member of an active sprint. */
  active: boolean;
};

export type AreaOverview = {
  key: AreaKey;
  name: string;
  vision: Vision | null;
  sprint: Sprint | null;
};

/**
 * Active vision and active sprint per area, for sidebars and empty states. Memoised per
 * request on the client identity: the sprints layout, its index page and the vision
 * layout all read it, and one request should ask the DB once.
 */
export const loadOverview = cache(async (supabase: Client): Promise<AreaOverview[]> => {
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
});

export async function loadActiveVision(supabase: Client, area: AreaKey): Promise<Vision | null> {
  const res = await supabase.from("visions").select("*").eq("area", area).is("archived_at", null).maybeSingle();
  if (res.error) throw new Error(`vision: ${res.error.message}`);
  return res.data;
}

export async function loadActiveSprint(
  supabase: Client,
  area: AreaKey,
): Promise<{ sprint: Sprint; days: SprintDay[] } | null> {
  // One round trip: the 14 days ride along on the sprint row (FK embed, RLS on both).
  const res = await supabase
    .from("sprints")
    .select("*, sprint_days(*)")
    .eq("area", area)
    .eq("status", "active")
    .order("day_index", { referencedTable: "sprint_days" })
    .maybeSingle();
  if (res.error) throw new Error(`sprint: ${res.error.message}`);
  if (!res.data) return null;
  const { sprint_days: days, ...sprint } = res.data;
  return { sprint, days };
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

/**
 * The streak of one active sprint. The RPC returns a row for every active sprint of the
 * caller, so a missing row is a defect (grant drift, a status the RPC does not list),
 * not a zero — it renders as 0 but is reported so it cannot hide.
 */
export function streakOf(streaks: Map<string, number>, sprintId: string): number {
  const streak = streaks.get(sprintId);
  if (streak === undefined) report("streak.missing", null, { sprintId });
  return streak ?? 0;
}

/** Items a sprint in `area` may carry: global scope or the area's own (rules 3–4). */
export function eligibleFor(area: AreaKey): (item: { scope: string }) => boolean {
  return (item) => item.scope === "global" || item.scope === area;
}

type ProofParts = Pick<LibraryItem, "proof_when" | "proof_then" | "proof_recover">;

/** All three parts of a Proof Point are present (rule 6, F6). */
export function proofComplete(i: ProofParts): boolean {
  return Boolean(i.proof_when && i.proof_then && i.proof_recover);
}

/** "WHEN … · THEN … · RECOVERED …" over the parts an impediment has; null when it has none. */
export function proofSummary(i: ProofParts): string | null {
  const parts = [i.proof_when && `WHEN ${i.proof_when}`, i.proof_then && `THEN ${i.proof_then}`, i.proof_recover && `RECOVERED ${i.proof_recover}`].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/** "WHEN …" for a cue that has its trigger; null for a pre-F6 cue. */
export function cueSummary(c: Pick<LibraryItem, "cue_when">): string | null {
  return c.cue_when ? `WHEN ${c.cue_when}` : null;
}

/**
 * Promise.all that lets every read finish: the first rejection is what is thrown, and
 * no sibling rejection is left unhandled to surface as noise with no route context.
 */
export async function allOrThrow<T extends readonly unknown[] | []>(promises: T): Promise<{ -readonly [K in keyof T]: Awaited<T[K]> }> {
  const settled = (await Promise.allSettled(promises as readonly Promise<unknown>[])) as PromiseSettledResult<unknown>[];
  for (const s of settled) if (s.status === "rejected") throw s.reason;
  return settled.map((s) => (s as PromiseFulfilledResult<unknown>).value) as { -readonly [K in keyof T]: Awaited<T[K]> };
}

export async function loadDays(supabase: Client, sprintId: string): Promise<SprintDay[]> {
  const days = await supabase.from("sprint_days").select("*").eq("sprint_id", sprintId).order("day_index");
  if (days.error) throw new Error(`sprint_days: ${days.error.message}`);
  return days.data;
}

function toItem(kind: ItemKind, row: Cue | Impediment, usage: { used: boolean; active: boolean }): LibraryItem {
  const cue = kind === "cue" ? (row as Cue) : null;
  const imp = kind === "impediment" ? (row as Impediment) : null;
  return {
    id: row.id,
    kind,
    name: row.name,
    explanation: row.explanation,
    scope: row.scope as ItemScope,
    rank: row.rank,
    archived_at: row.archived_at,
    cue_when: cue?.cue_when ?? null,
    proof_when: imp?.proof_when ?? null,
    proof_then: imp?.proof_then ?? null,
    proof_recover: imp?.proof_recover ?? null,
    used: usage.used,
    active: usage.active,
  };
}

const IN_SPRINT = { used: true, active: true };

/**
 * The whole library of one kind, archived rows included, in rank order. `used` (rule
 * 19) and `active` come from the `library_item_usage` view, one row per item computed
 * in SQL and read in parallel with the items, so the read is O(library) however many
 * sprints the user has run — never the membership history itself.
 */
export async function loadLibrary(supabase: Client, kind: ItemKind): Promise<LibraryItem[]> {
  const usageQuery = supabase.from("library_item_usage").select("item_id, used, active").eq("kind", kind);
  const [rows, usage] = kind === "cue"
    ? await Promise.all([supabase.from("cues").select("*").order("rank").order("created_at"), usageQuery])
    : await Promise.all([supabase.from("impediments").select("*").order("rank").order("created_at"), usageQuery]);
  if (rows.error) throw new Error(`${kind === "cue" ? "cues" : "impediments"}: ${rows.error.message}`);
  if (usage.error) throw new Error(`library_item_usage: ${usage.error.message}`);
  const byId = new Map(usage.data.map((u) => [u.item_id, { used: Boolean(u.used), active: Boolean(u.active) }]));
  return rows.data.map((r) => toItem(kind, r, byId.get(r.id) ?? { used: false, active: false }));
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
  cues: (LibraryItem & { is_focus: boolean })[];
  impediments: (LibraryItem & { is_highest: boolean })[];
};

/** The sprint's current members (active memberships only), each with its library row. */
export async function loadSprintItems(supabase: Client, sprintId: string): Promise<SprintItems> {
  const [cues, imps] = await Promise.all([
    supabase.from("sprint_cues").select("cue_id, is_focus, cues(*)").eq("sprint_id", sprintId).is("removed_at", null),
    supabase.from("sprint_impediments").select("impediment_id, is_highest, impediments(*)").eq("sprint_id", sprintId).is("removed_at", null),
  ]);
  if (cues.error) throw new Error(`sprint_cues: ${cues.error.message}`);
  if (imps.error) throw new Error(`sprint_impediments: ${imps.error.message}`);
  // A membership whose library row is not visible means RLS or a grant drifted between
  // the two tables; the sprint would render short of what the rules require.
  const orphans = cues.data.filter((m) => !m.cues).length + imps.data.filter((m) => !m.impediments).length;
  if (orphans > 0) report("sprint_items.orphan_membership", null, { sprintId, orphans });
  return {
    cues: cues.data
      .filter((m) => m.cues)
      .map((m) => ({ ...toItem("cue", m.cues as Cue, IN_SPRINT), is_focus: m.is_focus }))
      .sort(byRank),
    impediments: imps.data
      .filter((m) => m.impediments)
      .map((m) => ({ ...toItem("impediment", m.impediments as Impediment, IN_SPRINT), is_highest: m.is_highest }))
      .sort(byRank),
  };
}

const byRank = (a: LibraryItem, b: LibraryItem) => a.rank - b.rank || a.name.localeCompare(b.name);

/** What Day Close asks about: the focus cue is asked first, so the flag rides along. */
export type OfferedItems = { cues: (LibraryItem & { is_focus: boolean })[]; impediments: LibraryItem[] };

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
    cue_when: r.cue_when,
    proof_when: r.proof_when,
    proof_then: r.proof_then,
    proof_recover: r.proof_recover,
    is_focus: r.is_focus,
    used: true,
    active: true,
  }));
  return {
    cues: rows.filter((r) => r.kind === "cue").sort((a, b) => Number(b.is_focus) - Number(a.is_focus) || byRank(a, b)),
    impediments: rows.filter((r) => r.kind === "impediment").sort(byRank),
  };
}

/**
 * F7's observation rows for every closed day of a sprint, keyed by day id (F8: the
 * closed row's tail, the Closed card's summary line, "Set up tomorrow"). Two reads,
 * both under the tables' SELECT policies; a day without rows maps to no observations.
 */
export async function loadSprintObservations(supabase: Client, dayIds: string[]): Promise<Map<string, DayObservations>> {
  const out = new Map<string, DayObservations>();
  if (dayIds.length === 0) return out;
  const [imps, cues] = await Promise.all([
    supabase.from("day_impediment_observations").select("sprint_day_id, impediment_id, name, occurred, was_highest").in("sprint_day_id", dayIds).order("created_at").order("id"),
    supabase.from("day_cue_observations").select("sprint_day_id, cue_id, name, used, was_focus").in("sprint_day_id", dayIds).order("created_at").order("id"),
  ]);
  if (imps.error) throw new Error(`day_impediment_observations: ${imps.error.message}`);
  if (cues.error) throw new Error(`day_cue_observations: ${cues.error.message}`);
  const of = (id: string) => {
    let d = out.get(id);
    if (!d) {
      d = { impediments: [], cues: [] };
      out.set(id, d);
    }
    return d;
  };
  for (const r of imps.data) of(r.sprint_day_id).impediments.push({ id: r.impediment_id, name: r.name, occurred: r.occurred, was_highest: r.was_highest });
  for (const r of cues.data) of(r.sprint_day_id).cues.push({ id: r.cue_id, name: r.name, used: r.used, was_focus: r.was_focus });
  return out;
}

export function observationsOf(map: Map<string, DayObservations>, dayId: string): DayObservations {
  return map.get(dayId) ?? NO_OBSERVATIONS;
}
