import { NextResponse } from "next/server";
import { report } from "@/lib/observe";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) report("auth.signout_failed", error);
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
