import { describe, expect, it } from "vitest";
import { TWO_TAP_IDLE, twoTapNext } from "@/lib/twoTap";

describe("twoTapNext (F9 Replace)", () => {
  it("one tap arms and does not fire", () => {
    expect(twoTapNext(TWO_TAP_IDLE, "tap")).toEqual({ state: { armed: true }, fire: false });
  });

  it("the second tap fires and disarms", () => {
    const armed = twoTapNext(TWO_TAP_IDLE, "tap").state;
    expect(twoTapNext(armed, "tap")).toEqual({ state: { armed: false }, fire: true });
  });

  it("blur disarms without firing, so the next tap only arms again", () => {
    const armed = twoTapNext(TWO_TAP_IDLE, "tap").state;
    const afterBlur = twoTapNext(armed, "blur");
    expect(afterBlur).toEqual({ state: { armed: false }, fire: false });
    expect(twoTapNext(afterBlur.state, "tap").fire).toBe(false);
  });

  it("blur while idle stays idle", () => {
    expect(twoTapNext(TWO_TAP_IDLE, "blur")).toEqual({ state: { armed: false }, fire: false });
  });
});
