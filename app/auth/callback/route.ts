import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { report } from "@/lib/observe";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES: readonly EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

/** Magic-link landing: exchanges the code (or token hash) for a session cookie. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const rawType = searchParams.get("type");
  const type = OTP_TYPES.find((t) => t === rawType) ?? null;

  const supabase = await createClient();
  let failed = true;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    failed = Boolean(error);
    if (error) report("auth.callback_failed", error, { flow: "pkce" });
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    failed = Boolean(error);
    if (error) report("auth.callback_failed", error, { flow: "token_hash", type });
  } else {
    report("auth.callback_failed", { message: "no code or token_hash" }, { flow: "none", type: rawType });
  }

  return NextResponse.redirect(failed ? `${origin}/login?error=link` : `${origin}/sprints`);
}
