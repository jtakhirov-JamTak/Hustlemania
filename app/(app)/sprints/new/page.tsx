import type { Metadata } from "next";
import { NewSprintWizard } from "@/components/NewSprintWizard";
import { isAreaKey, type AreaKey } from "@/lib/areas";
import { loadActiveLibrary, loadOverview } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "New sprint" };

export default async function NewSprintPage({ searchParams }: { searchParams: Promise<{ area?: string }> }) {
  const { area } = await searchParams;
  const supabase = await createClient();
  const [overview, library] = await Promise.all([loadOverview(supabase), loadActiveLibrary(supabase)]);

  // F9: one vision unlocks every Area; the only gate left per Area is an active sprint.
  const areas = overview.areas.map((a) => ({ key: a.key, name: a.name, hasSprint: Boolean(a.sprint) }));
  const available = overview.vision ? areas.filter((a) => !a.hasSprint) : [];
  const initial: AreaKey | null =
    area && isAreaKey(area) && available.some((a) => a.key === area) ? area : (available[0]?.key ?? null);

  return <NewSprintWizard areas={areas} initialArea={initial} library={library} vision={overview.vision?.body ?? null} />;
}
