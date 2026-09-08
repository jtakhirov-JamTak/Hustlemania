"use client";

import { usePathname } from "next/navigation";
import { setThemeAction } from "@/app/(app)/actions/theme";
import type { Theme } from "@/lib/theme";

/**
 * The header's Dusk / Night switch (F8): a form, so it posts without client JS and the
 * page comes back already in the other mode. Icon only on a phone.
 */
export function ThemeToggle({ theme }: { theme: Theme }) {
  const pathname = usePathname();
  const next: Theme = theme === "night" ? "dusk" : "night";
  return (
    <form action={setThemeAction} className="theme-form">
      <input type="hidden" name="theme" value={next} />
      <input type="hidden" name="next" value={pathname} />
      <button type="submit" className="theme-toggle" data-testid="theme-toggle" aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`}>
        <span className="theme-dot" aria-hidden="true" />
        <span className="theme-text">{theme === "night" ? "Night" : "Dusk"}</span>
      </button>
    </form>
  );
}
