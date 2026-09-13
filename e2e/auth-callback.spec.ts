import { expect, test } from "@playwright/test";

/**
 * The magic-link landing (app/auth/callback/route.ts): a bad or missing code, or a
 * token hash with an unknown type, lands on /login?error=link — never on /sprints.
 * Request-only: one project is enough (audit 2026-09-13 M17).
 */
test.describe("magic-link landing", () => {
  const cases: [string, string][] = [
    ["a garbage code", "?code=garbage"],
    ["no code and no token", ""],
    ["a token hash with an unknown type", "?token_hash=x&type=bogus"],
    ["a next parameter it must ignore", "?code=garbage&next=https://evil.example"],
  ];
  for (const [label, qs] of cases) {
    test(`${label} → /login?error=link`, async ({ request, baseURL }) => {
      test.skip(test.info().project.name !== "desktop", "request-only; runs once");
      const res = await request.get(`/auth/callback${qs}`, { maxRedirects: 0 });
      expect(res.status()).toBe(307);
      expect(res.headers()["location"]).toBe(`${baseURL}/login?error=link`);
    });
  }
});
