import type { Metadata } from "next";
import { LibraryPage } from "@/components/LibraryPage";
import { allOrThrow, loadLibrary, loadSituations } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Execution cues" };

export default async function CuesPage() {
  const supabase = await createClient();
  const [items, situations] = await allOrThrow([loadLibrary(supabase, "cue"), loadSituations(supabase)]);
  return <LibraryPage kind="cue" items={items} situations={situations} />;
}
