"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isSameOriginPath } from "@/lib/redirect";
import { isTheme, THEME_COOKIE } from "@/lib/theme";

/**
 * F8 night mode: the choice is a per-device cookie the root layout reads before the
 * first paint. A plain form posts here, so the switch works without client JS.
 */
export async function setThemeAction(formData: FormData): Promise<void> {
  const theme = String(formData.get("theme") ?? "");
  const next = String(formData.get("next") ?? "/sprints");
  if (isTheme(theme)) {
    const store = await cookies();
    store.set(THEME_COOKIE, theme, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  }
  redirect(isSameOriginPath(next) ? next : "/sprints");
}
