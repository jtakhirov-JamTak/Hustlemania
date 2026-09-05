import type { Measurement } from "./format";

export const SPRINT_DAYS = 14;

/** Base units per whole planning unit: money plans in whole currency units (100 minor). */
export function measurementStep(measurement: Measurement): number {
  return measurement === "money" ? 100 : 1;
}

/**
 * Goal ÷ 14 with the remainder spread in whole planning units over the first days, so
 * the 14 targets always sum to the goal. Mirrors public.same_daily_targets(amount, step)
 * in SQL; the DB test asserts both agree for the SPEC's table of goals.
 */
export function sameDailyTargets(amount: number, step = 1): number[] {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error("amount must be a non-negative integer in base units");
  }
  if (!Number.isInteger(step) || step < 1 || amount % step !== 0) {
    throw new Error("amount must be a whole multiple of step");
  }
  const units = amount / step;
  const base = Math.floor(units / SPRINT_DAYS) * step;
  const remainder = units % SPRINT_DAYS;
  return Array.from({ length: SPRINT_DAYS }, (_, i) => base + (i < remainder ? step : 0));
}

/** True when the plan is not perfectly even, i.e. the UI should show the rounding note. */
export function hasRoundingDifference(targets: readonly number[]): boolean {
  return targets.some((t) => t !== targets[0]);
}
