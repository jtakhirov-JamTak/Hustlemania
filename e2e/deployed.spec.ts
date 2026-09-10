import { expect, test } from "@playwright/test";

/**
 * F14 — the deployed origin, from outside: the PWA manifest and its icons, the auth
 * proxy, the security headers and the cron route's gate. Runs only under
 * `DEPLOY_URL=https://… npx playwright test --project=deployed`; no database access, no
 * seeding, no web server — the target is whatever is live. Each assertion names a deploy
 * that would fail it: a lost manifest, a proxy matcher that stopped guarding /sprints, a
 * next.config without the headers, a route that answers without its bearer.
 */
const ORIGIN = process.env.DEPLOY_URL;

test.describe("deployed origin", () => {
  test.skip(!ORIGIN, "DEPLOY_URL is not set; this project runs against a live deployment only");

  test("manifest is served, installable, and its icons resolve", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/manifest\+json|application\/json/);
    const manifest = (await res.json()) as {
      name?: string;
      short_name?: string;
      start_url?: string;
      display?: string;
      icons?: { src: string; sizes?: string; type?: string; purpose?: string }[];
    };
    expect(manifest.name).toBe("Hustlemania");
    expect(manifest.start_url).toBe("/sprints");
    expect(manifest.display).toBe("standalone");
    const icons = manifest.icons ?? [];
    expect(icons.some((i) => i.sizes === "192x192")).toBe(true);
    expect(icons.some((i) => i.sizes === "512x512")).toBe(true);
    expect(icons.some((i) => i.purpose === "maskable")).toBe(true);
    for (const icon of icons) {
      const img = await request.get(icon.src);
      expect(img.status(), icon.src).toBe(200);
      expect(img.headers()["content-type"], icon.src).toBe("image/png");
    }
  });

  test("login page links the manifest and carries the security headers", async ({ request }) => {
    const res = await request.get("/login");
    expect(res.status()).toBe(200);
    expect(await res.text()).toMatch(/<link[^>]+rel="manifest"[^>]+href="\/manifest\.webmanifest"/);
    const headers = res.headers();
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["x-powered-by"]).toBeUndefined();
  });

  test("unauthenticated /sprints is redirected to /login", async ({ request }) => {
    const res = await request.get("/sprints", { maxRedirects: 0 });
    expect(res.status()).toBeGreaterThanOrEqual(300);
    expect(res.status()).toBeLessThan(400);
    expect(res.headers()["location"]).toMatch(/\/login(\?|$)/);
  });

  test("cron route refuses a missing bearer and a GET", async ({ request }) => {
    const post = await request.post("/api/cron/reminders");
    expect(post.status()).toBe(401);
    expect(await post.text()).toBe("");
    const get = await request.get("/api/cron/reminders");
    expect(get.status()).toBe(405);
  });
});
