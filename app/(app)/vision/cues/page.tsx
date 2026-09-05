import { LibraryPage } from "@/components/LibraryPage";
import { loadLibrary } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export default async function CuesPage() {
  const supabase = await createClient();
  const items = await loadLibrary(supabase, "cue");
  return <LibraryPage kind="cue" items={items} />;
}
