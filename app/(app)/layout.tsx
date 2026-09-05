import { redirect } from "next/navigation";
import { Tabs } from "@/components/Tabs";
import { requireUser } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  if (!user) redirect("/login");

  return (
    <div className="page">
      <header
        data-header
        style={{
          display: "flex",
          alignItems: "stretch",
          boxShadow: "0 1px 0 var(--divider)",
          background: "color-mix(in srgb, var(--panel) 88%, transparent)",
          backdropFilter: "blur(10px)",
          position: "sticky",
          top: 0,
          zIndex: 20,
          minHeight: 56,
        }}
      >
        <div className="brand" style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 26px", minWidth: 186 }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: "var(--accent)", display: "inline-block" }} />
          <span className="heading" style={{ fontSize: 16, letterSpacing: "0.06em" }}>
            Hustlemania
          </span>
        </div>
        <Tabs />
        <div style={{ flex: 1 }} />
        <form action="/auth/signout" method="post" style={{ display: "flex", alignItems: "center", paddingRight: 18, gap: 12 }}>
          <span style={{ fontSize: 11.5, color: "var(--muted)" }} className="hide-narrow">
            {user.email}
          </span>
          <button type="submit" className="link-quiet" style={{ whiteSpace: "nowrap" }}>
            Sign out
          </button>
        </form>
      </header>
      <div style={{ flex: 1, display: "flex", alignItems: "stretch" }} data-shell>
        {children}
      </div>
    </div>
  );
}
