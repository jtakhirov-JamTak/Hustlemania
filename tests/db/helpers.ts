import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import postgres from "postgres";

/**
 * DB integration tests run only against the local Supabase stack. Every connection
 * string is checked for a loopback host before use so a misconfigured environment can
 * never point these tests, which drop and recreate policies, at the hosted project.
 */
function requireLocal(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name} is not set; run \`npm run test:db\` so scripts/local-env.mjs writes .env.local`);
  const host = new URL(value).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(`${name} points at ${host}; DB tests only run against the local stack`);
  }
  return value;
}

export const DATABASE_URL = requireLocal("LOCAL_DATABASE_URL", process.env.LOCAL_DATABASE_URL);
export const SUPABASE_URL = requireLocal("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/** Superuser-ish connection (postgres role, bypasses RLS) for setup and assertions. */
export const sql = postgres(DATABASE_URL, { max: 2, onnotice: () => {} });

export const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export type TestUser = {
  id: string;
  email: string;
  /** supabase-js client authenticated as this user; every query runs under RLS. */
  client: SupabaseClient;
};

const PASSWORD = "test-password-1234";

export async function createTestUser(label: string): Promise<TestUser> {
  const email = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (created.error || !created.data.user) throw created.error ?? new Error("createUser returned no user");

  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signed = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signed.error) throw signed.error;
  return { id: created.data.user.id, email, client };
}

export async function deleteTestUser(user: TestUser | undefined) {
  if (!user) return;
  const res = await admin.auth.admin.deleteUser(user.id);
  if (res.error) throw res.error;
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

export type StartSprintArgs = {
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
};

export function moneySprintArgs(overrides: Partial<StartSprintArgs> & { p_start_date: string }): StartSprintArgs {
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
  };
}

/** Calls start_sprint as the user and returns the new sprint id, or throws the DB message. */
export async function startSprint(user: TestUser, args: StartSprintArgs): Promise<string> {
  const res = await user.client.rpc("start_sprint", args);
  if (res.error) throw new Error(res.error.message);
  return res.data as string;
}

export async function expectRpcError(user: TestUser, fn: string, args: Record<string, unknown>, message: string) {
  const res = await user.client.rpc(fn, args);
  if (!res.error) throw new Error(`${fn} succeeded but should have failed with ${message}`);
  if (!res.error.message.includes(message)) {
    throw new Error(`${fn} failed with "${res.error.message}", expected "${message}"`);
  }
}
