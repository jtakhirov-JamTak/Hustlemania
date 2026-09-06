import type { Metadata } from "next";
import { LibraryPage } from "@/components/LibraryPage";
import { loadLibrary } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Execution cues" };

export default async function CuesPage() {
  const supabase = await createClient();
  const items = await loadLibrary(supabase, "cue");
  return <LibraryPage kind="cue" items={items} />;
}
