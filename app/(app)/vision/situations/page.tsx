import type { Metadata } from "next";
import { SituationLibraryPage } from "@/components/SituationLibraryPage";
import { loadSituations } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Situations" };

/** F17: the one situations library (was two, per kind, in F15). */
export default async function SituationsPage() {
  const supabase = await createClient();
  const items = await loadSituations(supabase);
  return <SituationLibraryPage items={items} />;
}
