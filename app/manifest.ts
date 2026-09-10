import type { MetadataRoute } from "next";
import { cookies } from "next/headers";
import { THEME_COLOR, THEME_COOKIE, themeFromCookie } from "@/lib/theme";

// Reads the theme cookie, so the route is dynamic: an install from Night mode gets a
// Night splash and status bar instead of a near-white one (full review 2026-09-09, #28).
export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const theme = themeFromCookie((await cookies()).get(THEME_COOKIE)?.value);
  return {
    name: "Hustlemania",
    short_name: "Hustlemania",
    description: "14-day goal sprints",
    start_url: "/sprints",
    display: "standalone",
    background_color: THEME_COLOR[theme],
    theme_color: THEME_COLOR[theme],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
