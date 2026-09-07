import { redirect } from "next/navigation";
import { Tabs } from "@/components/Tabs";
import { requireUser } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, unavailable } = await requireUser();
  if (!user) redirect(unavailable ? "/login?error=unavailable" : "/login");

  return (
    <div className="page">
      <header className="app-header">
        <div className="brand">
          <span className="brand-dot" />
          <span className="heading brand-name">Hustlemania</span>
        </div>
        <Tabs />
        <div className="header-spacer" />
        <form action="/auth/signout" method="post" className="header-user">
          <span className="header-email hide-narrow">{user.email}</span>
          <button type="submit" className="link-quiet nowrap">
            Sign out
          </button>
        </form>
      </header>
      <div className="shell" data-shell>
        {children}
      </div>
    </div>
  );
}
