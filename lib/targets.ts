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

/** Planned total minus the goal: 0 when balanced, negative below, positive above. */
export function planDelta(targets: readonly number[], goal: number): number {
  return targets.reduce((a, b) => a + b, 0) - goal;
}

/** Rule 10: a day whose date has begun in the sprint's zone keeps its target. */
export function isLockedDay(date: string, todayInSprintTz: string): boolean {
  return date <= todayInSprintTz;
}

/** F5: the day's date has passed in the sprint's zone and it was never closed — it can be backfilled. */
export function isMissedDay(date: string, closedAt: string | null, todayInSprintTz: string): boolean {
  return closedAt === null && date < todayInSprintTz;
}

/**
 * The text a target input shows for a base-unit value: whole currency units, "h:mm"
 * for hours, a whole number for quantity. Inverse of parseTargetInput.
 */
export function formatTargetInput(measurement: Measurement, base: number): string {
  switch (measurement) {
    case "money":
      return String(base / 100);
    case "hours":
      return `${Math.floor(base / 60)}:${String(base % 60).padStart(2, "0")}`;
    case "quantity":
      return String(base);
  }
}

/**
 * Parses what the user typed into a target input; null when it is not a valid target.
 * Money and quantity accept a non-negative whole number. Hours accept "2", "2:30",
 * "2h 30m", "2h", "45m" — minutes 0–59 — and return minutes.
 */
export function parseTargetInput(measurement: Measurement, raw: string): number | null {
  const s = raw.trim();
  if (s === "") return null;
  if (measurement !== "hours") {
    if (!/^\d+$/.test(s)) return null;
    const n = Number(s);
    return Number.isSafeInteger(n) ? n * measurementStep(measurement) : null;
  }
  const colon = /^(\d+):([0-5]\d)$/.exec(s);
  if (colon) return Number(colon[1]) * 60 + Number(colon[2]);
  const hm = /^(?:(\d+)\s*h)?\s*(?:(\d{1,2})\s*m)?$/i.exec(s);
  if (hm && (hm[1] !== undefined || hm[2] !== undefined)) {
    const m = Number(hm[2] ?? 0);
    if (m > 59) return null;
    return Number(hm[1] ?? 0) * 60 + m;
  }
  if (/^\d+$/.test(s)) return Number(s) * 60;
  return null;
}
