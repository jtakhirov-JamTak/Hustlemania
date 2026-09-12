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
const GOAL = { p_body: "  Calm practice  ", p_proof: "  Three retainers ", p_confidence: 8, p_reason: null };
const ROLLBACK = new Error("rollback");

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

  it("0020: the column set is exact, body and deadline are nullable, the three checks are named", async () => {
    const cols = await sql<{ column_name: string; is_nullable: string }[]>`
      select column_name, is_nullable from information_schema.columns
      where table_schema = 'public' and table_name = 'visions' order by column_name`;
    expect(cols.map((c) => c.column_name)).toEqual(["archived_at", "body", "confidence", "confidence_reason", "created_at", "deadline", "id", "obstacle_id", "picture", "proof", "updated_at", "user_id"]);
    for (const nullable of ["body", "deadline", "proof", "picture", "confidence", "confidence_reason"]) {
      expect(cols.find((c) => c.column_name === nullable)!.is_nullable, nullable).toBe("YES");
    }
    const checks = await sql<{ conname: string; def: string }[]>`
      select conname, pg_get_constraintdef(oid) as def from pg_constraint
      where conrelid = 'public.visions'::regclass and contype = 'c' order by conname`;
    expect(checks.map((c) => c.conname)).toEqual(["visions_body_check", "visions_confidence_check", "visions_confidence_reason_check"]);
    expect(checks.find((c) => c.conname === "visions_body_check")!.def).toMatch(/body IS NULL/);
    expect(checks.find((c) => c.conname === "visions_confidence_check")!.def).toMatch(/<= 10/);
    expect(checks.find((c) => c.conname === "visions_confidence_reason_check")!.def).toMatch(/<= 6/);
  });
});

