/**
 * F9: a two-tap control (first consumer: Replace on the Vision tab). The first tap arms
 * and shows the confirmation copy; the second fires; losing focus disarms. Pure state so
 * the rule is unit-tested without a DOM; `components/TwoTap.tsx` is the thin wrapper.
 */
export type TwoTapState = { armed: boolean };

export type TwoTapEvent = "tap" | "blur";

export const TWO_TAP_IDLE: TwoTapState = { armed: false };

/** The next state plus whether this event fires the action. */
export function twoTapNext(state: TwoTapState, event: TwoTapEvent): { state: TwoTapState; fire: boolean } {
  if (event === "blur") return { state: TWO_TAP_IDLE, fire: false };
  if (state.armed) return { state: TWO_TAP_IDLE, fire: true };
  return { state: { armed: true }, fire: false };
}
