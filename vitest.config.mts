import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// loadEnv reads .env then .env.local; .env.local (the running local stack, written by
// scripts/local-env.mjs) wins, so tests never see the hosted keys when the stack is up.
const env = loadEnv("", process.cwd(), "");

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // A layer that discovers zero files must fail: a renamed directory or glob would
    // otherwise leave `npm run verify` green with the whole layer skipped.
    passWithNoTests: false,
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env,
    fileParallelism: false,
  },
});
