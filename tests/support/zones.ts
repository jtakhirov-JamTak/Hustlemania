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
