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
    passWithNoTests: true,
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env,
    fileParallelism: false,
  },
});
