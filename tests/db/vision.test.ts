import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestUser,
  dbTodayIn,
  deleteTestUser,
  expectRpcError,
  insertImpediment,
  insertVision,
  moneySprintArgs,
  rpc,
  seedItems,
  sql,
  startSprint,
  type TestUser,
} from "./helpers";

const TZ = "America/Los_Angeles";
const RULE = { p_when: "a one-off request lands", p_then: "I reply with the retainer offer within the hour", p_recover: "I am back on the outreach list within 15 minutes" };

afterAll(async () => {
  await sql.end();
});

// ---------------------------------------------------------------------------
// The 0011 collapse: the SQL between the migration's `collapse:begin` / `collapse:end`
// markers, run against seeded pre-0011-shaped rows inside a rolled-back transaction.
// The criteria come from the migration file, so a rewritten rule turns this red.
// ---------------------------------------------------------------------------
describe("0011 collapse transform (one active vision per user)", () => {
  const migration = readFileSync(join(__dirname, "../../supabase/migrations/0011_vision_v2.sql"), "utf8");
  const block = migration.slice(migration.indexOf("-- collapse:begin"), migration.indexOf("-- collapse:end"));
  const ROLLBACK = new Error("rollback");
  let a: TestUser;
  let b: TestUser;

  beforeAll(async () => {
    a = await createTestUser("collapse-a");
    b = await createTestUser("collapse-b");
  });
  afterAll(async () => {
    await deleteTestUser(a);
    await deleteTestUser(b);
  });

  type Seeded = { kept: Record<string, string>; visions: { id: string; user: string; area: string }[] };

  /** Two active visions for A and three for B, each with a sprint, as the per-Area world left them. */
  async function seed(tx: TransactionSql): Promise<Seeded> {
    await tx`drop index public.visions_one_active_per_user`;
    const plan = [
      { user: a, area: "wealth", hoursAgo: 48 },
      { user: a, area: "health", hoursAgo: 2 }, // A's newest
      { user: b, area: "wealth", hoursAgo: 10 },
      { user: b, area: "health", hoursAgo: 30 },
      { user: b, area: "relationships", hoursAgo: 1 }, // B's newest
    ];
    const visions: Seeded["visions"] = [];
    for (const p of plan) {
      const [v] = await tx<{ id: string }[]>`
        insert into public.visions (user_id, body, deadline, created_at, updated_at)
        values (${p.user.id}, ${`${p.area} vision`}, '2099-01-01', now() - make_interval(hours => ${p.hoursAgo + 100}), now() - make_interval(hours => ${p.hoursAgo}))
        returning id`;
      await tx`
        insert into public.sprints (user_id, vision_id, area, outcome, measurement, currency, amount, confidence, why, celebration, mantra, tz, start_date, end_date)
        values (${p.user.id}, ${v.id}, ${p.area}, 'o', 'money', 'USD', 1400, 7, 'w', 'c', 'm', ${TZ}, current_date, current_date + 13)`;
      visions.push({ id: v.id, user: p.user.id, area: p.area });
    }
    return { kept: { [a.id]: visions[1].id, [b.id]: visions[4].id }, visions };
  }

  async function activeAndSprints(tx: TransactionSql, seeded: Seeded) {
    const active = await tx<{ user_id: string; id: string }[]>`
      select user_id, id from public.visions where user_id in (${a.id}, ${b.id}) and archived_at is null order by user_id`;
    const sprints = await tx<{ vision_id: string; area: string }[]>`
      select vision_id, area from public.sprints where user_id in (${a.id}, ${b.id}) order by vision_id, area`;
    return { active, sprints, seededSprints: seeded.visions.map((v) => ({ vision_id: v.id, area: v.area })).sort((x, y) => x.vision_id.localeCompare(y.vision_id) || x.area.localeCompare(y.area)) };
  }

  it("keeps the most recently updated active vision per user, archives the rest, and leaves every sprint's vision_id untouched", async () => {
    await sql
      .begin(async (tx) => {
        const seeded = await seed(tx);
        await tx.unsafe(block);
        const { active, sprints, seededSprints } = await activeAndSprints(tx, seeded);
        expect(active).toHaveLength(2);
        expect(Object.fromEntries(active.map((r) => [r.user_id, r.id]))).toEqual(seeded.kept);
        const archived = await tx<{ n: number }[]>`
          select count(*)::int as n from public.visions where user_id in (${a.id}, ${b.id}) and archived_at is not null`;
        expect(archived[0].n).toBe(3);
        expect(sprints).toEqual(seededSprints);
        throw ROLLBACK;
      })
      .catch((e) => {
        if (e !== ROLLBACK) throw e;
      });
  });

  it("the check can fail: with the rule flipped to keep the oldest, the newest is archived instead", async () => {
    const flipped = block.replace("order by updated_at desc", "order by updated_at asc");
    expect(flipped).not.toBe(block);
    await sql
      .begin(async (tx) => {
        const seeded = await seed(tx);
        await tx.unsafe(flipped);
        const { active } = await activeAndSprints(tx, seeded);
        expect(active).toHaveLength(2);
        expect(Object.fromEntries(active.map((r) => [r.user_id, r.id]))).not.toEqual(seeded.kept);
        throw ROLLBACK;
      })
      .catch((e) => {
        if (e !== ROLLBACK) throw e;
      });
  });

  it("the partial unique index rejects a second active vision for the same user", async () => {
    await insertVision(a, "Vision A");
    await expect(
      sql`insert into public.visions (user_id, body, deadline) values (${a.id}, 'a second active one', '2099-01-01')`,
    ).rejects.toThrow(/visions_one_active_per_user/);
    const [n] = await sql<{ n: number }[]>`select count(*)::int as n from public.visions where user_id = ${a.id} and archived_at is null`;
    expect(n.n).toBe(1);
  });

  it("area is gone from visions; the new columns exist with deadline not null", async () => {
    const cols = await sql<{ column_name: string; is_nullable: string }[]>`
      select column_name, is_nullable from information_schema.columns
      where table_schema = 'public' and table_name = 'visions' order by column_name`;
    expect(cols.map((c) => c.column_name)).toEqual(["archived_at", "baseline", "body", "created_at", "deadline", "id", "meaning", "obstacle_id", "proof", "updated_at", "user_id"]);
    expect(cols.find((c) => c.column_name === "deadline")!.is_nullable).toBe("NO");
    expect(cols.find((c) => c.column_name === "proof")!.is_nullable).toBe("YES");
  });
});

