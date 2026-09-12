import { SideNav, SideNavList, type SideItem } from "@/components/SideNav";
import { loadLibraryCounts, loadVision, visionSteps } from "@/lib/data";
import { stampDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

/** F9: one Vision row (`n of 3`, reviewed date) and the library rows (three since F17). */
export default async function VisionLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const [{ active }, counts] = await Promise.all([loadVision(supabase), loadLibraryCounts(supabase)]);
  const steps = visionSteps(active);
  const items: SideItem[] = [
    {
      href: "/vision",
      label: "Vision",
      meta: `${steps} of 3`,
      metaAccent: steps < 3,
      sub: !active ? "Not written yet" : active.latestReview ? `Reviewed ${stampDate(active.latestReview.created_at)}` : "Not reviewed yet",
    },
  ];
  const libraries: SideItem[] = [
    { href: "/vision/cues", label: "Execution cues", meta: String(counts.cues) },
    { href: "/vision/impediments", label: "Impediments", meta: String(counts.impediments) },
    { href: "/vision/situations", label: "Situations", meta: String(counts.situations) },
  ];

  return (
    <>
      <SideNav title="Vision" items={items}>
        <div className="label-muted side-title side-title-more">Libraries</div>
        <SideNavList items={libraries} />
      </SideNav>
      <main className="main">
        <div className="workspace">{children}</div>
      </main>
    </>
  );
}
