import { describe, expect, it } from "vitest";
import { hasRoundingDifference, sameDailyTargets } from "@/lib/targets";

describe("sameDailyTargets", () => {
  // SPEC F1: 14 targets sum to the Goal exactly for goal ∈ {14, 15, 27, 100, 1}.
  it.each([14, 15, 27, 100, 1])("sums to the goal for %i", (goal) => {
    const t = sameDailyTargets(goal);
    expect(t).toHaveLength(14);
    expect(t.reduce((a, b) => a + b, 0)).toBe(goal);
  });

  it("spreads the remainder as whole units over the first days", () => {
    expect(sameDailyTargets(15)).toEqual([2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(sameDailyTargets(100).slice(0, 3)).toEqual([8, 8, 7]);
  });

  it("never produces a fractional or negative target", () => {
    for (const goal of [1, 13, 14, 27, 99_999]) {
      expect(sameDailyTargets(goal).every((t) => Number.isInteger(t) && t >= 0)).toBe(true);
    }
  });

  it("rejects non-integers", () => {
    expect(() => sameDailyTargets(10.5)).toThrow();
    expect(() => sameDailyTargets(-1)).toThrow();
  });
});

describe("hasRoundingDifference", () => {
  it("is false for an even plan and true when any two days differ", () => {
    expect(hasRoundingDifference(sameDailyTargets(14))).toBe(false);
    expect(hasRoundingDifference(sameDailyTargets(15))).toBe(true);
  });
});
