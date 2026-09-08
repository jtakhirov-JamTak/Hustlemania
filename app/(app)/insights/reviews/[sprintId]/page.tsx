import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Postmortem } from "@/components/insights/Postmortem";
import { allOrThrow, loadPostmortem, loadReviewStats } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Postmortem" };

/**
 * One sprint's postmortem. `loadPostmortem` returns null for a sprint that is still
 * running or is not the caller's — RLS hides another user's row, and the five
 * calculations check ownership themselves, so there is no id-guessing path in.
 */
export default async function ReviewPage({ params }: { params: Promise<{ sprintId: string }> }) {
  const { sprintId } = await params;
  const supabase = await createClient();
  const [data, stats] = await allOrThrow([loadPostmortem(supabase, sprintId), loadReviewStats(supabase)]);
  if (!data) notFound();
  return <Postmortem data={data} stats={stats} />;
}
