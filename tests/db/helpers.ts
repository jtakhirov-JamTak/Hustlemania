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

/**
 * F16: the account's one vision, written through the three step functions (there is no
 * direct INSERT grant). Complete by default — picture, goal and an obstacle with its rule
 * — because a sprint needs all three steps; the obstacle is one extra global impediment
 * per seeded user ("Vision obstacle", no situation, never a sprint member). Idempotent:
 * a second call edits the picture and goal in place and keeps the existing obstacle.
 * `complete: false` stops after the picture.
 */
export async function insertVision(user: TestUser, body = "A 1-year vision", opts: { complete?: boolean } = {}) {
  const picture = await user.client.rpc("save_vision_picture", { p_picture: "A day one year from now" });
  if (picture.error) throw new Error(picture.error.message);
  if (opts.complete === false) return picture.data as string;
  const goal = await user.client.rpc("save_vision_goal", { p_body: body, p_proof: "Proof it happened", p_confidence: 8, p_reason: null as unknown as string });
  if (goal.error) throw new Error(goal.error.message);
  const [row] = await sql<{ obstacle_id: string | null }[]>`select obstacle_id from public.visions where id = ${goal.data as string}`;
  if (row.obstacle_id === null) {
    const obstacle = await user.client.rpc("set_vision_obstacle", {
      p_impediment_id: null as unknown as string,
      p_when: "Vision obstacle",
      p_then: "I start the timer",
      p_recover: "The timer is running",
    });
    if (obstacle.error) throw new Error(obstacle.error.message);
  }
  return goal.data as string;
}

export type ItemKind = "cue" | "impediment";

/** F15 / F17: a situation in the owner's one library (direct INSERT; rank by trigger). */
export async function insertSituation(user: TestUser, name: string, scope = "global"): Promise<string> {
  const res = await user.client.from("situations").insert({ user_id: user.id, name, scope }).select("id").single();
  if (res.error) throw new Error(res.error.message);
  return res.data.id as string;
}

/** F15: replaces an item's attachment set through the one writer of the join tables. */
export async function setSituations(user: TestUser, kind: ItemKind, itemId: string, situationIds: string[]) {
  const res = await user.client.rpc("set_item_situations", { p_kind: kind, p_item_id: itemId, p_situation_ids: situationIds });
  if (res.error) throw new Error(res.error.message);
}

/** The situation ids attached to an item, in rank order (read as the superuser). */
export async function situationsOf(kind: ItemKind, itemId: string): Promise<string[]> {
  const rows =
    kind === "cue"
      ? await sql<{ id: string }[]>`select t.id from public.cue_situations a join public.situations t on t.id = a.situation_id where a.cue_id = ${itemId} order by t.rank, t.id`
      : await sql<{ id: string }[]>`select t.id from public.impediment_situations a join public.situations t on t.id = a.situation_id where a.impediment_id = ${itemId} order by t.rank, t.id`;
  return rows.map((r) => r.id);
}

/**
 * A cue: WHEN (`cue_when`) → REMIND (`name`). By default it gets one situation named
 * after it (F15: a member needs at least one); pass `situation: false` to leave it bare.
 */
export async function insertCue(
  user: TestUser,
  name: string,
  scope = "global",
  opts: { situation?: boolean | string; cueWhen?: string | null } = {},
): Promise<string> {
  const res = await user.client
    .from("cues")
    .insert({ user_id: user.id, name, scope, cue_when: opts.cueWhen ?? null })
    .select("id")
    .single();
  if (res.error) throw new Error(res.error.message);
  if (opts.situation !== false) {
    const sit = await insertSituation(user, typeof opts.situation === "string" ? opts.situation : name, scope);
    await setSituations(user, "cue", res.data.id as string, [sit]);
  }
  return res.data.id as string;
}

