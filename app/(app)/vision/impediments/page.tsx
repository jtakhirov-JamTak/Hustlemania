import { LibraryPage } from "@/components/LibraryPage";
import { loadLibrary } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export default async function ImpedimentsPage() {
  const supabase = await createClient();
  const items = await loadLibrary(supabase, "impediment");
  return <LibraryPage kind="impediment" items={items} />;
}
