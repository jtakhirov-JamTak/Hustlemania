import { describe, expect, it } from "vitest";
import { CONFIDENCE_ADVICE, confidenceAdvice, confidenceBand } from "@/lib/confidence";

describe("confidence bands", () => {
  it("below 6 is low, 6–8 the sweet spot, above 8 high — at every edge", () => {
    expect(confidenceBand(0)).toBe("low");
    expect(confidenceBand(5)).toBe("low");
    expect(confidenceBand(6)).toBe("sweet");
    expect(confidenceBand(8)).toBe("sweet");
    expect(confidenceBand(9)).toBe("high");
    expect(confidenceBand(10)).toBe("high");
  });

  it("advice carries the band's copy and is null while nothing is picked", () => {
    expect(confidenceAdvice(null)).toBeNull();
    expect(confidenceAdvice(undefined)).toBeNull();
    expect(confidenceAdvice(4)).toEqual({ band: "low", text: CONFIDENCE_ADVICE.low });
    expect(confidenceAdvice(7)!.text).toMatch(/Sweet spot/);
    expect(confidenceAdvice(9)!.text).toMatch(/Stretch/);
  });
});
