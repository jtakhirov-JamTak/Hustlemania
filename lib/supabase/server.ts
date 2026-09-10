import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import type { Database } from "@/lib/database.types";
import { publicSupabaseEnv } from "@/lib/env";
import { isAuthUnavailable, report } from "@/lib/observe";
import { withSkewRetry } from "@/lib/supabase/skew";

/**
 * Per-request Supabase client for Server Components, Server Actions and Route Handlers.
 * Runs as the signed-in user, so every query is under RLS. Identity comes from the
 * session cookie, never from the request body. One instance per request (React
 * `cache`), so a layout and its page share it and loaders memoised on the client
 * identity run once.
 */
export const createClient = cache(async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = publicSupabaseEnv();
  return createServerClient<Database>(url, anonKey, {
    global: { fetch: withSkewRetry() },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, which cannot set cookies. The proxy refreshes
          // the session on the next request, so this is safe to ignore.
        }
      },
    },
  });
});

export type SessionUser = { id: string; email: string | null };

/**
 * The signed-in user from the verified session claims (no Auth round trip on
 * asymmetric keys), once per request. `unavailable` is true when Auth itself failed —
 * the caller shows that state instead of treating the visitor as signed out.
 */
export const requireUser = cache(async function requireUser(): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: SessionUser | null;
  unavailable: boolean;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error) {
    report("auth.claims_failed", error, { where: "requireUser" });
    return { supabase, user: null, unavailable: isAuthUnavailable(error) };
  }
  const claims = data?.claims;
  if (!claims || typeof claims.sub !== "string") return { supabase, user: null, unavailable: false };
  return { supabase, user: { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null }, unavailable: false };
});
