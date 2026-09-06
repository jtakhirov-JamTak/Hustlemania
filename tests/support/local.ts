import { createClient } from "@supabase/supabase-js";

/**
 * Shared by the DB suite (vitest) and the e2e suite (Playwright): every URL is checked
 * for a loopback host before use, so neither suite — both seed and delete users, and
 * the DB one drops policies — can be pointed at the hosted project by a stray env.
 */
export function requireLocal(name: string, value: string | undefined, runner: string): string {
  if (!value) throw new Error(`${name} is not set; run \`${runner}\` so scripts/local-env.mjs writes .env.local`);
  const host = new URL(value).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") throw new Error(`${name} points at ${host}; tests only run against the local stack`);
  return value;
}

export function localSupabaseUrl(runner: string): string {
  return requireLocal("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL, runner);
}

/** Service-role client: bypasses RLS, used for seeding, assertions and user lifecycle. */
export function adminClient(supabaseUrl: string) {
  return createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
}

export type AdminClient = ReturnType<typeof adminClient>;

export function testEmail(label: string): string {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
}

export async function createUser(admin: AdminClient, label: string, password?: string): Promise<{ id: string; email: string }> {
  const email = testEmail(label);
  const res = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (res.error || !res.data.user) throw res.error ?? new Error("createUser returned no user");
  return { id: res.data.user.id, email };
}

export async function deleteUserById(admin: AdminClient, id: string | undefined) {
  if (!id) return;
  const res = await admin.auth.admin.deleteUser(id);
  if (res.error) throw res.error;
}
