import { redirect } from "next/navigation";
import { loadOverview } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export default async function SprintsIndex() {
  const supabase = await createClient();
  const { areas } = await loadOverview(supabase);
  const active = areas.find((a) => a.sprint) ?? areas[0];
  redirect(`/sprints/${active.key}`);
}
