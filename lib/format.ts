export type Measurement = "money" | "hours" | "quantity";

export type Measured = {
  measurement: Measurement;
  currency: string | null;
  unit: string | null;
};

/** Convert user input to base units: whole currency units → minor, h+m → minutes. */
export function toBaseUnits(m: Measurement, input: { whole?: number; hours?: number; minutes?: number }): number {
  switch (m) {
    case "money":
      return Math.round((input.whole ?? 0) * 100);
    case "hours":
      return (input.hours ?? 0) * 60 + (input.minutes ?? 0);
    case "quantity":
      return Math.round(input.whole ?? 0);
  }
}

/** The number alone, as the hero shows it: "572", "2h 30m", "12". */
export function formatNumber(m: Measured, base: number): string {
  switch (m.measurement) {
    case "money": {
      const whole = base / 100;
      return Number.isInteger(whole)
        ? whole.toLocaleString("en-US")
        : whole.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    case "hours": {
      const h = Math.floor(base / 60);
      const min = base % 60;
      if (h === 0) return `${min}m`;
      return min === 0 ? `${h}h` : `${h}h ${min}m`;
    }
    case "quantity":
      return base.toLocaleString("en-US");
  }
}

/** The unit word shown under the hero: "USD", "hours", "reps". */
export function unitLabel(m: Measured): string {
  switch (m.measurement) {
    case "money":
      return m.currency ?? "";
    case "hours":
      return "hours";
    case "quantity":
      return m.unit ?? "";
  }
}

/**
 * "% of goal" as the result card, the Journal, the close result and the Vision tab all
 * print it — one arithmetic, so no two screens can round differently. Matches
 * `sprint_review_summary.pct` (`round(total * 100.0 / goal)`); a zero goal reads 0.
 */
export function attainmentPct(total: number, goal: number): number {
  return goal > 0 ? Math.round((total / goal) * 100) : 0;
}

/** Met is `total >= goal`, compared per sprint (rule 25), never summed across measurements. */
export function goalMet(total: number, goal: number): boolean {
  return total >= goal;
}

/** Number plus unit: "8,000 USD", "2h 30m", "12 reps". */
export function formatAmount(m: Measured, base: number): string {
  const n = formatNumber(m, base);
  return m.measurement === "hours" ? n : `${n} ${unitLabel(m)}`;
}
