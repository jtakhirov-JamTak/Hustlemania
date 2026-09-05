/**
 * Calendar helpers for a sprint locked to one IANA time zone (PRD §6). All date math
 * lives here and in SQL; React never computes a day boundary.
 */

export type IsoDate = `${number}-${number}-${number}`;

/** The calendar date (YYYY-MM-DD) that `now` falls on in `tz`. */
export function localDateIn(tz: string, now: Date): IsoDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}` as IsoDate;
}

/** Whole days from `startDate` to `date`, both ISO calendar dates; negative before start. */
export function daysBetween(startDate: string, date: string): number {
  const a = Date.UTC(...isoParts(startDate));
  const b = Date.UTC(...isoParts(date));
  return Math.round((b - a) / 86_400_000);
}

/** Adds `days` to an ISO calendar date. */
export function addDays(date: string, days: number): IsoDate {
  const [y, m, d] = isoParts(date);
  const t = new Date(Date.UTC(y, m, d + days));
  const yy = t.getUTCFullYear();
  const mm = String(t.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(t.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}` as IsoDate;
}

export type SprintDayPosition =
  | { kind: "before"; daysUntilStart: number }
  | { kind: "during"; dayIndex: number; date: IsoDate }
  | { kind: "after"; daysSinceEnd: number };

/**
 * Where `nowUtc` falls in a sprint: before day 1, on day N (1–14), or after day 14.
 * The sprint's own zone decides the boundary, so travel never moves a day.
 */
export function sprintDayFor(sprint: { start_date: string; tz: string }, nowUtc: Date): SprintDayPosition {
  const today = localDateIn(sprint.tz, nowUtc);
  const offset = daysBetween(sprint.start_date, today);
  if (offset < 0) return { kind: "before", daysUntilStart: -offset };
  if (offset > 13) return { kind: "after", daysSinceEnd: offset - 13 };
  return { kind: "during", dayIndex: offset + 1, date: today };
}

function isoParts(date: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`not an ISO calendar date: ${date}`);
  return [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
}
