import type { Page } from "@playwright/test";
import { adminClient, createUser, deleteUserById, localSupabaseUrl, requireLocal } from "../tests/support/local";

const RUNNER = "npm run test:e2e";
const MAILPIT_URL = requireLocal("LOCAL_MAILPIT_URL", process.env.LOCAL_MAILPIT_URL, RUNNER);

export const admin = adminClient(localSupabaseUrl(RUNNER));

export async function seedUser(label: string): Promise<{ id: string; email: string }> {
  return createUser(admin, label);
}

export async function deleteUser(id: string | undefined) {
  await deleteUserById(admin, id);
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