// ---------------------------------------------------------------------------
// The 0020 assertion block, run on its own inside rolled-back transactions: clean it
// passes; each provoked deviation makes it throw. A branch that cannot throw is a
// branch that checks nothing.
// ---------------------------------------------------------------------------
describe("0020 assertion block can fail", () => {
  const migration = readFileSync(join(__dirname, "../../supabase/migrations/0020_vision_v3.sql"), "utf8");
  const block = migration.slice(migration.indexOf("-- assert:begin"), migration.indexOf("-- assert:end"));
  let a: TestUser;

  beforeAll(async () => {
    a = await createTestUser("assert-a");
  });
  afterAll(async () => {
    await deleteTestUser(a);
  });

  async function provoked(prepare: (tx: TransactionSql) => Promise<unknown>): Promise<string | null> {
    let thrown: string | null = null;
    await sql
      .begin(async (tx) => {
        await prepare(tx);
        try {
          await tx.unsafe(block);
        } catch (e) {
          thrown = (e as Error).message;
        }
        throw ROLLBACK;
      })
      .catch((e) => {
        if (e !== ROLLBACK) throw e;
      });
    return thrown;
  }

  it("passes on the migrated schema", async () => {
    expect(await provoked(async () => {})).toBeNull();
  });

  it("throws when visions.meaning comes back, when impediments.explanation comes back, and when cues.explanation goes", async () => {
    expect(await provoked(async (tx) => await tx`alter table public.visions add column meaning text`)).toMatch(/schema_unexpected: visions columns/);
    expect(await provoked(async (tx) => await tx`alter table public.impediments add column explanation text`)).toMatch(/impediments\.explanation still present/);
    expect(await provoked(async (tx) => await tx`alter table public.cues drop column explanation`)).toMatch(/cues\.explanation missing/);
  });

  it("throws on a vision row with neither picture nor goal, and on a reason above confidence 6", async () => {
    expect(await provoked(async (tx) => await tx`insert into public.visions (user_id) values (${a.id})`)).toMatch(/data_unexpected: 1 vision rows/);
    expect(
      await provoked(async (tx) => {
        await tx`alter table public.visions drop constraint visions_confidence_reason_check`;
        await tx`insert into public.visions (user_id, picture, confidence, confidence_reason) values (${a.id}, 'p', 9, 'stale')`;
      }),
    ).toMatch(/reason without a low confidence/);
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
// save_vision_picture / save_vision_goal / set_vision_obstacle / replace_vision (F16),
// the redefined start_sprint gate and the vision_obstacle guard on the library functions.
// ---------------------------------------------------------------------------
describe("vision write path (F16 functions)", () => {
  let u: TestUser;
  let today: string;

  beforeAll(async () => {
    u = await createTestUser("vision-fns");
    today = await dbTodayIn(TZ);
  });
  afterAll(async () => {
    await deleteTestUser(u);
  });

  type Active = {
    id: string;
    picture: string | null;
    body: string | null;
    deadline: string | null;
    proof: string | null;
    confidence: number | null;
    confidence_reason: string | null;
    obstacle_id: string | null;
    created_at: string;
    updated_at: string;
  };
  const activeVision = async () =>
    (await sql<Active[]>`
      select id, picture, body, to_char(deadline, 'YYYY-MM-DD') as deadline, proof, confidence, confidence_reason, obstacle_id, created_at::text, updated_at::text
      from public.visions where user_id = ${u.id} and archived_at is null`)[0] ?? null;
  const twelveMonths = async () => (await sql<{ d: string }[]>`select to_char((current_date + interval '12 months')::date, 'YYYY-MM-DD') as d`)[0].d;

  it("save_vision_picture rejects a blank picture and writes nothing; save_vision_goal before step 1 is no_active_vision", async () => {
    await expectRpcError(u, "save_vision_picture", { p_picture: "   " }, "vision_picture_required");
    expect(await activeVision()).toBeNull();
    await expectRpcError(u, "save_vision_goal", GOAL, "no_active_vision");
    expect(await activeVision()).toBeNull();
  });

  it("save_vision_picture inserts, a second call edits in place (same id, created_at); save_vision_goal trims and sets the deadline to twelve months once", async () => {
    const id = await rpc<string>(u, "save_vision_picture", { p_picture: "  A morning run before the kids wake  " });
    const first = await activeVision();
    expect(first).toMatchObject({ id, picture: "A morning run before the kids wake", body: null, deadline: null, proof: null, confidence: null, obstacle_id: null });

    expect(await rpc<string>(u, "save_vision_picture", { p_picture: "A morning run, then the draft" })).toBe(id);
    const second = await activeVision();
    expect(second).toMatchObject({ id, picture: "A morning run, then the draft", body: null, created_at: first!.created_at });
    expect(second!.updated_at).not.toBe(first!.updated_at);

    expect(await rpc<string>(u, "save_vision_goal", GOAL)).toBe(id);
    const goal = await activeVision();
    expect(goal).toMatchObject({ id, body: "Calm practice", proof: "Three retainers", confidence: 8, confidence_reason: null, deadline: await twelveMonths(), picture: "A morning run, then the draft" });

    // The deadline is set once: a later goal save leaves it alone.
    await sql`update public.visions set deadline = '2030-01-01' where id = ${id}`;
    await rpc<string>(u, "save_vision_goal", { ...GOAL, p_body: "Calm practice, four days a week" });
    expect(await activeVision()).toMatchObject({ id, body: "Calm practice, four days a week", deadline: "2030-01-01", created_at: first!.created_at });
    const [n] = await sql<{ n: number }[]>`select count(*)::int as n from public.visions where user_id = ${u.id}`;
    expect(n.n).toBe(1);
  });

  it("save_vision_goal rejections leave the row unchanged; the reason is required at 6 and dropped at 7", async () => {
    const before = await activeVision();
    await expectRpcError(u, "save_vision_goal", { ...GOAL, p_body: "   " }, "vision_body_required");
    await expectRpcError(u, "save_vision_goal", { ...GOAL, p_proof: "" }, "vision_proof_required");
    for (const bad of [null, -1, 11]) {
      await expectRpcError(u, "save_vision_goal", { ...GOAL, p_confidence: bad }, "confidence_out_of_range");
    }
    await expectRpcError(u, "save_vision_goal", { ...GOAL, p_confidence: 6, p_reason: "  " }, "confidence_reason_required");
    expect(await activeVision()).toEqual(before);

    await rpc(u, "save_vision_goal", { ...GOAL, p_confidence: 6, p_reason: "  Too many clients  " });
    expect(await activeVision()).toMatchObject({ confidence: 6, confidence_reason: "Too many clients" });
    await rpc(u, "save_vision_goal", { ...GOAL, p_confidence: 7, p_reason: "stale" });
    expect(await activeVision()).toMatchObject({ confidence: 7, confidence_reason: null });
    await rpc(u, "save_vision_goal", { ...GOAL, p_confidence: 0, p_reason: "No time at all" });
    expect(await activeVision()).toMatchObject({ confidence: 0, confidence_reason: "No time at all" });
    await rpc(u, "save_vision_goal", GOAL);
  });

  it("the table backs the reason rule: a reason above 6 is refused even by a superuser write", async () => {
    const { id } = (await activeVision())!;
    await expect(sql`update public.visions set confidence = 9, confidence_reason = 'x' where id = ${id}`).rejects.toThrow(/visions_confidence_reason_check/);
  });

  it("set_vision_obstacle: any blank part is rule_incomplete and writes nothing, with or without a pick", async () => {
    const imps = async () => (await sql<{ n: number }[]>`select count(*)::int as n from public.impediments where user_id = ${u.id}`)[0].n;
    const nImps = await imps();
    for (const blank of [{ p_when: " " }, { p_then: "" }, { p_recover: null }]) {
      await expectRpcError(u, "set_vision_obstacle", { p_impediment_id: null, ...RULE, ...blank }, "rule_incomplete");
    }
    expect(await imps()).toBe(nImps);
    const existing = await insertImpediment(u, "Phone distraction");
    for (const blank of [{ p_when: " " }, { p_then: "" }, { p_recover: null }]) {
      await expectRpcError(u, "set_vision_obstacle", { p_impediment_id: existing, ...RULE, ...blank }, "rule_incomplete");
    }
    const [row] = await sql<{ name: string; proof_then: string | null }[]>`select name, proof_then from public.impediments where id = ${existing}`;
    expect(row).toEqual({ name: "Phone distraction", proof_then: null });
    expect((await activeVision())!.obstacle_id).toBeNull();
  });

  it("start_sprint rejects vision_incomplete after steps 1 and 2, starts after step 3, and rejects again once the proof is blanked", async () => {
    const items = await seedItems(u);
    const args = moneySprintArgs({ ...items, p_area: "health", p_tz: TZ, p_start_date: today });
    await expectRpcError(u, "start_sprint", args, "vision_incomplete");

    const obstacle = await rpc<string>(u, "set_vision_obstacle", { p_impediment_id: null, ...RULE, p_when: "  Saying yes to one-off projects " });
    expect((await activeVision())!.obstacle_id).toBe(obstacle);
    const id = await startSprint(u, args);
    const [row] = await sql<{ vision_id: string; area: string }[]>`select vision_id, area from public.sprints where id = ${id}`;
    expect(row).toEqual({ vision_id: (await activeVision())!.id, area: "health" });

    // The obstacle is not a sprint member, so the library path may blank its proof; the gate closes again.
    await sql`update public.impediments set proof_recover = null where id = ${obstacle}`;
    await expectRpcError(u, "start_sprint", moneySprintArgs({ ...items, p_area: "wealth", p_tz: TZ, p_start_date: today }), "vision_incomplete");
    await sql`update public.impediments set proof_recover = ${RULE.p_recover} where id = ${obstacle}`;

    // A step-1-only vision is rejected too (picture is part of the gate).
    const p = await createTestUser("vision-fns-picture");
    try {
      await rpc(p, "save_vision_picture", { p_picture: "Only the picture" });
      const theirs = await seedItems(p);
      await expectRpcError(p, "start_sprint", moneySprintArgs({ ...theirs, p_area: "health", p_tz: TZ, p_start_date: today }), "vision_incomplete");
    } finally {
      await deleteTestUser(p);
    }
  });

  it("set_vision_obstacle rejects an Area-scoped pick, an archived pick and a stranger's; a global pick is renamed to WHEN and gets the rule", async () => {
    const before = (await activeVision())!.obstacle_id;
    const scoped = await insertImpediment(u, "Wealth-only", { scope: "wealth" });
    await expectRpcError(u, "set_vision_obstacle", { p_impediment_id: scoped, ...RULE }, "obstacle_not_global");
    const archived = await insertImpediment(u, "Old one");
    await sql`update public.impediments set archived_at = now() where id = ${archived}`;
    await expectRpcError(u, "set_vision_obstacle", { p_impediment_id: archived, ...RULE }, "item_archived");
    const other = await createTestUser("vision-fns-other");
    try {
      const theirs = await insertImpediment(other, "Theirs");
      await expectRpcError(u, "set_vision_obstacle", { p_impediment_id: theirs, ...RULE }, "item_not_found");
    } finally {
      await deleteTestUser(other);
    }
    expect((await activeVision())!.obstacle_id).toBe(before);
    for (const id of [scoped, archived]) {
      const [row] = await sql<{ proof_then: string | null }[]>`select proof_then from public.impediments where id = ${id}`;
      expect(row.proof_then).toBeNull();
    }

    const [{ id: phone }] = await sql<{ id: string }[]>`select id from public.impediments where user_id = ${u.id} and name = 'Phone distraction'`;
    expect(await rpc<string>(u, "set_vision_obstacle", { p_impediment_id: phone, p_when: "  I reach for the phone ", p_then: RULE.p_then, p_recover: RULE.p_recover })).toBe(phone);
    const [row] = await sql<{ name: string; proof_then: string; proof_recover: string; scope: string }[]>`select name, proof_then, proof_recover, scope from public.impediments where id = ${phone}`;
    expect(row).toEqual({ name: "I reach for the phone", proof_then: RULE.p_then, proof_recover: RULE.p_recover, scope: "global" });
    expect((await activeVision())!.obstacle_id).toBe(phone);
  });

  it("set_vision_obstacle with no pick creates a global impediment with WHEN as its name and the rule in the same call", async () => {
    const id = await rpc<string>(u, "set_vision_obstacle", { p_impediment_id: null, ...RULE });
    const [imp] = await sql<{ name: string; scope: string; rank: number; proof_then: string; proof_recover: string }[]>`
      select name, scope, rank, proof_then, proof_recover from public.impediments where id = ${id}`;
    expect(imp).toMatchObject({ name: RULE.p_when, scope: "global", proof_then: RULE.p_then, proof_recover: RULE.p_recover });
    expect(imp.rank).toBeGreaterThan(0);
    expect((await activeVision())!.obstacle_id).toBe(id);
  });

  it("set_vision_obstacle is accepted by the F6 trigger when the obstacle is an active sprint's highest (shared row)", async () => {
    const [{ id: highest }] = await sql<{ id: string }[]>`
      select i.id from public.impediments i join public.sprint_impediments m on m.impediment_id = i.id
      where i.user_id = ${u.id} and m.is_highest and m.removed_at is null`;
    await rpc(u, "set_vision_obstacle", { p_impediment_id: highest, p_when: "I stall", p_then: "I start the timer", p_recover: "The timer runs within 10 minutes" });
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

  it("replace_vision archives the active vision; the sprint keeps its vision_id, the obstacle is untouched, start_sprint rejects until all three steps run again", async () => {
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
    await expectRpcError(u, "save_vision_goal", GOAL, "no_active_vision");
    await expectRpcError(u, "set_vision_obstacle", { p_impediment_id: before!.obstacle_id, ...RULE }, "no_active_vision");
    const narrowed = await rpc<{ ok: boolean }>(u, "set_item_scope", { p_kind: "impediment", p_item_id: before!.obstacle_id!, p_scope: "wealth" });
    expect(typeof narrowed.ok).toBe("boolean"); // the sprint rules answer now, not vision_obstacle

    const items = await seedItems(u);
    const args = moneySprintArgs({ ...items, p_area: "wealth", p_tz: TZ, p_start_date: today });
    await expectRpcError(u, "start_sprint", args, "no_active_vision");
    const fresh = await rpc<string>(u, "save_vision_picture", { p_picture: "A new direction" });
    expect(fresh).not.toBe(before!.id);
    expect((await activeVision())!.obstacle_id).toBeNull();
    await expectRpcError(u, "start_sprint", args, "vision_incomplete");
    await rpc(u, "save_vision_goal", { ...GOAL, p_body: "A signed lease", p_proof: "The lease" });
    await expectRpcError(u, "start_sprint", args, "vision_incomplete");
    await rpc(u, "set_vision_obstacle", { p_impediment_id: null, ...RULE });
    const started = await startSprint(u, args);
    const [row] = await sql<{ vision_id: string }[]>`select vision_id from public.sprints where id = ${started}`;
    expect(row.vision_id).toBe(fresh);
  });

  it("visions_body_check admits a null body and refuses a blank one; cues keep their explanation, impediments have none", async () => {
    const w = await createTestUser("vision-fns-check");
    try {
      await expect(sql`insert into public.visions (user_id, body) values (${w.id}, '   ')`).rejects.toThrow(/visions_body_check/);
      await expect(sql`insert into public.impediments (user_id, name, explanation) values (${w.id}, 'x', 'y')`).rejects.toThrow(/column "explanation" of relation "impediments" does not exist/);
      const cue = await w.client.from("cues").insert({ user_id: w.id, name: "Cue", explanation: "  why it matters  " }).select("id, explanation").single();
      expect(cue.error).toBeNull();
      expect(cue.data!.explanation).toBe("why it matters");
      const edited = await w.client.from("cues").update({ explanation: "  edited  " }).eq("id", cue.data!.id).select("explanation").single();
      expect(edited.data!.explanation).toBe("edited");
      const imp = await w.client.from("impediments").insert({ user_id: w.id, name: "Imp", explanation: "gone" } as never).select("id");
      expect(imp.error?.message).toMatch(/explanation/);
    } finally {
      await deleteTestUser(w);
    }
  });

  it("start_sprint (0020 body) carries the vision_incomplete gate and no area lookup", async () => {
    const [row] = await sql<{ src: string }[]>`select prosrc as src from pg_proc where proname = 'start_sprint' and pronamespace = 'public'::regnamespace`;
    expect(row.src).toContain("vision_incomplete");
    expect(row.src).toContain("where v.user_id = v_uid and v.archived_at is null;");
    expect(row.src).not.toContain("area = p_area and archived_at");
  });
});
