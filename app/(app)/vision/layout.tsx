import { SideNav, type SideItem } from "@/components/SideNav";
import { loadOverview } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export default async function VisionLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const areas = await loadOverview(supabase);
  const items: SideItem[] = areas.map((a) => ({
    href: `/vision/${a.key}`,
    label: a.name,
    meta: a.vision ? "Set" : "Empty",
    metaAccent: Boolean(a.vision),
  }));

  return (
    <>
      <SideNav title="1-year visions" items={items} />
      <main data-main style={{ flex: 1, minWidth: 0, padding: "30px 40px 100px" }}>
        <div style={{ maxWidth: 940 }}>{children}</div>
      </main>
    </>
  );
}
