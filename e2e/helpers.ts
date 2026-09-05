import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";

function requireLocal(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name} is not set; run \`npm run test:e2e\` so scripts/local-env.mjs writes .env.local`);
  const host = new URL(value).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") throw new Error(`${name} points at ${host}; e2e runs only against the local stack`);
  return value;
}

const SUPABASE_URL = requireLocal("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
const MAILPIT_URL = requireLocal("LOCAL_MAILPIT_URL", process.env.LOCAL_MAILPIT_URL);
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

export async function seedUser(label: string): Promise<{ id: string; email: string }> {
  const email = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const res = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (res.error || !res.data.user) throw res.error ?? new Error("createUser returned no user");
  return { id: res.data.user.id, email };
}

export async function deleteUser(id: string | undefined) {
  if (!id) return;
  const res = await admin.auth.admin.deleteUser(id);
  if (res.error) throw res.error;
}

/** Polls Mailpit for the newest message to `email` and returns the magic link inside it. */
export async function magicLinkFor(email: string, timeoutMs = 20_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const search = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}&limit=1`);
    if (search.ok) {
      const body = (await search.json()) as { messages?: { ID: string }[] };
      const id = body.messages?.[0]?.ID;
      if (id) {
        const msg = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${id}`)).json()) as { Text?: string; HTML?: string };
        const haystack = `${msg.Text ?? ""}\n${(msg.HTML ?? "").replace(/&amp;/g, "&")}`;
        const m = haystack.match(/https?:\/\/[^\s"'<>\]]+\/auth\/v1\/verify[^\s"'<>\]]*/);
        if (m) return m[0];
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no magic link for ${email} within ${timeoutMs}ms`);
}

export async function signInViaMagicLink(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await page.getByRole("heading", { name: "Check your email" }).waitFor();
  const link = await magicLinkFor(email);
  await page.goto(link);
  await page.waitForURL(/\/sprints/);
}
