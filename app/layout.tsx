import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { cookies } from "next/headers";
import { THEME_COLOR, THEME_COOKIE, themeFromCookie } from "@/lib/theme";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: { default: "Hustlemania", template: "%s · Hustlemania" },
  description: "14-day goal sprints",
  appleWebApp: { capable: true, title: "Hustlemania", statusBarStyle: "default" },
};

async function currentTheme() {
  const store = await cookies();
  return themeFromCookie(store.get(THEME_COOKIE)?.value);
}

export async function generateViewport(): Promise<Viewport> {
  return { themeColor: THEME_COLOR[await currentTheme()] };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // F8: the palette is decided here, before the first paint, from the device's cookie.
  const theme = await currentTheme();
  return (
    <html lang="en" className={jakarta.variable} data-theme={theme === "night" ? "night" : undefined}>
      <body>{children}</body>
    </html>
  );
}
