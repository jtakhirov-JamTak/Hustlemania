import { describe, expect, it } from "vitest";
import { attainmentPct, formatAmount, formatNumber, goalMet, toBaseUnits, unitLabel } from "@/lib/format";
import { measurementStep, sameDailyTargets } from "@/lib/targets";

const usd = { measurement: "money" as const, currency: "USD", unit: null };
const hours = { measurement: "hours" as const, currency: null, unit: null };
const reps = { measurement: "quantity" as const, currency: null, unit: "reps" };

describe("attainment", () => {
  it("rounds the share as the SQL summary does, and a zero goal reads 0", () => {
    expect(attainmentPct(50, 800)).toBe(6);
    expect(attainmentPct(799, 800)).toBe(100);
    expect(attainmentPct(1, 0)).toBe(0);
  });

  it("met is at or above the goal, per sprint", () => {
    expect(goalMet(800, 800)).toBe(true);
    expect(goalMet(799, 800)).toBe(false);
  });
});

describe("base units", () => {
  it("money is minor units, hours are minutes, quantity is whole", () => {
    expect(toBaseUnits("money", { whole: 8000 })).toBe(800_000);
    expect(toBaseUnits("hours", { hours: 2, minutes: 30 })).toBe(150);
    expect(toBaseUnits("quantity", { whole: 12 })).toBe(12);
  });

  it("money distributes in whole currency units, never cents the user did not type", () => {
    const t = sameDailyTargets(800_000, measurementStep("money"));
    expect(t.reduce((a, b) => a + b, 0)).toBe(800_000);
    expect(t.every((x) => x % 100 === 0)).toBe(true);
    expect(t.slice(0, 3)).toEqual([57_200, 57_200, 57_200]);
    expect(t[13]).toBe(57_100);
  });
});

describe("formatting", () => {
  it("shows money as whole units when whole, two decimals otherwise", () => {
    expect(formatNumber(usd, 57_200)).toBe("572");
    expect(formatNumber(usd, 800_000)).toBe("8,000");
    expect(formatNumber(usd, 57_142)).toBe("571.42");
    expect(formatAmount(usd, 800_000)).toBe("8,000 USD");
    expect(unitLabel(usd)).toBe("USD");
  });

  it("shows hours as h and m", () => {
    expect(formatNumber(hours, 150)).toBe("2h 30m");
    expect(formatNumber(hours, 120)).toBe("2h");
    expect(formatNumber(hours, 45)).toBe("45m");
    expect(formatAmount(hours, 150)).toBe("2h 30m");
  });

  it("shows quantity with its unit", () => {
    expect(formatAmount(reps, 12)).toBe("12 reps");
  });
});
