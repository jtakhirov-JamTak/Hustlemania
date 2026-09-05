import { defineConfig, devices } from "@playwright/test";

// .env.local is written by scripts/local-env.mjs (pretest:e2e) from the running local
// stack. Loading it here gives the tests the Mailpit URL and the service key for seeding.
try {
  process.loadEnvFile(".env.local");
} catch {
  // Absent until the local stack has been started; the webServer's predev writes it.
}

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
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
    // Chromium with a phone profile: the SPEC checks layout at 390px, not a WebKit engine.
    { name: "phone", use: { ...devices["Pixel 5"], viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
