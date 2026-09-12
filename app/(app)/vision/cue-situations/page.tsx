import type { Metadata } from "next";
import { SituationLibraryPage } from "@/components/SituationLibraryPage";
import { loadSituations } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Cue situations" };

export default async function CueSituationsPage() {
  const supabase = await createClient();
  const items = await loadSituations(supabase, "cue");
  return <SituationLibraryPage kind="cue" items={items} />;
}
