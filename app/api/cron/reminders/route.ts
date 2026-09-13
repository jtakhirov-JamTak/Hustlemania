import { NextResponse } from "next/server";
import { emit, report } from "@/lib/observe";
import { authorizeCron } from "@/lib/reminders/authorize";
import { runReminders, type ReminderDb } from "@/lib/reminders/run";
import { selectTransport } from "@/lib/reminders/transport";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * F13: the hourly reminder pass, called by the database's pg_cron job through pg_net
 * (0018) with `Authorization: Bearer <CRON_SECRET>`. There is no session and no Origin
 * on that call, so the bearer is the gate (conventions: a scheduled callback, like a
 * webhook, is authenticated by its credential, not by a cookie). Everything else is in
 * lib/reminders so it is unit-tested without HTTP.
 *
 * Fail closed: an unset secret or, in production, an unset mail provider is 503 and
 * claims nothing. A bad or missing bearer is 401 with an empty body.
 */
/** The pass must finish inside the function: a cut-off mid-run would leave claimed days unmarked until the retry window. */
export const maxDuration = 60;

export async function POST(request: Request) {
  const auth = authorizeCron(request.headers.get("authorization"), process.env.CRON_SECRET);
  if (auth === "unconfigured") {
    report("reminder.unconfigured", { message: "CRON_SECRET is not set" });
    return new NextResponse(null, { status: 503 });
  }
  if (auth === "unauthorized") return new NextResponse(null, { status: 401 });

  const transport = selectTransport(process.env);
  if (!transport) {
    report("reminder.unconfigured", { message: "RESEND_API_KEY / REMINDER_FROM are not set" });
    return new NextResponse(null, { status: 503 });
  }

  const admin = createAdminClient();
  const db: ReminderDb = {
    async due(now) {
      const res = await admin.rpc("reminders_due", { p_now: now.toISOString() });
      if (res.error) throw new Error(`reminders_due: ${res.error.message}`);
      return res.data;
    },
    async claim(ids) {
      const res = await admin.rpc("reminders_claim", { p_sprint_day_ids: ids });
      if (res.error) throw new Error(`reminders_claim: ${res.error.message}`);
      return res.data;
    },
    async mark(ids, error) {
      // Sent explicitly as null: an omitted key changes the call signature and PostgREST finds no function.
      const res = await admin.rpc("reminders_mark", { p_sprint_day_ids: ids, p_error: (error ?? null) as unknown as string });
      if (res.error) throw new Error(`reminders_mark: ${res.error.message}`);
    },
  };

  try {
    const summary = await runReminders(db, transport, new URL(request.url).origin);
    emit("reminder.run", { ...summary, transport: transport.name });
    return NextResponse.json(summary);
  } catch (error) {
    report("reminder.run_failed", error);
    return new NextResponse(null, { status: 500 });
  }
}

export function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
