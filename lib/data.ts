import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";
import type { Scope, SprintInsights } from "@/lib/across";
import { AREAS, type AreaKey } from "@/lib/areas";
import type { Database, Tables } from "@/lib/database.types";
import { NO_OBSERVATIONS, type CueObservation, type DayObservations, type ImpedimentObservation } from "@/lib/daySummary";
import { goalMet, type Measurement } from "@/lib/format";
import { report } from "@/lib/observe";
import { sprintDayFor } from "@/lib/sprintDay";

export type Vision = Tables<"visions">;
export type Sprint = Tables<"sprints">;
export type SprintDay = Tables<"sprint_days">;
export type Task = Tables<"tasks">;
export type Cue = Tables<"cues">;
export type Impediment = Tables<"impediments">;
export type Client = SupabaseClient<Database>;

export type ItemKind = "cue" | "impediment";
/** F15: the library functions (archive, scope, rank, restore) also take a situation. */
export type LibraryKind = ItemKind | "situation";
export type ItemScope = "global" | AreaKey;
export const SCOPES: { key: ItemScope; label: string }[] = [
  { key: "global", label: "Global" },
  ...AREAS.map((a) => ({ key: a.key, label: a.name })),
];
export function isItemScope(value: string): value is ItemScope {
  return SCOPES.some((s) => s.key === value);
}

/** F15: a situation as an item carries it — live attachments only (an archived one is not offered). */
export type SituationRef = { id: string; name: string };

/**
 * One library entry, cue or impediment, in the shape every list and picker renders.
 * F15: an impediment's `name` is its WHEN; a cue's `name` is its REMIND and `cue_when`
 * its WHEN. Both apply to one or more situations.
 */
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
  proof_then: string | null;
  /** F6: RECOVERED WHEN — what you would observe to know you are back on track. */
  proof_recover: string | null;
  /** F15: the live situations this response applies to, in rank order. */
  situations: SituationRef[];
  /** Has ever been a member of any sprint (rule 19: then it can only be archived). */
  used: boolean;
  /** Is a current member of an active sprint. */
  active: boolean;
};

/** F15: one row of a situations library (per kind), archived rows included. */
export type SituationItem = {
  id: string;
  kind: ItemKind;
  name: string;
  scope: ItemScope;
  rank: number;
  archived_at: string | null;
  /** Attached to an item that has ever been a member of a sprint. */
  used: boolean;
  /** Attached to a current member of an active sprint. */
  active: boolean;
  /** Live items it is attached to. */
  attached: number;
};

export type AreaOverview = {
  key: AreaKey;
  name: string;
  sprint: Sprint | null;
};

/** F9: the account's one active vision plus the active sprint per area. F16: `visionReady` is the sprint gate (all three steps saved). */
export type Overview = { vision: Vision | null; visionReady: boolean; areas: AreaOverview[] };

/**
 * The active vision and the active sprint per area, for sidebars and empty states.
 * Memoised per request on the client identity: the sprints layout, its index page and
 * the wizard page all read it, and one request should ask the DB once.
 */
export const loadOverview = cache(async (supabase: Client): Promise<Overview> => {
  const [visions, sprints] = await Promise.all([
    supabase.from("visions").select("*, obstacle:impediments(id, name, proof_then, proof_recover)").is("archived_at", null).maybeSingle(),
    supabase.from("sprints").select("*").eq("status", "active"),
  ]);
  if (visions.error) throw new Error(`visions: ${visions.error.message}`);
  if (sprints.error) throw new Error(`sprints: ${sprints.error.message}`);
  let vision: Vision | null = null;
  let ready = false;
  if (visions.data) {
    const { obstacle, ...rest } = visions.data;
    vision = rest;
    ready = visionReady({ vision: rest, obstacle: obstacle ?? null, latestReview: null, sprintCount: 0 });
  }
  return {
    vision,
    visionReady: ready,
    areas: AREAS.map((a) => ({ key: a.key, name: a.name, sprint: sprints.data.find((s) => s.area === a.key) ?? null })),
  };
});

/** The vision's main obstacle: a global impediment, with its guiding rule (WHEN is its name; THEN and RECOVERED WHEN the proof parts). */
export type VisionObstacle = Pick<Impediment, "id" | "name" | "proof_then" | "proof_recover">;

export type VisionReview = { verdict: string; created_at: string };

/** F16: an archived vision may have been replaced before its goal was written. */
export type PreviousVision = { id: string; body: string | null; picture: string | null; created_at: string; archived_at: string; sprintCount: number };

export type ActiveVision = {
  vision: Vision;
  obstacle: VisionObstacle | null;
  latestReview: VisionReview | null;
  sprintCount: number;
};

export type VisionView = { active: ActiveVision | null; previous: PreviousVision[] };

/** F16: how many of the three annual steps are saved — the picture, the goal, an obstacle with its complete rule. */
export function visionSteps(v: ActiveVision | null): 0 | 1 | 2 | 3 {
  if (!v) return 0;
  const done = [Boolean(v.vision.picture), Boolean(v.vision.body), Boolean(v.obstacle && proofComplete(v.obstacle))].filter(Boolean).length;
  return done as 0 | 1 | 2 | 3;
}

/** F16: sprints unlock only when all three steps are saved (`start_sprint` raises `vision_incomplete` otherwise). */
export function visionReady(v: ActiveVision | null): boolean {
  return visionSteps(v) === 3;
}

/**
 * F9: the active vision with its obstacle, the latest review and the count of sprints
 * behind it, plus the archived visions with their sprint counts. Three reads, all under
 * RLS; memoised per request because the Vision layout (sidebar) and page both need it.
 */
