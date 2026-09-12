// Runs before `next build`. The build inlines NEXT_PUBLIC_* into the bundle, and
// scripts/local-env.mjs leaves a `.env.local` pointing at the local stack after every
// `npm run dev` — so a production build made on a dev machine would ship with
// http://127.0.0.1:54341 baked in. Refuse that when the build is for a hosted target,
// and always say which Supabase the build targets so a local build is a visible choice.
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Mirror Next's precedence for a build: .env.local wins over .env. Neither overrides a
// variable the shell already set.
for (const name of [".env.local", ".env"]) {
  const path = resolve(process.cwd(), name);
  if (!existsSync(path)) continue;
  try {
    process.loadEnvFile(path);
  } catch {
    // Unreadable file: Next will report it; nothing to check here.
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
let host = "";
try {
  host = new URL(url).hostname;
} catch {
  host = "";
}
const local = host === "127.0.0.1" || host === "localhost";
const hosted = Boolean(process.env.VERCEL || process.env.CI);

if (!url) {
  console.error("[build-env] NEXT_PUBLIC_SUPABASE_URL is not set; the build would have no backend.");
  process.exit(1);
}
if (hosted && (local || !url.startsWith("https://"))) {
  console.error(`[build-env] refusing a hosted build (VERCEL/CI set) against ${url}. Remove .env.local or set the production URL.`);
  process.exit(1);
}
// F17: the parser stub is for local runs and Playwright only. A hosted build that
// carried it would sort every capture with the keyword splitter and never call the model.
if (hosted && process.env.PARSE_STUB) {
  console.error("[build-env] refusing a hosted build with PARSE_STUB set; the capture parser must use the model there.");
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.warn("[build-env] ANTHROPIC_API_KEY is not set; every one-box capture will answer 'Sorting is unavailable' in this build.");
}
console.log(`[build-env] build targets ${url}${local ? " (local stack — not a deployable build)" : ""}`);
