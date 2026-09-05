import type { SupabaseClient } from "@supabase/supabase-js";
import { AREAS, type AreaKey } from "@/lib/areas";
import type { Database, Tables } from "@/lib/database.types";

export type Vision = Tables<"visions">;
export type Sprint = Tables<"sprints">;
export type SprintDay = Tables<"sprint_days">;
export type Client = SupabaseClient<Database>;

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

export async function loadDays(supabase: Client, sprintId: string): Promise<SprintDay[]> {
  const days = await supabase.from("sprint_days").select("*").eq("sprint_id", sprintId).order("day_index");
  if (days.error) throw new Error(`sprint_days: ${days.error.message}`);
  return days.data;
}
