"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { report } from "@/lib/observe";
import { createClient } from "@/lib/supabase/server";

/**
 * Sends a magic link to an already-invited email. `shouldCreateUser: false` plus the
 * project's disabled signups mean an unknown email gets an error and no account.
 */
export async function requestMagicLink(formData: FormData) {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const back = (params: Record<string, string>) => {
    const q = new URLSearchParams({ ...params, email });
    redirect(`/login?${q.toString()}`);
  };

  if (!email || !email.includes("@")) return back({ error: "invalid" });

  const h = await headers();
  const origin = h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${origin}/auth/callback` },
  });

  if (error) {
    const notInvited = /signups? not allowed|otp_disabled|signup_disabled/i.test(`${error.code ?? ""} ${error.message}`);
    // An uninvited address is expected traffic; a failed send is the sign-in path down.
    if (!notInvited) report("auth.otp_send_failed", error);
    return back({ error: notInvited ? "not_invited" : "send_failed" });
  }
  return back({ sent: "1" });
}
