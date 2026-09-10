import { describe, expect, it } from "vitest";
import { localDateIn } from "@/lib/sprintDay";
import { zoneAtLocalHour, zoneOffUtcDate } from "../support/zones";

describe("zoneAtLocalHour", () => {
  const hourIn = (zone: string, now: Date) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", hourCycle: "h23" }).format(now));

  // F13's e2e seeds a sprint that is due right now; that holds only if the zone reads
  // 20:xx at every hour of the UTC day, minute 0 and minute 59 alike.
  it("returns a zone whose local hour is the one asked for, at every UTC hour", () => {
    for (let h = 0; h < 24; h++) {
      for (const m of [0, 59]) {
        const now = new Date(Date.UTC(2026, 8, 6, h, m));
        for (const hour of [20, 23, 0, 7]) {
          const zone = zoneAtLocalHour(hour, now);
          expect(hourIn(zone, now), `${h}:${m} UTC → ${zone}`).toBe(hour);
        }
      }
    }
  });
});

describe("zoneOffUtcDate", () => {
  // The helper is only worth having if it never returns a zone on UTC's date: sweep
  // every hour of a day, at the top and the last minute of each.
  it("returns a zone whose date differs from UTC at every hour of the day", () => {
    for (let h = 0; h < 24; h++) {
      for (const m of [0, 59]) {
        const now = new Date(Date.UTC(2026, 8, 6, h, m));
        const zone = zoneOffUtcDate(now);
        expect(localDateIn(zone, now), `${h}:${m} UTC → ${zone}`).not.toBe(localDateIn("UTC", now));
      }
    }
  });

  it("a fixed zone would sit on UTC's date for part of the day (why the helper exists)", () => {
    const onUtcDate = (zone: string) =>
      Array.from({ length: 24 }, (_, h) => new Date(Date.UTC(2026, 8, 6, h))).filter((now) => localDateIn(zone, now) === localDateIn("UTC", now)).length;
    expect(onUtcDate("Pacific/Kiritimati")).toBe(10);
    expect(onUtcDate("Pacific/Pago_Pago")).toBe(13);
    expect(onUtcDate("America/Los_Angeles")).toBeGreaterThan(12);
  });
});
