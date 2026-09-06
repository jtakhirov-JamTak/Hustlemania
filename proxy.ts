import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicSupabaseEnv } from "@/lib/env";
import { isAuthUnavailable, report } from "@/lib/observe";

const PROTECTED = /^\/(sprints|vision|insights)(\/|$)/;

/**
 * Refreshes the Supabase session cookie on every request and redirects signed-out
 * visitors away from the app. Authorization itself is RLS; this is the optimistic
 * redirect the SPEC calls "middleware" (Next 16 renamed it proxy).
 *
 * The session is read with getClaims (local JWT verification; one network call only on
 * the local stack's symmetric keys), never getUser on every request. An Auth failure is
 * reported and answered with the "unavailable" login state — it must never look like
 * "signed out", or an outage bounces everyone to /login with no trace.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, anonKey } = publicSupabaseEnv();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const path = request.nextUrl.pathname;
  const { data, error } = await supabase.auth.getClaims();
  if (error) {
    report("auth.claims_failed", error, { path, where: "proxy" });
    if (isAuthUnavailable(error) && PROTECTED.test(path)) {
      const login = request.nextUrl.clone();
      login.pathname = "/login";
      login.search = "?error=unavailable";
      return NextResponse.redirect(login);
    }
  }
  const signedIn = Boolean(data?.claims?.sub);

  if (!signedIn && PROTECTED.test(path)) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    return NextResponse.redirect(login);
  }
  if (signedIn && path === "/login") {
    const home = request.nextUrl.clone();
    home.pathname = "/sprints";
    home.search = "";
    return NextResponse.redirect(home);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon.svg|apple-icon.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