/**
 * An impediment: WHEN (`name`) → THEN → RECOVERED WHEN (F16: no INTERFERES). By default it
 * gets one situation named after it; pass `situation: false` to leave it bare.
 */
export async function insertImpediment(
  user: TestUser,
  name: string,
  opts: { scope?: string; proofThen?: string | null; proofRecover?: string | null; situation?: boolean | string } = {},
): Promise<string> {
  const res = await user.client
    .from("impediments")
    .insert({
      user_id: user.id,
      name,
      scope: opts.scope ?? "global",
      proof_then: opts.proofThen ?? null,
      proof_recover: opts.proofRecover ?? null,
    })
    .select("id")
    .single();
  if (res.error) throw new Error(res.error.message);
  if (opts.situation !== false) {
    const sit = await insertSituation(user, typeof opts.situation === "string" ? opts.situation : name, opts.scope ?? "global");
    await setSituations(user, "impediment", res.data.id as string, [sit]);
  }
  return res.data.id as string;
}

export type SprintItems = {
  p_cue_ids: string[];
  p_impediment_ids: string[];
  p_highest_impediment_id: string;
  /** F7: defaults to the first cue in moneySprintArgs; pass null or a stranger to test the rule. */
  p_focus_cue_id?: string | null;
};

/** One global cue and one global impediment with a complete response, each with a situation — the minimum start_sprint accepts. */
export async function seedItems(user: TestUser, scope = "global"): Promise<SprintItems & { situations: { cue: string; impediment: string } }> {
  const cue = await insertCue(user, "Ask how much this pays", scope, { situation: "Scheduling", cueWhen: "I schedule anything" });
  const imp = await insertImpediment(user, "I notice myself delaying my first work block", {
    scope,
    proofThen: "I start a 10-minute timer on the smallest executable task",
    proofRecover: "The timer is running within 10 minutes",
    situation: "Starting late",
  });
  return {
    p_cue_ids: [cue],
    p_focus_cue_id: cue,
    p_impediment_ids: [imp],
    p_highest_impediment_id: imp,
    situations: { cue: (await situationsOf("cue", cue))[0], impediment: (await situationsOf("impediment", imp))[0] },
  };
}

/** F15 close_day payload helpers: an occurrence with its situations. */
export const occurred = (item_id: string, situations: { situation_id: string; recovered?: "yes" | "no" | null }[]) => ({ item_id, answer: "yes", situations });
export const used = (item_id: string, situationIds: string[]) => ({ item_id, answer: "yes", situations: situationIds.map((situation_id) => ({ situation_id })) });

export type StartSprintArgs = SprintItems & {
  p_area: string;
  p_outcome: string;
  p_measurement: "money" | "hours" | "quantity";
  p_currency: string | null;
  p_unit: string | null;
  p_amount: number;
  p_confidence: number;
  p_celebration: string;
  p_mantra: string;
  p_usage_of_funds: unknown[];
  p_tz: string;
  p_start_date: string;
  p_intention?: string | null;
  p_proof_then?: string | null;
  p_proof_recover?: string | null;
  p_targets?: number[] | null;
};

export function moneySprintArgs(
  input: Partial<StartSprintArgs> & { p_start_date: string } & SprintItems & { situations?: unknown },
): StartSprintArgs {
  // seedItems carries the situation ids beside the RPC arguments; PostgREST matches a
  // function by its named parameters, so the extra key must not reach the call.
  const { situations: _situations, ...overrides } = input;
  void _situations;
  return {
    p_area: "wealth",
    p_outcome: "Save for the emergency fund",
    p_measurement: "money",
    p_currency: "USD",
    p_unit: null,
    p_amount: 800_000, // 8,000.00 USD in minor units
    p_confidence: 7,
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
export async function insertSprintRows(
  user: TestUser,
  opts: { startDate: string; tz: string; area?: string; target?: number; targets?: (number | undefined)[] },
): Promise<{ sprintId: string; dayIds: string[] }> {
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
