import type { Metadata } from "next";
import { NewSprintWizard } from "@/components/NewSprintWizard";
import { AREAS, isAreaKey, type AreaKey } from "@/lib/areas";
import { allOrThrow, loadActiveLibrary, loadActiveSituations, loadAreaKit, loadOverview, type AreaKit } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "New sprint" };

export default async function NewSprintPage({ searchParams }: { searchParams: Promise<{ area?: string }> }) {
  const { area } = await searchParams;
  const supabase = await createClient();
  const [overview, library, situations, ...kitList] = await allOrThrow([
    loadOverview(supabase),
    loadActiveLibrary(supabase),
    loadActiveSituations(supabase),
    ...AREAS.map((a) => loadAreaKit(supabase, a.key)),
  ]);
  // F10: each Area's kit travels with the wizard, so picking an Area pre-checks its own
  // last review without a round trip.
  const kits: Partial<Record<AreaKey, AreaKit | null>> = Object.fromEntries(AREAS.map((a, i) => [a.key, kitList[i] as AreaKit | null]));

  // F9: one vision unlocks every Area; the only gate left per Area is an active sprint.
  const areas = overview.areas.map((a) => ({ key: a.key, name: a.name, hasSprint: Boolean(a.sprint) }));
  const available = overview.vision ? areas.filter((a) => !a.hasSprint) : [];
  const initial: AreaKey | null =
    area && isAreaKey(area) && available.some((a) => a.key === area) ? area : (available[0]?.key ?? null);

  return <NewSprintWizard areas={areas} initialArea={initial} library={library} situations={situations} vision={overview.vision?.body ?? null} kits={kits} />;
}
