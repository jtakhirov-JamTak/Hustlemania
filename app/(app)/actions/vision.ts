"use server";

import { revalidatePath } from "next/cache";
import { failed, type Result } from "@/lib/actionResult";
import { isAreaKey, type AreaKey } from "@/lib/areas";
import { friendlyError } from "@/lib/errors";
import { requireUser } from "@/lib/supabase/server";

/** Insert the area's vision, or update the active one. Identity comes from the session. */
export async function saveVision(area: AreaKey, body: string): Promise<Result> {
  if (!isAreaKey(area)) return { error: "Unknown area." };
  const text = body.trim();
  if (!text) return { error: friendlyError("visions_body_check") };

  const { supabase, user } = await requireUser();
  if (!user) return { error: friendlyError("not_authenticated") };

  const existing = await supabase.from("visions").select("id").eq("area", area).is("archived_at", null).maybeSingle();
  if (existing.error) return failed("saveVision.read", existing.error, { area });

  const res = existing.data
    ? await supabase.from("visions").update({ body: text }).eq("id", existing.data.id).select("id").single()
    : await supabase.from("visions").insert({ user_id: user.id, area, body: text }).select("id").single();
  if (res.error) return failed("saveVision", res.error, { area, update: Boolean(existing.data) });

  revalidatePath("/", "layout");
  return {};
}
