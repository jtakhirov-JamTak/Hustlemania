/**
 * A zone whose calendar date differs from UTC's right now, so a live-clock test that
 * passes with `now() at time zone 'UTC'` in place of the sprint's zone cannot stay
 * green: UTC+14 (Kiritimati) is on the next date once UTC reaches 10:00; UTC−11
 * (Pago Pago) is still on the previous date until UTC reaches 11:00. Neither observes
 * DST, and the windows overlap, so one of them always qualifies.
 */
export function zoneOffUtcDate(now = new Date()): string {
  return now.getUTCHours() >= 10 ? "Pacific/Kiritimati" : "Pacific/Pago_Pago";
}

/**
 * A fixed-offset IANA zone whose local clock reads `hour`:mm right now (F13: the
 * reminder is due from 20:00 local). Etc/GMT names carry the inverted POSIX sign —
 * `Etc/GMT-14` is UTC+14 — and observe no DST, so the whole-hour offset is exact.
 */
export function zoneAtLocalHour(hour: number, now = new Date()): string {
  let off = hour - now.getUTCHours();
  if (off > 14) off -= 24;
  if (off < -12) off += 24;
  if (off === 0) return "Etc/GMT";
  return off > 0 ? `Etc/GMT-${off}` : `Etc/GMT+${-off}`;
}
