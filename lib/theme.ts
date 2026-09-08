/** F8: the two palettes. Dusk is the default; night is opted into per device. */
export type Theme = "dusk" | "night";

export const THEME_COOKIE = "theme";

export const THEME_COLOR: Record<Theme, string> = { dusk: "#f9f9fd", night: "#131320" };

export function isTheme(value: string | undefined | null): value is Theme {
  return value === "dusk" || value === "night";
}

export function themeFromCookie(value: string | undefined): Theme {
  return isTheme(value) ? value : "dusk";
}