export const loadVision = cache(async (supabase: Client): Promise<VisionView> => {
  const [visions, sprints] = await Promise.all([
    supabase
      .from("visions")
      .select("*, obstacle:impediments(id, name, proof_then, proof_recover)")
      .order("archived_at", { ascending: false, nullsFirst: true }),
    supabase.from("sprints").select("vision_id"),
  ]);
  if (visions.error) throw new Error(`visions: ${visions.error.message}`);
  if (sprints.error) throw new Error(`sprints: ${sprints.error.message}`);
  const counts = new Map<string, number>();
  for (const s of sprints.data) counts.set(s.vision_id, (counts.get(s.vision_id) ?? 0) + 1);

  const activeRow = visions.data.find((v) => v.archived_at === null) ?? null;
  let latestReview: VisionReview | null = null;
  if (activeRow) {
    const review = await supabase.from("vision_reviews").select("verdict, created_at").eq("vision_id", activeRow.id).order("created_at", { ascending: false }).order("id").limit(1).maybeSingle();
    if (review.error) throw new Error(`vision_reviews: ${review.error.message}`);
    latestReview = review.data;
  }
  const previous: PreviousVision[] = visions.data
    .filter((v) => v.archived_at !== null)
    .map((v) => ({ id: v.id, body: v.body, picture: v.picture, created_at: v.created_at, archived_at: v.archived_at!, sprintCount: counts.get(v.id) ?? 0 }));
  if (!activeRow) return { active: null, previous };
  const { obstacle, ...vision } = activeRow;
  return { active: { vision, obstacle: obstacle ?? null, latestReview, sprintCount: counts.get(vision.id) ?? 0 }, previous };
});

/** One row of "Sprints behind this vision": status from the sprint's own zone, the verdict once its end date has passed. */
export type VisionSprintRow = {
  id: string;
  area: AreaKey;
  outcome: string;
  label: string;
  /** Set once the end date has passed: the sum of closed days against the goal. */
  verdict: { met: boolean; actual: number; goal: number; measured: { measurement: Measurement; currency: string | null; unit: string | null } } | null;
};

/**
 * Sprints started behind the active vision, active first, then newest first. A finished
 * sprint is finished whatever its dates say (ended early on day 5 is not "Day 6 of 14");
 * its total comes from `sprint_totals`, the summary's own sum, so Met/Under here is the
 * result card's (full review 2026-09-09, #5, #19).
 */
