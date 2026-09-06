import { describe, expect, it } from "vitest";
import { addDays, daysBetween, localDateIn, sprintDayFor, streakLabel } from "@/lib/sprintDay";

describe("localDateIn", () => {
  it("uses the sprint zone, not UTC", () => {
    // 2026-03-08T07:30Z is still Mar 7 in Los Angeles (UTC-8 before the DST switch).
    expect(localDateIn("America/Los_Angeles", new Date("2026-03-08T07:30:00Z"))).toBe("2026-03-07");
    expect(localDateIn("UTC", new Date("2026-03-08T07:30:00Z"))).toBe("2026-03-08");
    // Kiritimati is UTC+14: already the next day.
    expect(localDateIn("Pacific/Kiritimati", new Date("2026-03-08T11:00:00Z"))).toBe("2026-03-09");
  });
});

describe("sprintDayFor across DST", () => {
  // US spring-forward is 2026-03-08 02:00 local. A sprint starting 2026-03-05 in LA.
  const sprint = { start_date: "2026-03-05", tz: "America/Los_Angeles" };

  it("counts calendar days, not 24-hour blocks, through spring-forward", () => {
    // 2026-03-08 09:59:59Z = 01:59:59 PST on Mar 8 → day 4.
    expect(sprintDayFor(sprint, new Date("2026-03-08T09:59:59Z"))).toMatchObject({ kind: "during", dayIndex: 4 });
    // 2026-03-09 06:59:59Z = 23:59:59 PDT on Mar 8 → still day 4 (the local day was 23 h long).
    expect(sprintDayFor(sprint, new Date("2026-03-09T06:59:59Z"))).toMatchObject({ kind: "during", dayIndex: 4 });
    // One second later it is Mar 9 local → day 5.
    expect(sprintDayFor(sprint, new Date("2026-03-09T07:00:00Z"))).toMatchObject({ kind: "during", dayIndex: 5 });
  });

  it("handles fall-back (25-hour day) the same way", () => {
    // US fall-back 2026-11-01 02:00 local. Sprint starts 2026-10-30.
    const s = { start_date: "2026-10-30", tz: "America/New_York" };
    // 2026-11-02 04:59:59Z = 23:59:59 EST Nov 1 → day 3.
    expect(sprintDayFor(s, new Date("2026-11-02T04:59:59Z"))).toMatchObject({ kind: "during", dayIndex: 3 });
    expect(sprintDayFor(s, new Date("2026-11-02T05:00:00Z"))).toMatchObject({ kind: "during", dayIndex: 4 });
  });

  it("reports before and after the 14-day window", () => {
    expect(sprintDayFor(sprint, new Date("2026-03-04T20:00:00Z"))).toEqual({ kind: "before", daysUntilStart: 1 });
    // Day 14 is 2026-03-18; Mar 19 local is after.
    expect(sprintDayFor(sprint, new Date("2026-03-18T20:00:00Z"))).toMatchObject({ kind: "during", dayIndex: 14 });
    expect(sprintDayFor(sprint, new Date("2026-03-19T20:00:00Z"))).toEqual({ kind: "after", daysSinceEnd: 1 });
  });
});

describe("date arithmetic", () => {
  it("adds and diffs calendar days across month and year ends", () => {
    expect(addDays("2026-12-25", 13)).toBe("2027-01-07");
    expect(daysBetween("2026-12-25", "2027-01-07")).toBe(13);
    expect(daysBetween("2026-03-05", "2026-03-04")).toBe(-1);
  });
});

describe("streakLabel", () => {
  it("reads as a count of days, with a plain line at zero", () => {
    expect(streakLabel(0)).toBe("No streak");
    expect(streakLabel(1)).toBe("1-day streak");
    expect(streakLabel(7)).toBe("7-day streak");
  });
});
