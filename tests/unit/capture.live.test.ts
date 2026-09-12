import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parseWithModel, realParseFn } from "@/lib/capture.server";

/**
 * F17: the one test that spends money. Double-gated: vitest loads .env, so the key
 * alone would make every `npm run verify` call the model — it also needs
 * PARSE_LIVE_SMOKE=1. Run: PARSE_LIVE_SMOKE=1 npx vitest run tests/unit/capture.live.test.ts
 */
const live = Boolean(process.env.ANTHROPIC_API_KEY?.trim()) && process.env.PARSE_LIVE_SMOKE === "1";

describe.skipIf(!live)("capture.server: live smoke against the model", () => {
  it("sorts an impediment sentence into its three parts", async () => {
    const out = await parseWithModel(
      "impediment",
      "When I notice myself delaying my first work block, then I start a 10-minute timer on the smallest executable task. Recovered when the timer is running within 10 minutes.",
      realParseFn,
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.parts.when).toMatch(/delaying/i);
    expect(out.parts.then).toMatch(/timer/i);
    expect(out.parts.recovered_when).toMatch(/running/i);
    expect(out.missing).toBeNull();
  }, 30_000);

  it("names the missing RECOVERED WHEN instead of inventing it", async () => {
    const out = await parseWithModel("impediment", "When I notice myself delaying, then I start a timer.", realParseFn);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.parts.recovered_when).toBe("");
    expect(out.parts.when).toMatch(/delaying/i);
  }, 30_000);

  it("splits a spoken situations list", async () => {
    const out = await parseWithModel("situations", "Situations: getting up early, going to bed late, and phone in bed.", realParseFn);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.parts.situations).toHaveLength(3);
  }, 30_000);
});