// ---------------------------------------------------------------------------
// vision_reviews: RLS (falsifiable by disabling it), no write grant, append-only.
// ---------------------------------------------------------------------------
describe("vision_reviews", () => {
  let a: TestUser;
  let b: TestUser;
  let reviewId: string;

  beforeAll(async () => {
    a = await createTestUser("reviews-a");
    b = await createTestUser("reviews-b");
    await insertVision(a);
    reviewId = await rpc<string>(a, "review_vision", { p_verdict: "still_true", p_note: "  Two retainers signed.  " });
  });
  afterAll(async () => {
    await deleteTestUser(a);
    await deleteTestUser(b);
  });

  it("the owner reads the row with the trimmed note; user B selects 0 rows", async () => {
    const own = await a.client.from("vision_reviews").select("id, verdict, note");
    expect(own.error).toBeNull();
    expect(own.data).toEqual([{ id: reviewId, verdict: "still_true", note: "Two retainers signed." }]);
    const other = await b.client.from("vision_reviews").select("id");
    expect(other.error).toBeNull();
    expect(other.data).toEqual([]);
  });

  it("the check can fail: with RLS disabled B sees A's review; re-enabled, 0 rows again", async () => {
    await sql`alter table public.vision_reviews disable row level security`;
    try {
      const leaked = await b.client.from("vision_reviews").select("id");
      expect(leaked.error).toBeNull();
      expect(leaked.data!.map((r) => r.id)).toContain(reviewId);
    } finally {
      await sql`alter table public.vision_reviews enable row level security`;
    }
    const hidden = await b.client.from("vision_reviews").select("id");
    expect(hidden.data).toEqual([]);
  });

  it("an authenticated UPDATE of verdict on an own row is permission denied and the row is unchanged; INSERT and DELETE too", async () => {
    const upd = await a.client.from("vision_reviews").update({ verdict: "needs_changes" }).eq("id", reviewId).select("id");
    expect(upd.error?.message).toMatch(/permission denied/);
    const [row] = await sql<{ verdict: string }[]>`select verdict from public.vision_reviews where id = ${reviewId}`;
    expect(row.verdict).toBe("still_true");
    const [vision] = await sql<{ id: string }[]>`select id from public.visions where user_id = ${a.id} and archived_at is null`;
    const ins = await a.client.from("vision_reviews").insert({ user_id: a.id, vision_id: vision.id, verdict: "still_true" }).select("id");
    expect(ins.error?.message).toMatch(/permission denied/);
    const del = await a.client.from("vision_reviews").delete().eq("id", reviewId).select("id");
    expect(del.error?.message).toMatch(/permission denied/);
  });

  it("the count only ever grows across three review_vision calls, each its own dated row", async () => {
    const before = (await sql<{ n: number }[]>`select count(*)::int as n from public.vision_reviews where user_id = ${a.id}`)[0].n;
    const ids = [
      await rpc<string>(a, "review_vision", { p_verdict: "needs_changes" }),
      await rpc<string>(a, "review_vision", { p_verdict: "still_true", p_note: "" }),
      await rpc<string>(a, "review_vision", { p_verdict: "still_true" }),
    ];
    expect(new Set([...ids, reviewId]).size).toBe(4);
    const rows = await sql<{ n: number; nulls: number }[]>`
      select count(*)::int as n, count(*) filter (where note is null)::int as nulls from public.vision_reviews where user_id = ${a.id}`;
    expect(rows[0].n).toBe(before + 3);
    expect(rows[0].nulls).toBe(3);
  });

  it("rejects an unknown verdict and, for a user with no active vision, no_active_vision", async () => {
    await expectRpcError(a, "review_vision", { p_verdict: "maybe" }, "invalid_verdict");
    await expectRpcError(b, "review_vision", { p_verdict: "still_true" }, "no_active_vision");
  });
});

