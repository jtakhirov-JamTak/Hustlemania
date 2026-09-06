import { describe, expect, it } from "vitest";
import type { Measurement } from "@/lib/format";
import { formatTargetInput, hasRoundingDifference, isLockedDay, isMissedDay, parseTargetInput, planDelta, sameDailyTargets } from "@/lib/targets";

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

describe("planDelta / isLockedDay", () => {
  it("is zero when balanced, signed otherwise", () => {
    expect(planDelta(sameDailyTargets(14), 14)).toBe(0);
    expect(planDelta([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 13], 14)).toBe(-1);
    expect(planDelta([2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 14)).toBe(1);
  });

  it("locks today and every earlier day, never tomorrow (rule 10)", () => {
    expect(isLockedDay("2026-09-04", "2026-09-05")).toBe(true);
    expect(isLockedDay("2026-09-05", "2026-09-05")).toBe(true);
    expect(isLockedDay("2026-09-06", "2026-09-05")).toBe(false);
  });
});

describe("target input formatter/parser pair (SPEC F3 risk: precision per measurement)", () => {
  it.each<[Measurement, string, number | null]>([
    ["money", "572", 57_200],
    ["money", "0", 0],
    ["money", " 8000 ", 800_000],
    ["money", "571.5", null],
    ["money", "-1", null],
    ["money", "", null],
    ["quantity", "12", 12],
    ["quantity", "1.5", null],
    ["hours", "2", 120],
    ["hours", "2:30", 150],
    ["hours", "0:45", 45],
    ["hours", "2h 30m", 150],
    ["hours", "2h", 120],
    ["hours", "45m", 45],
    ["hours", "2:60", null],
    ["hours", "abc", null],
  ])("%s: parses %j → %j", (m, raw, expected) => {
    expect(parseTargetInput(m, raw)).toBe(expected);
  });

  it.each<[Measurement, number, string]>([
    ["money", 57_200, "572"],
    ["money", 0, "0"],
    ["quantity", 12, "12"],
    ["hours", 150, "2:30"],
    ["hours", 45, "0:45"],
    ["hours", 120, "2:00"],
  ])("%s: formats %i → %j and round-trips", (m, base, text) => {
    expect(formatTargetInput(m, base)).toBe(text);
    expect(parseTargetInput(m, text)).toBe(base);
  });
});

describe("isMissedDay (F5)", () => {
  it("is a past date that was never closed; today and closed days are not missed", () => {
    expect(isMissedDay("2026-09-04", null, "2026-09-05")).toBe(true);
    expect(isMissedDay("2026-09-05", null, "2026-09-05")).toBe(false);
    expect(isMissedDay("2026-09-06", null, "2026-09-05")).toBe(false);
    expect(isMissedDay("2026-09-04", "2026-09-05T03:00:00Z", "2026-09-05")).toBe(false);
  });
});
