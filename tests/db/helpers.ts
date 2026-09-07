import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { adminClient, createUser, deleteUserById, localSupabaseUrl, requireLocal } from "../support/local";
import { insertSprintRows as seedSprintRows } from "../support/sprints";

/**
 * DB integration tests run only against the local Supabase stack: tests/support/local
 * checks every connection string for a loopback host before use, so a misconfigured
 * environment can never point these tests, which drop and recreate policies, at the
 * hosted project.
 */
const RUNNER = "npm run test:db";
export const DATABASE_URL = requireLocal("LOCAL_DATABASE_URL", process.env.LOCAL_DATABASE_URL, RUNNER);
export const SUPABASE_URL = localSupabaseUrl(RUNNER);
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Superuser-ish connection (postgres role, bypasses RLS) for setup and assertions. */
export const sql = postgres(DATABASE_URL, { max: 2, onnotice: () => {} });

export const admin = adminClient(SUPABASE_URL);

export type TestUser = {
  id: string;
  email: string;
  /** supabase-js client authenticated as this user; every query runs under RLS. */
  client: SupabaseClient;
};

const PASSWORD = "test-password-1234";

export async function createTestUser(label: string): Promise<TestUser> {
  const { id, email } = await createUser(admin, label, PASSWORD);
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signed = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signed.error) throw signed.error;
  return { id, email, client };
}

export async function deleteTestUser(user: TestUser | undefined) {
  await deleteUserById(admin, user?.id);
}

/** Today's calendar date in `tz` as the database sees it. */
export async function dbTodayIn(tz: string): Promise<string> {
  const [row] = await sql<{ d: string }[]>`select to_char((now() at time zone ${tz})::date, 'YYYY-MM-DD') as d`;
  return row.d;
}

export async function insertVision(user: TestUser, area: string, body = "A 1-year vision") {
  const res = await user.client.from("visions").insert({ user_id: user.id, area, body }).select("id").single();
  if (res.error) throw res.error;
  return res.data.id as string;
}

export async function insertCue(user: TestUser, name: string, scope = "global", explanation: string | null = null): Promise<string> {
  const res = await user.client.from("cues").insert({ user_id: user.id, name, scope, explanation }).select("id").single();
  if (res.error) throw new Error(res.error.message);
  return res.data.id as string;
}

export async function insertImpediment(
  user: TestUser,
  name: string,
  opts: { scope?: string; proofWhen?: string | null; proofThen?: string | null; proofRecover?: string | null; explanation?: string | null } = {},
): Promise<string> {
  const res = await user.client
    .from("impediments")
    .insert({
      user_id: user.id,
      name,
      scope: opts.scope ?? "global",
      explanation: opts.explanation ?? null,
      proof_when: opts.proofWhen ?? null,
      proof_then: opts.proofThen ?? null,
      proof_recover: opts.proofRecover ?? null,
    })
    .select("id")
    .single();
  if (res.error) throw new Error(res.error.message);
  return res.data.id as string;
}

export type SprintItems = {
  p_cue_ids: string[];
  p_impediment_ids: string[];
  p_highest_impediment_id: string;
  /** F7: defaults to the first cue in moneySprintArgs; pass null or a stranger to test the rule. */
  p_focus_cue_id?: string | null;
};

/** One global cue and one global impediment with a complete Proof Point — the minimum start_sprint accepts. */
export async function seedItems(user: TestUser, scope = "global"): Promise<SprintItems> {
  const cue = await insertCue(user, "Ask how much this pays", scope);
  const imp = await insertImpediment(user, "Starting late", {
    scope,
    proofWhen: "I notice myself delaying my first work block",
    proofThen: "I start a 10-minute timer on the smallest executable task",
    proofRecover: "The timer is running within 10 minutes",
  });
  return { p_cue_ids: [cue], p_focus_cue_id: cue, p_impediment_ids: [imp], p_highest_impediment_id: imp };
}

export type StartSprintArgs = SprintItems & {
  p_area: string;
  p_outcome: string;
  p_measurement: "money" | "hours" | "quantity";
  p_currency: string | null;
  p_unit: string | null;
  p_amount: number;
  p_confidence: number;
  p_why: string;
  p_celebration: string;
  p_mantra: string;
  p_usage_of_funds: unknown[];
  p_tz: string;
  p_start_date: string;
  p_intention?: string | null;
  p_proof_when?: string | null;
  p_proof_then?: string | null;
  p_proof_recover?: string | null;
  p_targets?: number[] | null;
  p_intentions?: (string | null)[] | null;
};

export function moneySprintArgs(overrides: Partial<StartSprintArgs> & { p_start_date: string } & SprintItems): StartSprintArgs {
  return {
    p_area: "wealth",
    p_outcome: "Save for the emergency fund",
    p_measurement: "money",
    p_currency: "USD",
    p_unit: null,
    p_amount: 800_000, // 8,000.00 USD in minor units
    p_confidence: 7,
    p_why: "Because a cushion buys calm",
    p_celebration: "Dinner at the lake",
    p_mantra: "Boring money is the money that stays.",
    p_usage_of_funds: [{ label: "Rent", amount: 280_000 }],
    p_tz: "America/Los_Angeles",
    ...overrides,
    p_focus_cue_id: overrides.p_focus_cue_id === undefined ? (overrides.p_cue_ids[0] ?? null) : overrides.p_focus_cue_id,
  };
}

/** Calls start_sprint as the user and returns the new sprint id, or throws the DB message. */
export async function startSprint(user: TestUser, args: StartSprintArgs): Promise<string> {
  const res = await user.client.rpc("start_sprint", args);
  if (res.error) throw new Error(res.error.message);
  return res.data as string;
}

/**
 * A sprint whose day 1 is `startDate` (any date, past included) with 14 open days,
 * written straight into the tables with the service role (tests/support/sprints, shared
 * with the e2e suite). start_sprint only accepts today or tomorrow, so this is how the
 * suite gets days that are already missed.
 */
export async function insertSprintRows(user: TestUser, opts: { startDate: string; tz: string; area?: string; target?: number }): Promise<{ sprintId: string; dayIds: string[] }> {
  return seedSprintRows(admin, user.id, opts);
}

export async function expectRpcError(user: TestUser, fn: string, args: Record<string, unknown>, message: string) {
  const res = await user.client.rpc(fn, args);
  if (!res.error) throw new Error(`${fn} succeeded but should have failed with ${message}`);
  if (!res.error.message.includes(message)) {
    throw new Error(`${fn} failed with "${res.error.message}", expected "${message}"`);
  }
}

/** Calls an RPC as the user and returns its data, or throws the DB message. */
export async function rpc<T = unknown>(user: TestUser, fn: string, args: Record<string, unknown>): Promise<T> {
  const res = await user.client.rpc(fn, args);
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
