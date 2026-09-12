import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A file that opens with "use server" may export only async functions (types are
 * erased, so they are fine). Anything else — a constant, a sync function, a class — is
 * a Next.js build error that takes every page down, and `tsc` does not see it
 * (FIX_LOG 2026-09-12: `export const CAPTURE_TEXT_MAX` in actions/capture.ts). This
 * scans every action file so the mistake fails here, before a dev server does.
 */
const ACTIONS_DIR = join(__dirname, "../../app/(app)/actions");

describe("server action modules export only async functions", () => {
  const files = readdirSync(ACTIONS_DIR).filter((f) => f.endsWith(".ts"));

  it("finds the action files", () => {
    expect(files.length).toBeGreaterThan(3);
  });

  it.each(files)("%s", (file) => {
    const src = readFileSync(join(ACTIONS_DIR, file), "utf8");
    expect(src.trimStart().startsWith('"use server"')).toBe(true);
    const offenders = [...src.matchAll(/^export\s+(?!async\s+function\b)(?!type\b)(?!interface\b)(\w+)/gm)].map((m) => m[0]);
    expect(offenders, `${file}: ${offenders.join(", ")}`).toEqual([]);
  });
});
