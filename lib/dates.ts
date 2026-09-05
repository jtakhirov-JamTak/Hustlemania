/** Format an ISO calendar date (no time, no zone) for display. */
export function formatIsoDate(date: string, opts: Intl.DateTimeFormatOptions): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
}

export const SHORT_DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export function dayOfWeek(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function isWeekend(date: string): boolean {
  const d = dayOfWeek(date);
  return d === 0 || d === 6;
}

export function dayOfMonth(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDate();
}
