import { defineConfig, devices } from "@playwright/test";

// .env.local is written by scripts/local-env.mjs (pretest:e2e) from the running local
// stack. Loading it here gives the tests the Mailpit URL and the service key for seeding.
try {
  process.loadEnvFile(".env.local");
} catch {
  // Absent until the local stack has been started; the webServer's predev writes it.
}

// F14: `DEPLOY_URL=https://… npx playwright test --project=deployed` checks a live origin
// from outside (e2e/deployed.spec.ts). No dev server is started for that run and the
// local-stack projects never pick that spec up; without DEPLOY_URL the project skips.
const DEPLOY_URL = process.env.DEPLOY_URL;
const DEPLOYED_SPEC = /deployed\.spec\.ts$/;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  // A cold `next dev` compiles each route on first hit (10 s+ seen); the default 5 s
  // expect timeout made the golden path flaky when the webServer starts fresh.
  timeout: 120_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", testIgnore: DEPLOYED_SPEC, use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
    // Chromium with a phone profile: the SPEC checks layout at 390px, not a WebKit engine.
    { name: "phone", testIgnore: DEPLOYED_SPEC, use: { ...devices["Pixel 5"], viewport: { width: 390, height: 844 } } },
    { name: "deployed", testMatch: DEPLOYED_SPEC, use: { baseURL: DEPLOY_URL ?? "http://localhost:3000" } },
  ],
  webServer: DEPLOY_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        timeout: 120_000,
        // F17: the capture parser answers with the keyword splitter under the suite
        // (lib/capture.ts stubParse) — no model call, no key, deterministic splits.
        env: { ...process.env, PARSE_STUB: "1" },
      },
});
