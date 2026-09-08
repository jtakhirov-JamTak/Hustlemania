import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VisionOverview } from "@/components/VisionOverview";
import { VisionSetup, type SetupStep } from "@/components/VisionSetup";
import { allOrThrow, loadActiveLibrary, loadLibraryCounts, loadVision, loadVisionSprints } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Vision" };

/**
 * F9: the Vision tab. Setup (three annual steps) when no vision exists or `?step=` asks
 * for a step; otherwise the saved overview. Step 3 needs an obstacle, so without one it
 * falls back to step 2.
 */
export default async function VisionPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const { step: stepParam } = await searchParams;
  const supabase = await createClient();
  const { active, previous } = await loadVision(supabase);

  const requested = stepParam === "2" ? 2 : stepParam === "3" ? 3 : stepParam === "1" ? 1 : null;
  if (!active || requested !== null) {
    const step: SetupStep = !active ? 1 : requested === 3 && !active.obstacle ? 2 : requested!;
    if (requested === 3 && active && !active.obstacle) redirect("/vision?step=2");
    const library = step === 2 ? await loadActiveLibrary(supabase) : { impediments: [] };
    return <VisionSetup key={step} step={step} active={active} impediments={library.impediments.filter((i) => i.scope === "global")} />;
  }

  const [sprints, counts] = await allOrThrow([loadVisionSprints(supabase, active.vision.id), loadLibraryCounts(supabase)]);
  return <VisionOverview active={active} sprints={sprints} previous={previous} counts={counts} />;
}
