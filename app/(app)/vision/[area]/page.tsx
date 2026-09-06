import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VisionForm } from "@/components/VisionForm";
import { areaName, isAreaKey } from "@/lib/areas";
import { loadActiveVision } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata({ params }: { params: Promise<{ area: string }> }): Promise<Metadata> {
  const { area } = await params;
  return { title: isAreaKey(area) ? `${areaName(area)} vision` : "Vision" };
}

export default async function VisionAreaPage({ params }: { params: Promise<{ area: string }> }) {
  const { area } = await params;
  if (!isAreaKey(area)) notFound();

  const supabase = await createClient();
  const vision = await loadActiveVision(supabase, area);

  return (
    <div>
      <span className="tag tag-accent">{areaName(area)}</span>
      <h1 className="heading" style={{ fontSize: 38, margin: "12px 0 0", letterSpacing: "-0.03em" }}>
        1-year vision
      </h1>
      <p style={{ fontSize: 14.5, lineHeight: 1.55, color: "var(--muted)", marginTop: 10, maxWidth: "58ch" }}>
        Where is {areaName(area)} a year from now if the next few sprints land? One honest paragraph. Every sprint in this area
        has to advance it.
      </p>
      <VisionForm key={area} area={area} initialBody={vision?.body ?? ""} savedAt={vision?.updated_at ?? null} />
    </div>
  );
}