// ---------------------------------------------------------------------------
// save_vision / set_vision_obstacle / set_vision_rule / replace_vision, and the
// redefined start_sprint and the vision_obstacle guard on the library functions.
// ---------------------------------------------------------------------------
describe("vision write path (F9 functions)", () => {
  let u: TestUser;
  let today: string;

  beforeAll(async () => {
    u = await createTestUser("vision-fns");
    today = await dbTodayIn(TZ);
  });
  afterAll(async () => {
    await deleteTestUser(u);
  });

  const activeVision = async () =>
    (await sql<{ id: string; body: string; deadline: string; proof: string | null; meaning: string | null; baseline: string | null; obstacle_id: string | null; created_at: string; updated_at: string }[]>`
      select id, body, to_char(deadline, 'YYYY-MM-DD') as deadline, proof, meaning, baseline, obstacle_id, created_at::text, updated_at::text
      from public.visions where user_id = ${u.id} and archived_at is null`)[0] ?? null;

  it("save_vision rejects a blank body, a blank proof, a null / today / past deadline, and writes nothing", async () => {
    await expectRpcError(u, "save_vision", { p_body: "   ", p_deadline: "2099-01-01", p_proof: "p" }, "vision_body_required");
    await expectRpcError(u, "save_vision", { p_body: "b", p_deadline: "2099-01-01", p_proof: "  " }, "vision_proof_required");
    await expectRpcError(u, "save_vision", { p_body: "b", p_deadline: null, p_proof: "p" }, "vision_deadline_past");
    const utcToday = await dbTodayIn("UTC");
    await expectRpcError(u, "save_vision", { p_body: "b", p_deadline: utcToday, p_proof: "p" }, "vision_deadline_past");
    await expectRpcError(u, "save_vision", { p_body: "b", p_deadline: "2020-01-01", p_proof: "p" }, "vision_deadline_past");
    expect(await activeVision()).toBeNull();
  });

  it("save_vision inserts with trimmed text, blank optionals as null, then edits in place keeping id and created_at", async () => {
    const id = await rpc<string>(u, "save_vision", { p_body: "  Calm practice  ", p_deadline: "2099-06-01", p_proof: "  Three retainers ", p_meaning: "   ", p_baseline: "One retainer" });
    const first = await activeVision();
    expect(first).toMatchObject({ id, body: "Calm practice", deadline: "2099-06-01", proof: "Three retainers", meaning: null, baseline: "One retainer", obstacle_id: null });

    const again = await rpc<string>(u, "save_vision", { p_body: "Calm practice, four days a week", p_deadline: "2099-09-01", p_proof: "Three retainers", p_meaning: "Fridays with the kids" });
    expect(again).toBe(id);
    const second = await activeVision();
    expect(second).toMatchObject({ id, body: "Calm practice, four days a week", deadline: "2099-09-01", meaning: "Fridays with the kids", baseline: null, created_at: first!.created_at });
    expect(second!.updated_at).not.toBe(first!.updated_at);
    const [n] = await sql<{ n: number }[]>`select count(*)::int as n from public.visions where user_id = ${u.id}`;
    expect(n.n).toBe(1);
  });

  it("start_sprint: a user with only a step-1 vision (no obstacle) can start a sprint, in any Area", async () => {
    expect((await activeVision())!.obstacle_id).toBeNull();
    const items = await seedItems(u);
    const id = await startSprint(u, moneySprintArgs({ ...items, p_area: "health", p_tz: TZ, p_start_date: today }));
    const [row] = await sql<{ vision_id: string; area: string }[]>`select vision_id, area from public.sprints where id = ${id}`;
    expect(row).toEqual({ vision_id: (await activeVision())!.id, area: "health" });
  });

  it("set_vision_obstacle: exactly one of id / name; a whitespace name with no id changes nothing (atomicity)", async () => {
    const before = await activeVision();
    const imps = async () => (await sql<{ n: number }[]>`select count(*)::int as n from public.impediments where user_id = ${u.id}`)[0].n;
    const nImps = await imps();
    await expectRpcError(u, "set_vision_obstacle", { p_impediment_id: null, p_name: "   " }, "obstacle_pick_or_name");
    await expectRpcError(u, "set_vision_obstacle", { p_impediment_id: null, p_name: null }, "obstacle_pick_or_name");
    const existing = await insertImpediment(u, "Phone distraction");
    await expectRpcError(u, "set_vision_obstacle", { p_impediment_id: existing, p_name: "Both at once" }, "obstacle_pick_or_name");
    expect((await activeVision())!.obstacle_id).toBe(before!.obstacle_id);
    expect(await imps()).toBe(nImps + 1);
  });

  it("set_vision_obstacle rejects an Area-scoped pick, an archived pick and a stranger's; accepts a global one", async () => {
    const scoped = await insertImpediment(u, "Wealth-only", { scope: "wealth" });
    await expectRpcError(u, "set_vision_obstacle", { p_impediment_id: scoped }, "obstacle_not_global");
    const archived = await insertImpediment(u, "Old one");
    await sql`update public.impediments set archived_at = now() where id = ${archived}`;
    await expectRpcError(u, "set_vision_obstacle", { p_impediment_id: archived }, "item_archived");
    const other = await createTestUser("vision-fns-other");
    try {
      const theirs = await insertImpediment(other, "Theirs");
      await expectRpcError(u, "set_vision_obstacle", { p_impediment_id: theirs }, "item_not_found");
    } finally {
      await deleteTestUser(other);
    }
    expect((await activeVision())!.obstacle_id).toBeNull();

    const [{ id: phone }] = await sql<{ id: string }[]>`select id from public.impediments where user_id = ${u.id} and name = 'Phone distraction'`;
    expect(await rpc<string>(u, "set_vision_obstacle", { p_impediment_id: phone })).toBe(phone);
    expect((await activeVision())!.obstacle_id).toBe(phone);
  });

  it("set_vision_obstacle with a new name creates a global impediment in the same call and links it", async () => {
    const id = await rpc<string>(u, "set_vision_obstacle", { p_impediment_id: null, p_name: "  Saying yes to one-off projects ", p_explanation: "Outreach slips a week" });
    const [imp] = await sql<{ name: string; explanation: string; scope: string; rank: number }[]>`
      select name, explanation, scope, rank from public.impediments where id = ${id}`;
    expect(imp).toMatchObject({ name: "Saying yes to one-off projects", explanation: "Outreach slips a week", scope: "global" });
    expect(imp.rank).toBeGreaterThan(0);
    expect((await activeVision())!.obstacle_id).toBe(id);
  });

  it("set_vision_rule writes all three parts onto the obstacle; any blank part is rule_incomplete and writes nothing", async () => {
    const obstacle = (await activeVision())!.obstacle_id!;
    for (const blank of [{ p_when: " " }, { p_then: "" }, { p_recover: null }]) {
      await expectRpcError(u, "set_vision_rule", { ...RULE, ...blank }, "rule_incomplete");
    }
    let [row] = await sql<{ name: string; proof_then: string | null }[]>`select name, proof_then from public.impediments where id = ${obstacle}`;
    expect(row).toEqual({ name: "Saying yes to one-off projects", proof_then: null });
    await rpc(u, "set_vision_rule", RULE);
    // F15: WHEN is the impediment's name.
    [row] = await sql<{ name: string; proof_then: string; proof_recover: string }[]>`select name, proof_then, proof_recover from public.impediments where id = ${obstacle}`;
    expect(row).toEqual({ name: RULE.p_when, proof_then: RULE.p_then, proof_recover: RULE.p_recover });
  });

  it("set_vision_rule is accepted by the F6 trigger when the obstacle is an active sprint's highest (shared row)", async () => {
    const [{ id: highest }] = await sql<{ id: string }[]>`
      select i.id from public.impediments i join public.sprint_impediments m on m.impediment_id = i.id
      where i.user_id = ${u.id} and m.is_highest and m.removed_at is null`;
    await rpc(u, "set_vision_obstacle", { p_impediment_id: highest });
    await rpc(u, "set_vision_rule", { p_when: "I stall", p_then: "I start the timer", p_recover: "The timer runs within 10 minutes" });
    const [row] = await sql<{ name: string; proof_recover: string }[]>`select name, proof_recover from public.impediments where id = ${highest}`;
    expect(row).toEqual({ name: "I stall", proof_recover: "The timer runs within 10 minutes" });
    // The trigger still guards the row against a partial proof from the library path.
    await expect(sql`update public.impediments set proof_recover = null where id = ${highest}`).rejects.toThrow(/proof_point_required/);
  });

  it("archive_item and set_item_scope (≠ global) raise vision_obstacle for the active vision's obstacle; widening to global is fine", async () => {
    const obstacle = (await activeVision())!.obstacle_id!;
    await expectRpcError(u, "archive_item", { p_kind: "impediment", p_item_id: obstacle }, "vision_obstacle");
    await expectRpcError(u, "set_item_scope", { p_kind: "impediment", p_item_id: obstacle, p_scope: "health" }, "vision_obstacle");
    const [row] = await sql<{ archived_at: string | null; scope: string }[]>`select archived_at, scope from public.impediments where id = ${obstacle}`;
    expect(row).toEqual({ archived_at: null, scope: "global" });
    expect(await rpc(u, "set_item_scope", { p_kind: "impediment", p_item_id: obstacle, p_scope: "global" })).toMatchObject({ ok: true });
  });

  it("replace_vision archives the active vision; the sprint keeps its vision_id, the obstacle is untouched, start_sprint rejects until save_vision runs again", async () => {
    const before = await activeVision();
    const [sprint] = await sql<{ id: string; vision_id: string }[]>`select id, vision_id from public.sprints where user_id = ${u.id}`;
    expect(sprint.vision_id).toBe(before!.id);
    await rpc(u, "replace_vision", {});
    expect(await activeVision()).toBeNull();
    const [archived] = await sql<{ archived_at: string | null; obstacle_id: string }[]>`select archived_at, obstacle_id from public.visions where id = ${before!.id}`;
    expect(archived.archived_at).not.toBeNull();
    expect(archived.obstacle_id).toBe(before!.obstacle_id);
    const [after] = await sql<{ vision_id: string }[]>`select vision_id from public.sprints where id = ${sprint.id}`;
    expect(after.vision_id).toBe(before!.id);
    const [imp] = await sql<{ archived_at: string | null; name: string }[]>`select archived_at, name from public.impediments where id = ${before!.obstacle_id}`;
    expect(imp).toEqual({ archived_at: null, name: "I stall" });

    // The archived vision's obstacle is no longer guarded; a second Replace has nothing to archive.
    await expectRpcError(u, "replace_vision", {}, "no_active_vision");
    await expectRpcError(u, "set_vision_rule", RULE, "no_active_vision");
    await expectRpcError(u, "set_vision_obstacle", { p_impediment_id: before!.obstacle_id }, "no_active_vision");
    const narrowed = await rpc<{ ok: boolean }>(u, "set_item_scope", { p_kind: "impediment", p_item_id: before!.obstacle_id!, p_scope: "wealth" });
    expect(typeof narrowed.ok).toBe("boolean"); // the sprint rules answer now, not vision_obstacle

    const items = await seedItems(u);
    await expectRpcError(u, "start_sprint", moneySprintArgs({ ...items, p_area: "wealth", p_tz: TZ, p_start_date: today }), "no_active_vision");
    const fresh = await rpc<string>(u, "save_vision", { p_body: "A new direction", p_deadline: "2099-01-01", p_proof: "A signed lease" });
    expect(fresh).not.toBe(before!.id);
    expect((await activeVision())!.obstacle_id).toBeNull();
    const started = await startSprint(u, moneySprintArgs({ ...items, p_area: "wealth", p_tz: TZ, p_start_date: today }));
    const [row] = await sql<{ vision_id: string }[]>`select vision_id from public.sprints where id = ${started}`;
    expect(row.vision_id).toBe(fresh);
  });

  it("start_sprint (0011 body) no longer reads visions.area: the definition carries the area-less lookup", async () => {
    const [row] = await sql<{ src: string }[]>`select prosrc as src from pg_proc where proname = 'start_sprint' and pronamespace = 'public'::regnamespace`;
    expect(row.src).toContain("where user_id = v_uid and archived_at is null;");
    expect(row.src).not.toContain("area = p_area and archived_at");
  });
});
