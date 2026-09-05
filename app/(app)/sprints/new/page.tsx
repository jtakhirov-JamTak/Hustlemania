import { NewSprintWizard } from "@/components/NewSprintWizard";
import { isAreaKey, type AreaKey } from "@/lib/areas";
import { loadActiveLibrary, loadOverview } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export default async function NewSprintPage({ searchParams }: { searchParams: Promise<{ area?: string }> }) {
  const { area } = await searchParams;
  const supabase = await createClient();
  const [overview, library] = await Promise.all([loadOverview(supabase), loadActiveLibrary(supabase)]);

  const areas = overview.map((a) => ({ key: a.key, name: a.name, hasVision: Boolean(a.vision), hasSprint: Boolean(a.sprint) }));
  const available = areas.filter((a) => a.hasVision && !a.hasSprint);
  const initial: AreaKey | null =
    area && isAreaKey(area) && available.some((a) => a.key === area) ? area : (available[0]?.key ?? null);

  return <NewSprintWizard areas={areas} initialArea={initial} library={library} />;
}
