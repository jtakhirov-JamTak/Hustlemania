import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { publicSupabaseEnv } from "@/lib/env";

/**
 * Service-role client: bypasses RLS, so it exists only for work that has no user
 * session — the reminder cron (F13). `server-only` makes any import from a client
 * component a build error, which is how the key stays out of the bundle. The key is
 * read from SUPABASE_SERVICE_ROLE_KEY and never from a NEXT_PUBLIC_ name.
 */
export function createAdminClient() {
  const { url } = publicSupabaseEnv();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient<Database>(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
