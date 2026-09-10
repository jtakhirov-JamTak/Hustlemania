import { describe, expect, it } from "vitest";
import { isSameOriginPath } from "@/lib/redirect";

/** REDIRECT-VALIDATE (full review 2026-09-09, #14): the theme action's return path. */
describe("isSameOriginPath", () => {
  it("accepts a relative path", () => {
    expect(isSameOriginPath("/sprints")).toBe(true);
    expect(isSameOriginPath("/insights?scope=health")).toBe(true);
  });

  it("rejects the forms that leave the origin", () => {
    expect(isSameOriginPath("//evil.com")).toBe(false);
    expect(isSameOriginPath("/\\evil.com")).toBe(false);
    expect(isSameOriginPath("https://evil.com")).toBe(false);
    expect(isSameOriginPath("")).toBe(false);
  });

  it("rejects control characters", () => {
    expect(isSameOriginPath("/sprints\r\nSet-Cookie: x=y")).toBe(false);
  });
});
