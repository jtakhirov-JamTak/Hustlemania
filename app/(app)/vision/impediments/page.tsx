import type { Metadata } from "next";
import { LibraryPage } from "@/components/LibraryPage";
import { allOrThrow, loadLibrary, loadSituations } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Impediments" };

export default async function ImpedimentsPage() {
  const supabase = await createClient();
  const [items, situations] = await allOrThrow([loadLibrary(supabase, "impediment"), loadSituations(supabase, "impediment")]);
  return <LibraryPage kind="impediment" items={items} situations={situations} />;
}