export async function loadVisionSprints(supabase: Client, visionId: string, now = new Date()): Promise<VisionSprintRow[]> {
  const sprints = await supabase.from("sprints").select("*").eq("vision_id", visionId).order("start_date", { ascending: false }).order("id");
  if (sprints.error) throw new Error(`sprints: ${sprints.error.message}`);
  const ids = full("sprints", sprints.data).map((s) => s.id);
  const totals = ids.length ? await supabase.from("sprint_totals").select("sprint_id, total").in("sprint_id", ids) : { data: [], error: null };
  if (totals.error) throw new Error(`sprint_totals: ${totals.error.message}`);
  const actuals = new Map(totals.data.map((t) => [t.sprint_id, Number(t.total ?? 0)]));

  const rows = sprints.data.map((s): VisionSprintRow => {
    const pos = sprintDayFor(s, now);
    const finished = s.status !== "active";
    const label = finished ? (COMPLETION_LABEL[s.status] ?? "Ended") : pos.kind === "during" ? `Day ${pos.dayIndex} of 14` : pos.kind === "before" ? "Starts tomorrow" : "Ended";
    const actual = actuals.get(s.id) ?? 0;
    const goal = Number(s.amount);
    return {
      id: s.id,
      area: s.area as AreaKey,
      outcome: s.outcome,
      label,
      verdict:
        finished || pos.kind === "after"
          ? { met: goalMet(actual, goal), actual, goal, measured: { measurement: s.measurement as Measurement, currency: s.currency, unit: s.unit } }
          : null,
    };
  });
  return rows.sort((a, b) => Number(a.verdict !== null) - Number(b.verdict !== null));
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

type ProofParts = Pick<LibraryItem, "proof_then" | "proof_recover">;

/** Both parts of the response are present (rule 6 as amended by F15: THEN + RECOVERED WHEN; WHEN is the name). */
export function proofComplete(i: ProofParts): boolean {
  return Boolean(i.proof_then && i.proof_recover);
}

/** "THEN … · RECOVERED …" over the parts an impediment has; null when it has none. */
export function proofSummary(i: ProofParts): string | null {
  const parts = [i.proof_then && `THEN ${i.proof_then}`, i.proof_recover && `RECOVERED ${i.proof_recover}`].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/** "WHEN …" for a cue that has its trigger; null for a pre-F6 cue. */
export function cueSummary(c: Pick<LibraryItem, "cue_when">): string | null {
  return c.cue_when ? `WHEN ${c.cue_when}` : null;
}

/** F15: "a, b, c" — the situations an item applies to; null when it has none. */
export function appliesTo(i: Pick<LibraryItem, "situations">): string | null {
  return i.situations.length ? i.situations.map((s) => s.name).join(", ") : null;
}

/** F15: a member needs at least one live situation; an item without one cannot join a sprint. */
export function hasSituation(i: Pick<LibraryItem, "situations">): boolean {
  return i.situations.length > 0;
}

/** F15: what keeps an item out of a sprint, in the order start_sprint checks it; null when it may join. */
export function joinBlocker(i: Pick<LibraryItem, "kind" | "situations" | "proof_then" | "proof_recover">): "situation" | "response" | null {
  if (!hasSituation(i)) return "situation";
  if (i.kind === "impediment" && !proofComplete(i)) return "response";
  return null;
}

/**
 * PostgREST returns at most this many rows per request (`max_rows`, supabase/config.toml);
 * a list read that reaches it is truncated, not complete. Every read that could grow
 * past it is bounded by construction (per-sprint views, `.in(...)` filters); `full`
 * is the guard that says so out loud instead of rendering a plausible partial number
 * (full review 2026-09-09, #5).
 */
export const PAGE_CAP = 1000;

export function full<T>(name: string, rows: T[]): T[] {
  if (rows.length >= PAGE_CAP) throw new Error(`${name}: result truncated at ${PAGE_CAP} rows`);
  return rows;
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

/** The attachment embed every library read carries: `situations(id, name, archived_at)` through the join table. */
type SituationEmbed = { situations: { id: string; name: string; archived_at: string | null; rank: number } | null }[];
const SITUATIONS_EMBED = "situations(id, name, archived_at, rank)";
const CUE_SELECT = `*, cue_situations(${SITUATIONS_EMBED})`;
const IMPEDIMENT_SELECT = `*, impediment_situations(${SITUATIONS_EMBED})`;

function liveSituations(embed: SituationEmbed | null | undefined): SituationRef[] {
  return (embed ?? [])
    .map((a) => a.situations)
    .filter((s): s is NonNullable<typeof s> => s !== null && s.archived_at === null)
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
    .map((s) => ({ id: s.id, name: s.name }));
}

type CueRowWithSituations = Cue & { cue_situations?: SituationEmbed | null };
type ImpedimentRowWithSituations = Impediment & { impediment_situations?: SituationEmbed | null };

function toItem(kind: ItemKind, row: CueRowWithSituations | ImpedimentRowWithSituations, usage: { used: boolean; active: boolean }): LibraryItem {
  const cue = kind === "cue" ? (row as CueRowWithSituations) : null;
  const imp = kind === "impediment" ? (row as ImpedimentRowWithSituations) : null;
  return {
    id: row.id,
    kind,
    name: row.name,
    // F16: only a cue carries a free-text note; impediments lost INTERFERES.
    explanation: "explanation" in row ? row.explanation : null,
    scope: row.scope as ItemScope,
    rank: row.rank,
    archived_at: row.archived_at,
    cue_when: cue?.cue_when ?? null,
    proof_then: imp?.proof_then ?? null,
    proof_recover: imp?.proof_recover ?? null,
    situations: liveSituations(cue ? cue.cue_situations : imp?.impediment_situations),
    used: usage.used,
    active: usage.active,
  };
}

const IN_SPRINT = { used: true, active: true };

/**
 * The whole library of one kind, archived rows included, in rank order. `used` (rule
 * 19) and `active` come from the `library_item_usage` view, one row per item computed
 * in SQL and read in parallel with the items, so the read is O(library) however many
 * sprints the user has run — never the membership history itself. F15: each item's
 * situations ride along on the join-table embed.
 */
export async function loadLibrary(supabase: Client, kind: ItemKind): Promise<LibraryItem[]> {
  const usageQuery = supabase.from("library_item_usage").select("item_id, used, active").eq("kind", kind);
  const [rows, usage] = kind === "cue"
    ? await Promise.all([supabase.from("cues").select(CUE_SELECT).order("rank").order("created_at"), usageQuery])
    : await Promise.all([supabase.from("impediments").select(IMPEDIMENT_SELECT).order("rank").order("created_at"), usageQuery]);
  if (rows.error) throw new Error(`${kind === "cue" ? "cues" : "impediments"}: ${rows.error.message}`);
  if (usage.error) throw new Error(`library_item_usage: ${usage.error.message}`);
  const byId = new Map(usage.data.map((u) => [u.item_id, { used: Boolean(u.used), active: Boolean(u.active) }]));
  return (rows.data as (CueRowWithSituations | ImpedimentRowWithSituations)[]).map((r) => toItem(kind, r, byId.get(r.id) ?? { used: false, active: false }));
}

/** Active (non-archived) items of both kinds, for pickers. Rule 24: archived never appear here. */
export async function loadActiveLibrary(supabase: Client): Promise<{ cues: LibraryItem[]; impediments: LibraryItem[] }> {
  const [cues, impediments] = await Promise.all([loadLibrary(supabase, "cue"), loadLibrary(supabase, "impediment")]);
  return {
    cues: cues.filter((c) => c.archived_at === null),
    impediments: impediments.filter((i) => i.archived_at === null),
  };
}

/**
 * F15: the situations library of one kind, archived rows included, in rank order.
 * `used` / `active` come from `library_item_usage`'s situation branch; `attached` counts
 * the live items it is attached to, from the join table under RLS.
 */
export async function loadSituations(supabase: Client, kind: ItemKind): Promise<SituationItem[]> {
  const [rows, usage, joins] = await Promise.all([
    supabase.from("situations").select("*").eq("kind", kind).order("rank").order("created_at"),
    supabase.from("library_item_usage").select("item_id, used, active").eq("kind", "situation"),
    kind === "cue"
      ? supabase.from("cue_situations").select("situation_id, cues!inner(archived_at)").is("cues.archived_at", null)
      : supabase.from("impediment_situations").select("situation_id, impediments!inner(archived_at)").is("impediments.archived_at", null),
  ]);
  if (rows.error) throw new Error(`situations: ${rows.error.message}`);
  if (usage.error) throw new Error(`library_item_usage: ${usage.error.message}`);
  if (joins.error) throw new Error(`situation attachments: ${joins.error.message}`);
  const byId = new Map(usage.data.map((u) => [u.item_id, { used: Boolean(u.used), active: Boolean(u.active) }]));
  const attached = new Map<string, number>();
  for (const j of joins.data as { situation_id: string }[]) attached.set(j.situation_id, (attached.get(j.situation_id) ?? 0) + 1);
  return rows.data.map((r) => ({
    id: r.id,
    kind: r.kind as ItemKind,
    name: r.name,
    scope: r.scope as ItemScope,
    rank: r.rank,
    archived_at: r.archived_at,
    used: byId.get(r.id)?.used ?? false,
    active: byId.get(r.id)?.active ?? false,
    attached: attached.get(r.id) ?? 0,
  }));
}

/** F15: live situations of both kinds, for the pickers (rule 24: archived never appear here). */
export async function loadActiveSituations(supabase: Client): Promise<{ cues: SituationItem[]; impediments: SituationItem[] }> {
  const [cues, impediments] = await Promise.all([loadSituations(supabase, "cue"), loadSituations(supabase, "impediment")]);
  return { cues: cues.filter((s) => s.archived_at === null), impediments: impediments.filter((s) => s.archived_at === null) };
}

export async function loadLibraryCounts(supabase: Client): Promise<{ cues: number; impediments: number; cueSituations: number; impedimentSituations: number }> {
  const [c, i, sc, si] = await Promise.all([
    supabase.from("cues").select("id", { count: "exact", head: true }).is("archived_at", null),
    supabase.from("impediments").select("id", { count: "exact", head: true }).is("archived_at", null),
    supabase.from("situations").select("id", { count: "exact", head: true }).eq("kind", "cue").is("archived_at", null),
    supabase.from("situations").select("id", { count: "exact", head: true }).eq("kind", "impediment").is("archived_at", null),
  ]);
  if (c.error) throw new Error(`cues: ${c.error.message}`);
  if (i.error) throw new Error(`impediments: ${i.error.message}`);
  if (sc.error) throw new Error(`situations: ${sc.error.message}`);
  if (si.error) throw new Error(`situations: ${si.error.message}`);
  return { cues: c.count ?? 0, impediments: i.count ?? 0, cueSituations: sc.count ?? 0, impedimentSituations: si.count ?? 0 };
}

export type SprintItems = {
  /** `removed`: a postmortem member whose every membership row was removed mid-sprint (loadSprintMembers only). */
  cues: (LibraryItem & { is_focus: boolean; removed?: boolean })[];
  impediments: (LibraryItem & { is_highest: boolean; removed?: boolean })[];
};

/** The sprint's current members (active memberships only), each with its library row. */
export async function loadSprintItems(supabase: Client, sprintId: string): Promise<SprintItems> {
  const [cues, imps] = await Promise.all([
    supabase.from("sprint_cues").select(`cue_id, is_focus, cues(${CUE_SELECT})`).eq("sprint_id", sprintId).is("removed_at", null),
    supabase.from("sprint_impediments").select(`impediment_id, is_highest, impediments(${IMPEDIMENT_SELECT})`).eq("sprint_id", sprintId).is("removed_at", null),
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
      .map((m) => ({ ...toItem("cue", m.cues as unknown as CueRowWithSituations, IN_SPRINT), is_focus: m.is_focus }))
      .sort(byRank),
    impediments: imps.data
      .filter((m) => m.impediments)
      .map((m) => ({ ...toItem("impediment", m.impediments as unknown as ImpedimentRowWithSituations, IN_SPRINT), is_highest: m.is_highest }))
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
    proof_then: r.proof_then,
    proof_recover: r.proof_recover,
    // F15: the item's live situations as of the call — `[{id, name, rank}]` in rank order.
    situations: ((r.situations ?? []) as { id: string; name: string }[]).map((s) => ({ id: s.id, name: s.name })),
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
 * closed row's tail, the Closed card's summary line, "Set up tomorrow"), with F15's
 * situation rows nested under each. Four reads, all under the tables' SELECT policies;
 * a day without rows maps to no observations.
 */
export async function loadSprintObservations(supabase: Client, dayIds: string[]): Promise<Map<string, DayObservations>> {
  const out = new Map<string, DayObservations>();
  if (dayIds.length === 0) return out;
  const [imps, cues] = await Promise.all([
    supabase.from("day_impediment_observations").select("id, sprint_day_id, impediment_id, name, occurred, was_highest").in("sprint_day_id", dayIds).order("created_at").order("id"),
    supabase.from("day_cue_observations").select("id, sprint_day_id, cue_id, name, used, was_focus").in("sprint_day_id", dayIds).order("created_at").order("id"),
  ]);
  if (imps.error) throw new Error(`day_impediment_observations: ${imps.error.message}`);
  if (cues.error) throw new Error(`day_cue_observations: ${cues.error.message}`);
  const impIds = imps.data.map((r) => r.id);
  const cueIds = cues.data.map((r) => r.id);
  const [impSits, cueSits] = await Promise.all([
    impIds.length
      ? supabase.from("day_impediment_situation_observations").select("observation_id, situation_id, name, occurred, recovered").in("observation_id", impIds).order("created_at").order("id")
      : { data: [] as { observation_id: string; situation_id: string; name: string; occurred: boolean; recovered: string | null }[], error: null },
    cueIds.length
      ? supabase.from("day_cue_situation_observations").select("observation_id, situation_id, name, applied").in("observation_id", cueIds).order("created_at").order("id")
      : { data: [] as { observation_id: string; situation_id: string; name: string; applied: boolean }[], error: null },
  ]);
  if (impSits.error) throw new Error(`day_impediment_situation_observations: ${impSits.error.message}`);
  if (cueSits.error) throw new Error(`day_cue_situation_observations: ${cueSits.error.message}`);
  const impSitsBy = new Map<string, ImpedimentObservation["situations"]>();
  for (const s of impSits.data) {
    const list = impSitsBy.get(s.observation_id) ?? [];
    list.push({ id: s.situation_id, name: s.name, occurred: s.occurred, recovered: s.recovered });
    impSitsBy.set(s.observation_id, list);
  }
  const cueSitsBy = new Map<string, CueObservation["situations"]>();
  for (const s of cueSits.data) {
    const list = cueSitsBy.get(s.observation_id) ?? [];
    list.push({ id: s.situation_id, name: s.name, applied: s.applied });
    cueSitsBy.set(s.observation_id, list);
  }
  const of = (id: string) => {
    let d = out.get(id);
    if (!d) {
      d = { impediments: [], cues: [] };
      out.set(id, d);
    }
    return d;
  };
  for (const r of imps.data) of(r.sprint_day_id).impediments.push({ id: r.impediment_id, name: r.name, occurred: r.occurred, was_highest: r.was_highest, situations: impSitsBy.get(r.id) ?? [] });
  for (const r of cues.data) of(r.sprint_day_id).cues.push({ id: r.cue_id, name: r.name, used: r.used, was_focus: r.was_focus, situations: cueSitsBy.get(r.id) ?? [] });
  return out;
}

export function observationsOf(map: Map<string, DayObservations>, dayId: string): DayObservations {
  return map.get(dayId) ?? NO_OBSERVATIONS;
}

// ---------------------------------------------------------------------------
// F10 — sprint completion, the postmortem and the Area kit.
// ---------------------------------------------------------------------------

/** The four completion statuses, and the words each one puts on the gate card. */
export const COMPLETION_LABEL: Record<string, string> = {
  completed: "sprint complete",
  completed_early: "completed early",
  ended: "sprint ended",
  ended_early: "ended early",
};

export type FinishedSprint = {
  id: string;
  area: AreaKey;
  outcome: string;
  status: string;
  start_date: string;
  end_date: string;
  amount: number;
  /** Days closed, from `sprint_totals`; zero means the sprint never ran. */
  closedDays: number;
  reviewedAt: string | null;
};

/**
 * Rule 26 as `start_sprint` applies it since 0017: an unreviewed finished sprint blocks
 * its Area only if it closed at least one day. A sprint ended before day 1 has nothing
 * to review, and the sidebar and the gate must not say otherwise.
 */
export const needsReview = (s: FinishedSprint): boolean => s.reviewedAt === null && s.closedDays > 0;

/**
 * Every finished sprint, newest first, with whether its postmortem is written. Drives
 * the Insights sidebar and the review gate. Two reads: the review rows are a separate
 * table and there is no join grant to lean on.
 */
export const loadFinishedSprints = cache(async (supabase: Client): Promise<FinishedSprint[]> => {
  const [sprints, reviews, totals] = await Promise.all([
    supabase.from("sprints").select("id, area, outcome, status, start_date, end_date, amount, closed_at").neq("status", "active").order("closed_at", { ascending: false }).order("id"),
    supabase.from("reviews").select("sprint_id, completed_at"),
    supabase.from("sprint_totals").select("sprint_id, closed_days"),
  ]);
  if (sprints.error) throw new Error(`sprints: ${sprints.error.message}`);
  if (reviews.error) throw new Error(`reviews: ${reviews.error.message}`);
  if (totals.error) throw new Error(`sprint_totals: ${totals.error.message}`);
  const reviewed = new Map(reviews.data.map((r) => [r.sprint_id, r.completed_at]));
  const closed = new Map(full("sprint_totals", totals.data).map((t) => [t.sprint_id, Number(t.closed_days ?? 0)]));
  return full("sprints", sprints.data).map((s) => ({
    id: s.id,
    area: s.area as AreaKey,
    outcome: s.outcome,
    status: s.status,
    start_date: s.start_date,
    end_date: s.end_date,
    amount: Number(s.amount),
    closedDays: closed.get(s.id) ?? 0,
    reviewedAt: reviewed.get(s.id) ?? null,
  }));
});

export type MeasuredSprint = FinishedSprint & {
  /** % of goal, from `sprint_review_summary` — the same number the postmortem prints. */
  pct: number;
  met: boolean;
};

/**
 * The Insights sidebar's rows with the outcome measurement on them (F11, D9 — Part 2 §1
 * says these rows ARE the measurement). `pct` and `met` come from
 * `sprint_review_summary`, not from a second calculation over the same days: two
 * arithmetics for one number is how the sidebar and the postmortem come to disagree.
 *
 * Only the Insights tab pays for this. `loadFinishedSprints` stays as it was, so the
 * Sprints sidebar and the review gate do not gain a read per finished sprint.
 */
export const loadMeasuredSprints = cache(async (supabase: Client): Promise<MeasuredSprint[]> => {
  const finished = await loadFinishedSprints(supabase);
  if (finished.length === 0) return [];

  // One request for every sprint (0017), not one per sprint: the wrapper calls the same
  // definer function per id, so each sprint's ownership check still runs.
  const res = await supabase.rpc("sprint_review_summary_many", { p_sprint_ids: finished.map((s) => s.id) });
  if (res.error) throw new Error(`sprint_review_summary_many: ${res.error.message}`);
  const byId = new Map<string, ReviewSummary | null>();
  for (const row of res.data ?? []) byId.set(row.sprint_id, row as unknown as ReviewSummary);
  return mergeMeasures(finished, byId);
});

/**
 * Pair each finished sprint with its own summary. Keyed by sprint id rather than by
 * position: a measurement attached to the wrong row would be a quiet lie on the one
 * screen Part 2 §1 calls the product's measurement, and an id lookup cannot slip.
 *
 * A sprint with no summary row reads 0% and Under rather than throwing — the row still
 * has to render, and "Under · 0% of goal" is true of a sprint with no closed day.
 */
export function mergeMeasures(finished: FinishedSprint[], byId: Map<string, ReviewSummary | null>): MeasuredSprint[] {
  return finished.map((sprint) => {
    const row = byId.get(sprint.id) ?? null;
    return { ...sprint, pct: row?.pct ?? 0, met: row?.met ?? false };
  });
}

export type ImpactRow = {
  item_id: string;
  name: string;
  is_highest: boolean;
  present_days: number;
  absent_days: number;
  logged_days: number;
  unsure_days: number;
  median_present: number | null;
  median_absent: number | null;
  delta_pts: number | null;
  enough: boolean;
};

/**
 * F15: one row per impediment. On the days it showed up, across the situations it
 * showed up in, how often the recovery criterion was met. `verdict_occurrences` is the
 * postmortem's verdict predicate (the current Highest on a day whose snapshot names it).
 */
export type RecoveryRow = {
  item_id: string;
  name: string;
  proof_then: string | null;
  proof_recover: string | null;
  is_highest: boolean;
  occurrences: number;
  verdict_occurrences: number;
  answered: number;
  recovered: number;
  didnt: number;
  rate: number | null;
  enough: boolean;
};

/** F15: one row per (item, situation) that a closed day offered. */
export type SituationRow = {
  kind: ItemKind;
  item_id: string;
  item_name: string;
  situation_id: string;
  situation_name: string;
  occurrences: number;
  asked_days: number;
  recovered_yes: number;
  recovered_answered: number;
  rate: number | null;
  enough: boolean;
};

export type CueRow = {
  item_id: string;
  name: string;
  is_focus: boolean;
  used_days: number;
  unused_days: number;
  logged_days: number;
  unsure_days: number;
  median_used: number | null;
  median_unused: number | null;
  delta_pts: number | null;
  enough: boolean;
};

export type ReviewSummary = {
  total: number;
  goal: number;
  pct: number;
  met: boolean;
  closed_days: number;
  missed_days: number;
  cancelled_days: number;
  best_streak: number;
  status: string;
};

export type ReviewDecision = { kind: ItemKind; item_id: string; decision: string };

export type SavedReview = {
  id: string;
  lesson: string;
  moved_vision: boolean;
  verdict: string | null;
  completed_at: string;
  decisions: ReviewDecision[];
};

/** One day of the sprint as the postmortem's day-by-day block reads it, tasks included. */
export type ClosedDay = {
  day_index: number;
  date: string;
  target: number;
  actual: number | null;
  cancelled: boolean;
  closed: boolean;
  tasks: { text: string; done: boolean }[];
};

export type Postmortem = {
  sprint: Sprint;
  summary: ReviewSummary | null;
  impact: ImpactRow[];
  recovery: RecoveryRow[];
  situations: SituationRow[];
  cues: CueRow[];
  items: SprintItems;
  days: ClosedDay[];
  review: SavedReview | null;
  /**
   * True when the highest impediment occurred on at least one effective day: the
   * verdict is asked exactly then, which is finish_review's own rule.
   */
  verdictApplies: boolean;
};

/** finish_review's own predicate, read off the recovery rows: the current Highest showed up on a counted day. */
export function verdictAppliesFrom(recovery: RecoveryRow[]): boolean {
  return recovery.some((r) => r.is_highest && r.verdict_occurrences > 0);
}

/** `numeric` arrives from PostgREST as a string; every median here is a ratio. */
function numeric(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Everything the postmortem renders. The five calculations are SECURITY DEFINER
 * functions that check ownership themselves, so a sprint that is not the caller's
 * fails loudly instead of rendering an empty page.
 */
export async function loadPostmortem(supabase: Client, sprintId: string): Promise<Postmortem | null> {
  // One batch, the sprint row included (#26): a missing or running sprint returns null
  // before any RPC result is inspected, so the not-found path is unchanged.
  const [sprint, summary, impact, recovery, situations, cues, items, days, review] = await allOrThrow([
    supabase.from("sprints").select("*").eq("id", sprintId).maybeSingle(),
    supabase.rpc("sprint_review_summary", { p_sprint_id: sprintId }),
    supabase.rpc("insight_impediment_impact", { p_sprint_id: sprintId }),
    supabase.rpc("insight_response_recovery", { p_sprint_id: sprintId }),
    supabase.rpc("insight_situations", { p_sprint_id: sprintId }),
    supabase.rpc("insight_cue_usefulness", { p_sprint_id: sprintId }),
    loadSprintMembers(supabase, sprintId),
    loadClosedDays(supabase, sprintId),
    loadReview(supabase, sprintId),
  ]);
  if (sprint.error) throw new Error(`sprint: ${sprint.error.message}`);
  if (!sprint.data || sprint.data.status === "active") return null;
  for (const [name, res] of [
    ["sprint_review_summary", summary],
    ["insight_impediment_impact", impact],
    ["insight_response_recovery", recovery],
    ["insight_situations", situations],
    ["insight_cue_usefulness", cues],
  ] as const) {
    if (res.error) throw new Error(`${name}: ${res.error.message}`);
  }

  const rows = (res: { data: unknown }): Record<string, unknown>[] => (res.data ?? []) as Record<string, unknown>[];
  const impactRows = rows(impact).map((r) => ({ ...r, median_present: numeric(r.median_present), median_absent: numeric(r.median_absent) }) as unknown as ImpactRow);
  const cueRows = rows(cues).map((r) => ({ ...r, median_used: numeric(r.median_used), median_unused: numeric(r.median_unused) }) as unknown as CueRow);
  const recoveryRows = rows(recovery) as unknown as RecoveryRow[];
  const situationRows = rows(situations) as unknown as SituationRow[];

  return {
    sprint: sprint.data,
    summary: (rows(summary)[0] as unknown as ReviewSummary) ?? null,
    impact: impactRows,
    recovery: recoveryRows,
    situations: situationRows,
    cues: cueRows,
    items,
    days,
    review,
    verdictApplies: verdictAppliesFrom(recoveryRows),
  };
}

/**
 * The sprint's members including any removed mid-sprint: the postmortem decides what
 * carries forward, and an item dropped on day 3 was still part of the record.
 */
export async function loadSprintMembers(supabase: Client, sprintId: string): Promise<SprintItems> {
  const [cues, imps] = await Promise.all([
    supabase.from("sprint_cues").select(`cue_id, is_focus, removed_at, cues(${CUE_SELECT})`).eq("sprint_id", sprintId),
    supabase.from("sprint_impediments").select(`impediment_id, is_highest, removed_at, impediments(${IMPEDIMENT_SELECT})`).eq("sprint_id", sprintId),
  ]);
  if (cues.error) throw new Error(`sprint_cues: ${cues.error.message}`);
  if (imps.error) throw new Error(`sprint_impediments: ${imps.error.message}`);
  return {
    cues: onePerItem(
      cues.data.filter((m) => m.cues).map((m) => ({ ...toItem("cue", m.cues as unknown as CueRowWithSituations, IN_SPRINT), is_focus: m.is_focus, removed: m.removed_at !== null })),
    ).sort(byRank),
    impediments: onePerItem(
      imps.data
        .filter((m) => m.impediments)
        .map((m) => ({ ...toItem("impediment", m.impediments as unknown as ImpedimentRowWithSituations, IN_SPRINT), is_highest: m.is_highest, removed: m.removed_at !== null })),
    ).sort(byRank),
  };
}

/**
 * A member removed mid-sprint and added back is two membership rows and one item. The
 * postmortem renders and decides per item, so the rows collapse here: a flag set on any
 * of an item's rows counts (the partial unique indexes allow it on at most one), and the
 * item is `removed` only if every one of its rows is.
 */
export function onePerItem<T extends { id: string; is_focus?: boolean; is_highest?: boolean; removed?: boolean }>(rows: T[]): T[] {
  const byId = new Map<string, T>();
  for (const row of rows) {
    const seen = byId.get(row.id);
    byId.set(
      row.id,
      seen
        ? { ...seen, is_focus: seen.is_focus || row.is_focus, is_highest: seen.is_highest || row.is_highest, removed: Boolean(seen.removed && row.removed) }
        : row,
    );
  }
  return [...byId.values()];
}

/** Every day of the sprint with its tasks — the one place a closed day's tasks are read. */
export async function loadClosedDays(supabase: Client, sprintId: string): Promise<ClosedDay[]> {
  const days = await supabase.from("sprint_days").select("id, day_index, date, target, actual, cancelled, closed_at").eq("sprint_id", sprintId).order("day_index");
  if (days.error) throw new Error(`sprint_days: ${days.error.message}`);
  const ids = days.data.map((d) => d.id);
  const tasks = ids.length
    ? await supabase.from("tasks").select("sprint_day_id, text, done").in("sprint_day_id", ids).is("archived_at", null).order("created_at").order("id")
    : { data: [] as { sprint_day_id: string; text: string; done: boolean }[], error: null };
  if (tasks.error) throw new Error(`tasks: ${tasks.error.message}`);
  const byDay = new Map<string, { text: string; done: boolean }[]>();
  for (const t of tasks.data) {
    const list = byDay.get(t.sprint_day_id) ?? [];
    list.push({ text: t.text, done: t.done });
    byDay.set(t.sprint_day_id, list);
  }
  return days.data.map((d) => ({
    day_index: d.day_index,
    date: d.date,
    target: Number(d.target),
    actual: d.actual === null ? null : Number(d.actual),
    cancelled: d.cancelled,
    closed: d.closed_at !== null,
    tasks: byDay.get(d.id) ?? [],
  }));
}

export async function loadReview(supabase: Client, sprintId: string): Promise<SavedReview | null> {
  const review = await supabase.from("reviews").select("id, lesson, moved_vision, verdict, completed_at").eq("sprint_id", sprintId).maybeSingle();
  if (review.error) throw new Error(`reviews: ${review.error.message}`);
  if (!review.data) return null;
  const decisions = await supabase.from("review_decisions").select("kind, item_id, decision").eq("review_id", review.data.id);
  if (decisions.error) throw new Error(`review_decisions: ${decisions.error.message}`);
  return { ...review.data, decisions: decisions.data as ReviewDecision[] };
}

/** The kit the next sprint in an Area starts from: the last finished review's keepers. */
export type AreaKit = {
  sprintId: string;
  lesson: string;
  cueIds: string[];
  impedimentIds: string[];
  highestId: string | null;
};

/**
 * The last completed review in this Area, reduced to what the wizard pre-checks and
 * the rail pins on Day 1. Archived items are filtered out (rule 24), so a kit never
 * pre-selects something start_sprint would then reject.
 */
export async function loadAreaKit(supabase: Client, area: AreaKey): Promise<AreaKit | null> {
  // One embedded read for the Area's latest review and its decisions (#26): the review's
  // sprint filters the Area, the decisions ride along on their FK.
  const review = await supabase
    .from("reviews")
    .select("id, sprint_id, lesson, sprints!inner(area), review_decisions(kind, item_id, decision)")
    .eq("sprints.area", area)
    .order("completed_at", { ascending: false })
    .order("id")
    .limit(1)
    .maybeSingle();
  if (review.error) throw new Error(`reviews: ${review.error.message}`);
  if (!review.data) return null;

  const kept = review.data.review_decisions.filter((d) => d.decision !== "drop");
  const cueIds = kept.filter((d) => d.kind === "cue").map((d) => d.item_id);
  const impIds = kept.filter((d) => d.kind === "impediment").map((d) => d.item_id);

  // Rule 24: an item archived since the review must not reappear in a selection list.
  const [liveCues, liveImps] = await Promise.all([
    cueIds.length ? supabase.from("cues").select("id").in("id", cueIds).is("archived_at", null) : { data: [] as { id: string }[], error: null },
    impIds.length ? supabase.from("impediments").select("id").in("id", impIds).is("archived_at", null) : { data: [] as { id: string }[], error: null },
  ]);
  if (liveCues.error) throw new Error(`cues: ${liveCues.error.message}`);
  if (liveImps.error) throw new Error(`impediments: ${liveImps.error.message}`);
  const liveCueIds = new Set(liveCues.data.map((c) => c.id));
  const liveImpIds = new Set(liveImps.data.map((i) => i.id));
  const highest = kept.find((d) => d.decision === "highest")?.item_id ?? null;

  return {
    sprintId: review.data.sprint_id,
    lesson: review.data.lesson,
    cueIds: cueIds.filter((id) => liveCueIds.has(id)),
    impedimentIds: impIds.filter((id) => liveImpIds.has(id)),
    highestId: highest && liveImpIds.has(highest) ? highest : null,
  };
}

export type ReviewStats = { sprints: number; daysOnTargetPct: number | null; goalsMet: number; lessons: number };

export type AcrossData = {
  history: SprintInsights[];
  sprints: number;
  closedDays: number;
  onTarget: number;
  /** The earliest in-scope start date, for the `Evidence · {date} → today` kicker. */
  firstStart: string | null;
};

/**
 * Across sprints (F11). The four per-sprint calculations F10 already wrote, fanned out
 * over every finished sprint in scope; the grouping is `lib/across.ts` and the numbers
 * are never recomputed. Deliberately N reads rather than four new cross-sprint SQL
 * functions: the same SQL that fills a postmortem fills this page, so the two cannot
 * drift, and no new SECURITY DEFINER surface is introduced.
 *
 * N is the user's finished sprints — at 14 days a sprint, single digits for years.
 */
export async function loadAcross(supabase: Client, scope: Scope): Promise<AcrossData> {
  const finished = (await loadFinishedSprints(supabase)).filter((s) => scope === "all" || s.area === scope);
  const ids = finished.map((s) => s.id);
  if (ids.length === 0) return { history: [], sprints: 0, closedDays: 0, onTarget: 0, firstStart: null };

  // Five requests for the whole history (0017), whatever N is: the `_many` wrappers call
  // the same definer function per sprint, and `sprint_totals` is one row per sprint.
  const [impact, recovery, situations, cues, totals] = await allOrThrow([
    supabase.rpc("insight_impediment_impact_many", { p_sprint_ids: ids }),
    supabase.rpc("insight_response_recovery_many", { p_sprint_ids: ids }),
    supabase.rpc("insight_situations_many", { p_sprint_ids: ids }),
    supabase.rpc("insight_cue_usefulness_many", { p_sprint_ids: ids }),
    supabase.from("sprint_totals").select("sprint_id, effective_days, on_target_days").in("sprint_id", ids),
  ]);
  for (const [name, res] of [
    ["insight_impediment_impact_many", impact],
    ["insight_response_recovery_many", recovery],
    ["insight_situations_many", situations],
    ["insight_cue_usefulness_many", cues],
    ["sprint_totals", totals],
  ] as const) {
    if (res.error) throw new Error(`${name}: ${res.error.message}`);
  }

  const bySprint = (res: { data: unknown }): Map<string, Record<string, unknown>[]> => {
    const map = new Map<string, Record<string, unknown>[]>();
    for (const r of full("insights", (res.data ?? []) as (Record<string, unknown> & { sprint_id: string })[])) {
      const list = map.get(r.sprint_id) ?? [];
      list.push(r);
      map.set(r.sprint_id, list);
    }
    return map;
  };
  const impactBy = bySprint(impact);
  const recoveryBy = bySprint(recovery);
  const situationsBy = bySprint(situations);
  const cuesBy = bySprint(cues);

  const history = finished.map(
    (sprint): SprintInsights => ({
      sprint: { id: sprint.id, area: sprint.area, start_date: sprint.start_date, end_date: sprint.end_date },
      impact: (impactBy.get(sprint.id) ?? []).map((r) => ({ ...r, median_present: numeric(r.median_present), median_absent: numeric(r.median_absent) }) as unknown as ImpactRow),
      recovery: (recoveryBy.get(sprint.id) ?? []) as unknown as RecoveryRow[],
      situations: (situationsBy.get(sprint.id) ?? []) as unknown as SituationRow[],
      cues: (cuesBy.get(sprint.id) ?? []).map((r) => ({ ...r, median_used: numeric(r.median_used), median_unused: numeric(r.median_unused) }) as unknown as CueRow),
    }),
  );

  return {
    history,
    sprints: finished.length,
    closedDays: (totals.data ?? []).reduce((a, t) => a + Number(t.effective_days ?? 0), 0),
    onTarget: (totals.data ?? []).reduce((a, t) => a + Number(t.on_target_days ?? 0), 0),
    firstStart: finished.reduce<string | null>((first, s) => (first === null || s.start_date < first ? s.start_date : first), null),
  };
}

/**
 * The three numbers on the postmortem rail's "Across n finished sprints" card. This is
 * the only cross-sprint reading F10 does: three counts, no comparison. Every per-item
 * comparison across sprints is F11's, and pooling them is explicitly not done here.
 * Reads `sprint_days_effective`, so cancelled, open and zero-target days are out.
 */
export async function loadReviewStats(supabase: Client): Promise<ReviewStats> {
  const finished = await loadFinishedSprints(supabase);
  const ids = finished.map((s) => s.id);
  const [totals, reviews] = await Promise.all([
    ids.length ? supabase.from("sprint_totals").select("sprint_id, effective_days, on_target_days, total").in("sprint_id", ids) : { data: [], error: null },
    supabase.from("reviews").select("id"),
  ]);
  if (totals.error) throw new Error(`sprint_totals: ${totals.error.message}`);
  if (reviews.error) throw new Error(`reviews: ${reviews.error.message}`);

  const byId = new Map(totals.data.map((t) => [t.sprint_id, t]));
  const effective = totals.data.reduce((a, t) => a + Number(t.effective_days ?? 0), 0);
  const onTarget = totals.data.reduce((a, t) => a + Number(t.on_target_days ?? 0), 0);

  return {
    sprints: finished.length,
    daysOnTargetPct: effective ? Math.round((onTarget / effective) * 100) : null,
    // Rule 25: goals are compared as met / not met, never by summing across
    // measurements — a money sprint and an hours sprint are counted, not added. The
    // total is `sprint_totals.total`, the result card's own sum (#15).
    goalsMet: finished.filter((s) => goalMet(Number(byId.get(s.id)?.total ?? 0), s.amount)).length,
    lessons: full("reviews", reviews.data).length,
  };
}
