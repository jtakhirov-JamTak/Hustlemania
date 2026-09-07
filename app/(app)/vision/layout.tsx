import { SideNav, SideNavList, type SideItem } from "@/components/SideNav";
import { loadLibraryCounts, loadOverview } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export default async function VisionLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const [areas, counts] = await Promise.all([loadOverview(supabase), loadLibraryCounts(supabase)]);
  const items: SideItem[] = areas.map((a) => ({
    href: `/vision/${a.key}`,
    label: a.name,
    meta: a.vision ? "Set" : "Empty",
    metaAccent: Boolean(a.vision),
  }));
  const libraries: SideItem[] = [
    { href: "/vision/cues", label: "Execution cues", meta: String(counts.cues) },
    { href: "/vision/impediments", label: "Impediments", meta: String(counts.impediments) },
  ];

  return (
    <>
      <SideNav title="1-year visions" items={items}>
        <div className="label-muted side-title side-title-more">
          Libraries
        </div>
        <SideNavList items={libraries} />
      </SideNav>
      <main className="main">
        <div className="workspace">{children}</div>
      </main>
    </>
  );
}
