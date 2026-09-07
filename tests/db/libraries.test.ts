import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { zoneOffUtcDate } from "../support/zones";
import {
  createTestUser,
  dbTodayIn,
  deleteTestUser,
  expectRpcError,
  insertCue,
  insertImpediment,
  insertSprintRows,
  insertVision,
  moneySprintArgs,
  rpc,
  seedItems,
  sql,
  startSprint,
  type TestUser,
} from "./helpers";

const TZ = "America/Los_Angeles";
const PROOF = { proofWhen: "I notice myself delaying", proofThen: "I start a 10-minute timer", proofRecover: "The timer is running within 10 minutes" };

afterAll(async () => {
  await sql.end();
});

type ArchiveResult = { ok: boolean; removed_from?: number; failing?: { sprint_id: string; area: string; outcome: string; reason: string }[] };

// ---------------------------------------------------------------------------
// RLS: two-user denial on every F2 table, proven falsifiable by disabling RLS.
// ---------------------------------------------------------------------------
describe("F2 RLS isolation", () => {
  let a: TestUser;
  let b: TestUser;
  let cueId: string;
  let impId: string;
  let sprintId: string;
  let day1: string;

  beforeAll(async () => {
    a = await createTestUser("lib-rls-a");
    b = await createTestUser("lib-rls-b");
    await insertVision(a, "wealth");
    const items = await seedItems(a);
    cueId = items.p_cue_ids[0];
    impId = items.p_impediment_ids[0];
    sprintId = await startSprint(a, moneySprintArgs({ ...items, p_start_date: await dbTodayIn(TZ) }));
    const [d] = await sql<{ id: string }[]>`select id from public.sprint_days where sprint_id = ${sprintId} and day_index = 1`;
    day1 = d.id;
    await rpc(a, "close_day", {
      p_sprint_day_id: day1,
      p_actual: 100,
      p_impediments: [{ item_id: impId, answer: "yes" }],
      p_cues: [{ item_id: cueId, answer: "yes" }],
      p_response: "yes",
      p_recovered: "no",
    });
  });

  afterAll(async () => {
    await deleteTestUser(a);
    await deleteTestUser(b);
  });

  const TABLES = ["cues", "impediments", "sprint_cues", "sprint_impediments", "day_impediment_observations", "day_cue_observations"] as const;

  it("the owner sees one row in every F2 and F7 table", async () => {
    for (const t of TABLES) {
      const res = await a.client.from(t).select("id");
      expect(res.error, t).toBeNull();
      expect(res.data, t).toHaveLength(1);
    }
  });

  it.each(TABLES)("user B selecting %s gets 0 rows", async (t) => {
    const res = await b.client.from(t).select("id");
    expect(res.error).toBeNull();
    expect(res.data).toEqual([]);
  });

  it("the membership count embed reports rule-19 `used` per row under RLS (loadLibrary read it before F6's view)", async () => {
    const mine = await a.client.from("cues").select("id, sprint_cues(count)");
    expect(mine.error).toBeNull();
    expect(mine.data).toEqual([{ id: cueId, sprint_cues: [{ count: 1 }] }]);
    const fresh = await insertCue(a, "Fresh");
    const unused = await a.client.from("cues").select("id, sprint_cues(count)").eq("id", fresh).single();
    expect(unused.error).toBeNull();
    expect(unused.data!.sprint_cues).toEqual([{ count: 0 }]);
    const theirs = await b.client.from("cues").select("id, sprint_cues(count)");
    expect(theirs.error).toBeNull();
    expect(theirs.data).toEqual([]);
  });

  it("user B cannot insert a cue or impediment as A", async () => {
    const c = await b.client.from("cues").insert({ user_id: a.id, name: "forged" }).select("id");
    expect(c.error).not.toBeNull();
    const i = await b.client.from("impediments").insert({ user_id: a.id, name: "forged" }).select("id");
    expect(i.error).not.toBeNull();
  });

  it("user B cannot update, delete or archive A's items (0 rows, not_found)", async () => {
    const u = await b.client.from("cues").update({ name: "hijacked" }).eq("id", cueId).select("id");
    expect(u.error).toBeNull();
    expect(u.data).toEqual([]);
    const d = await b.client.from("impediments").delete().eq("id", impId).select("id");
    expect(d.error).toBeNull();
    expect(d.data).toEqual([]);
    await expectRpcError(b, "archive_item", { p_kind: "cue", p_item_id: cueId }, "item_not_found");
    await expectRpcError(b, "set_item_scope", { p_kind: "impediment", p_item_id: impId, p_scope: "health" }, "item_not_found");
    await expectRpcError(b, "restore_item", { p_kind: "cue", p_item_id: cueId }, "item_not_found");
    await expectRpcError(b, "move_item", { p_kind: "cue", p_item_id: cueId, p_direction: "up" }, "item_not_found");
    await expectRpcError(b, "add_sprint_item", { p_sprint_id: sprintId, p_kind: "cue", p_item_id: cueId }, "sprint_not_found");
    await expectRpcError(b, "remove_sprint_item", { p_sprint_id: sprintId, p_kind: "cue", p_item_id: cueId }, "sprint_not_found");
    await expectRpcError(b, "set_highest_impediment", { p_sprint_id: sprintId, p_impediment_id: impId }, "sprint_not_found");
    const offered = await b.client.rpc("day_offered_items", { p_sprint_day_id: day1 });
    expect(offered.error).toBeNull();
    expect(offered.data).toEqual([]);
    const [row] = await sql<{ name: string }[]>`select name from public.cues where id = ${cueId}`;
    expect(row.name).not.toBe("hijacked");
  });

  it.each(TABLES)("disabling RLS on %s leaks A's rows to B; re-enabling hides them again", async (table) => {
    await sql.unsafe(`alter table public.${table} disable row level security`);
    try {
      const leaked = await b.client.from(table).select("id");
      expect(leaked.error).toBeNull();
      expect(leaked.data!.length).toBeGreaterThan(0);
    } finally {
      await sql.unsafe(`alter table public.${table} enable row level security`);
    }
    const hidden = await b.client.from(table).select("id");
    expect(hidden.error).toBeNull();
    expect(hidden.data).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// start_sprint rules 3–6, each with its own failing input.
// ---------------------------------------------------------------------------
describe("start_sprint with cues and impediments (rules 3–6)", () => {
  let u: TestUser;
  let today: string;
  let cues: string[];
  let imps: string[];

  beforeAll(async () => {
    u = await createTestUser("lib-start");
    today = await dbTodayIn(TZ);
    await insertVision(u, "wealth");
    cues = [];
    imps = [];
    for (let i = 0; i < 4; i++) cues.push(await insertCue(u, `Cue ${i + 1}`));
    for (let i = 0; i < 6; i++) imps.push(await insertImpediment(u, `Impediment ${i + 1}`, PROOF));
  });

  afterAll(async () => {
    await deleteTestUser(u);
  });

  const base = (items: { p_cue_ids: string[]; p_impediment_ids: string[]; p_highest_impediment_id: string }) =>
    moneySprintArgs({ ...items, p_start_date: today });

  it("rejects 0 cues and 4 cues (rule 3)", async () => {
    await expectRpcError(u, "start_sprint", base({ p_cue_ids: [], p_impediment_ids: [imps[0]], p_highest_impediment_id: imps[0] }), "no_cues");
    await expectRpcError(u, "start_sprint", base({ p_cue_ids: cues, p_impediment_ids: [imps[0]], p_highest_impediment_id: imps[0] }), "too_many_cues");
  });

  it("rejects 0 impediments and 6 impediments (rule 4)", async () => {
    await expectRpcError(u, "start_sprint", base({ p_cue_ids: [cues[0]], p_impediment_ids: [], p_highest_impediment_id: imps[0] }), "no_impediments");
    await expectRpcError(u, "start_sprint", base({ p_cue_ids: [cues[0]], p_impediment_ids: imps, p_highest_impediment_id: imps[0] }), "too_many_impediments");
  });

  it("rejects a missing highest impediment, or one outside the selection (rule 5)", async () => {
    await expectRpcError(u, "start_sprint", { ...base({ p_cue_ids: [cues[0]], p_impediment_ids: [imps[0]], p_highest_impediment_id: imps[0] }), p_highest_impediment_id: null }, "no_highest_impediment");
    await expectRpcError(u, "start_sprint", base({ p_cue_ids: [cues[0]], p_impediment_ids: [imps[0]], p_highest_impediment_id: imps[1] }), "no_highest_impediment");
  });

  it("rejects a highest impediment whose proof is blank after trim (rule 6)", async () => {
    const blank = await insertImpediment(u, "No proof yet", { proofWhen: "   ", proofThen: "" });
    const [row] = await sql<{ proof_when: string | null; proof_then: string | null }[]>`select proof_when, proof_then from public.impediments where id = ${blank}`;
    expect(row).toEqual({ proof_when: null, proof_then: null });
    await expectRpcError(u, "start_sprint", base({ p_cue_ids: [cues[0]], p_impediment_ids: [blank], p_highest_impediment_id: blank }), "proof_point_required");
    // WHEN only is still incomplete.
    await expectRpcError(
      u,
      "start_sprint",
      { ...base({ p_cue_ids: [cues[0]], p_impediment_ids: [blank], p_highest_impediment_id: blank }), p_proof_when: "I notice", p_proof_then: "  " },
      "proof_point_required",
    );
  });

  it("rejects archived, out-of-scope and foreign items", async () => {
    const archived = await insertCue(u, "Old cue");
    await rpc(u, "archive_item", { p_kind: "cue", p_item_id: archived });
    await expectRpcError(u, "start_sprint", base({ p_cue_ids: [archived], p_impediment_ids: [imps[0]], p_highest_impediment_id: imps[0] }), "item_archived");

    const health = await insertCue(u, "Health-only cue", "health");
    await expectRpcError(u, "start_sprint", base({ p_cue_ids: [health], p_impediment_ids: [imps[0]], p_highest_impediment_id: imps[0] }), "item_out_of_scope");

    const other = await createTestUser("lib-start-other");
    try {
      const foreign = await insertCue(other, "Not yours");
      await expectRpcError(u, "start_sprint", base({ p_cue_ids: [foreign], p_impediment_ids: [imps[0]], p_highest_impediment_id: imps[0] }), "item_not_found");
    } finally {
      await deleteTestUser(other);
    }
  });

  it("starts with 3 cues and 5 impediments, records memberships, one highest, and saves an inline proof", async () => {
    const blank = await insertImpediment(u, "Proof written at setup");
    const chosen = [blank, imps[1], imps[2], imps[3], imps[4]];
    const id = await startSprint(u, {
      ...base({ p_cue_ids: cues.slice(0, 3), p_impediment_ids: chosen, p_highest_impediment_id: blank }),
      p_proof_when: "  I open social media  ",
      p_proof_then: "I close the tab and write one sentence",
      p_proof_recover: "The sentence exists within five minutes",
    });
    const sc = await u.client.from("sprint_cues").select("cue_id, removed_at").eq("sprint_id", id);
    expect(sc.data!.map((r) => r.cue_id).sort()).toEqual(cues.slice(0, 3).sort());
    expect(sc.data!.every((r) => r.removed_at === null)).toBe(true);
    const si = await u.client.from("sprint_impediments").select("impediment_id, is_highest, removed_at").eq("sprint_id", id);
    expect(si.data).toHaveLength(5);
    expect(si.data!.filter((r) => r.is_highest).map((r) => r.impediment_id)).toEqual([blank]);
    const [proof] = await sql<{ proof_when: string; proof_then: string }[]>`select proof_when, proof_then from public.impediments where id = ${blank}`;
    expect(proof).toEqual({ proof_when: "I open social media", proof_then: "I close the tab and write one sentence" });
  });
});

// ---------------------------------------------------------------------------
// Library rules 19–24 and membership edits during a sprint.
// ---------------------------------------------------------------------------
describe("library rules and sprint membership", () => {
  let u: TestUser;
  let today: string;
  let cueA: string;
  let cueB: string;
  let impHighest: string;
  let impOther: string;
  let sprintId: string;

  beforeAll(async () => {
    u = await createTestUser("lib-rules");
    today = await dbTodayIn(TZ);
    await insertVision(u, "wealth");
    cueA = await insertCue(u, "Cue A", "global", "  why it matters  ");
    cueB = await insertCue(u, "Cue B");
    impHighest = await insertImpediment(u, "Highest", PROOF);
    impOther = await insertImpediment(u, "Other", { proofWhen: "when", proofThen: "then", proofRecover: "recovered" });
    sprintId = await startSprint(
      u,
      moneySprintArgs({ p_cue_ids: [cueA], p_impediment_ids: [impHighest, impOther], p_highest_impediment_id: impHighest, p_start_date: today }),
    );
  });

  afterAll(async () => {
    await deleteTestUser(u);
  });

  it("insert appends at the end of the owner's library and trims explanation", async () => {
    const rows = await u.client.from("cues").select("name, rank, explanation").order("rank");
    expect(rows.data!.map((r) => [r.name, r.rank])).toEqual([
      ["Cue A", 1],
      ["Cue B", 2],
    ]);
    expect(rows.data![0].explanation).toBe("why it matters");
  });

  it("rule 22: the highest impediment's proof may be edited but not cleared", async () => {
    const edit = await u.client.from("impediments").update({ proof_then: "I start a 5-minute timer" }).eq("id", impHighest).select("proof_then").single();
    expect(edit.error).toBeNull();
    expect(edit.data!.proof_then).toBe("I start a 5-minute timer");

    const clear = await u.client.from("impediments").update({ proof_when: "   " }).eq("id", impHighest);
    expect(clear.error).not.toBeNull();
    expect(clear.error!.message).toMatch(/proof_point_required/);
    const [row] = await sql<{ proof_when: string }[]>`select proof_when from public.impediments where id = ${impHighest}`;
    expect(row.proof_when).toBe(PROOF.proofWhen);

    // A non-highest impediment can clear its proof freely.
    const other = await u.client.from("impediments").update({ proof_when: "" }).eq("id", impOther).select("proof_when").single();
    expect(other.error).toBeNull();
    expect(other.data!.proof_when).toBeNull();
    await u.client.from("impediments").update({ proof_when: "when" }).eq("id", impOther);
  });

  it("archive_item blocks when a sprint would lose its only cue, changing nothing", async () => {
    const res = await rpc<ArchiveResult>(u, "archive_item", { p_kind: "cue", p_item_id: cueA });
    expect(res.ok).toBe(false);
    expect(res.failing).toHaveLength(1);
    expect(res.failing![0]).toMatchObject({ sprint_id: sprintId, area: "wealth", reason: "no_cues" });
    const [cue] = await sql<{ archived_at: Date | null }[]>`select archived_at from public.cues where id = ${cueA}`;
    expect(cue.archived_at).toBeNull();
    const [m] = await sql<{ removed_at: Date | null }[]>`select removed_at from public.sprint_cues where sprint_id = ${sprintId} and cue_id = ${cueA}`;
    expect(m.removed_at).toBeNull();
  });

  it("archive_item blocks when the item is the highest impediment", async () => {
    const res = await rpc<ArchiveResult>(u, "archive_item", { p_kind: "impediment", p_item_id: impHighest });
    expect(res.ok).toBe(false);
    expect(res.failing![0].reason).toBe("no_highest_impediment");
  });

  it("add_sprint_item enforces the caps, scope, archive state and duplicates", async () => {
    await expectRpcError(u, "add_sprint_item", { p_sprint_id: sprintId, p_kind: "cue", p_item_id: cueA }, "already_in_sprint");
    const health = await insertCue(u, "Health cue", "health");
    await expectRpcError(u, "add_sprint_item", { p_sprint_id: sprintId, p_kind: "cue", p_item_id: health }, "item_out_of_scope");
    const archived = await insertCue(u, "Archived cue");
    await rpc(u, "archive_item", { p_kind: "cue", p_item_id: archived });
    await expectRpcError(u, "add_sprint_item", { p_sprint_id: sprintId, p_kind: "cue", p_item_id: archived }, "item_archived");

    await rpc(u, "add_sprint_item", { p_sprint_id: sprintId, p_kind: "cue", p_item_id: cueB });
    const cueC = await insertCue(u, "Cue C");
    await rpc(u, "add_sprint_item", { p_sprint_id: sprintId, p_kind: "cue", p_item_id: cueC });
    const cueD = await insertCue(u, "Cue D");
    await expectRpcError(u, "add_sprint_item", { p_sprint_id: sprintId, p_kind: "cue", p_item_id: cueD }, "too_many_cues");

    for (let i = 0; i < 3; i++) {
      const imp = await insertImpediment(u, `Extra ${i}`);
      await rpc(u, "add_sprint_item", { p_sprint_id: sprintId, p_kind: "impediment", p_item_id: imp });
    }
    const sixth = await insertImpediment(u, "Sixth");
    await expectRpcError(u, "add_sprint_item", { p_sprint_id: sprintId, p_kind: "impediment", p_item_id: sixth }, "too_many_impediments");

    // Back to the shape the next tests expect: cues A + B, impediments highest + other.
    await rpc(u, "remove_sprint_item", { p_sprint_id: sprintId, p_kind: "cue", p_item_id: cueC });
    const extras = await sql<{ impediment_id: string }[]>`
      select impediment_id from public.sprint_impediments where sprint_id = ${sprintId} and removed_at is null
        and impediment_id not in (${impHighest}, ${impOther})`;
    for (const e of extras) await rpc(u, "remove_sprint_item", { p_sprint_id: sprintId, p_kind: "impediment", p_item_id: e.impediment_id });
  });

  it("archive_item removes the item from every affected sprint and archives it, atomically", async () => {
    // F7: cue A has been the focus since the start; the focus cannot be archived, so move it first.
    expect((await rpc<ArchiveResult>(u, "archive_item", { p_kind: "cue", p_item_id: cueA })).failing![0].reason).toBe("no_focus_cue");
    await rpc(u, "set_focus_cue", { p_sprint_id: sprintId, p_cue_id: cueB });
    const res = await rpc<ArchiveResult>(u, "archive_item", { p_kind: "cue", p_item_id: cueA });
    expect(res).toEqual({ ok: true, removed_from: 1 });
    const [cue] = await sql<{ archived_at: Date | null }[]>`select archived_at from public.cues where id = ${cueA}`;
    expect(cue.archived_at).not.toBeNull();
    const [m] = await sql<{ removed_at: Date | null }[]>`select removed_at from public.sprint_cues where sprint_id = ${sprintId} and cue_id = ${cueA}`;
    expect(m.removed_at).not.toBeNull();
    // Archiving an unused item touches no sprint.
    const unused = await insertCue(u, "Unused");
    expect(await rpc<ArchiveResult>(u, "archive_item", { p_kind: "cue", p_item_id: unused })).toEqual({ ok: true, removed_from: 0 });
  });

  it("rule 21: restore returns the item to the library and creates no membership", async () => {
    await rpc(u, "restore_item", { p_kind: "cue", p_item_id: cueA });
    const [cue] = await sql<{ archived_at: Date | null }[]>`select archived_at from public.cues where id = ${cueA}`;
    expect(cue.archived_at).toBeNull();
    const rows = await sql<{ removed_at: Date | null }[]>`select removed_at from public.sprint_cues where cue_id = ${cueA}`;
    expect(rows).toHaveLength(1);
    expect(rows[0].removed_at).not.toBeNull();
  });

  it("rule 24: the SELECT policy returns archived rows so the UI can show them collapsed; lists filter on archived_at", async () => {
    const all = await u.client.from("cues").select("name, archived_at").order("rank");
    expect(all.data!.some((r) => r.archived_at !== null)).toBe(true);
    const active = await u.client.from("cues").select("name").is("archived_at", null).order("rank");
    expect(active.data!.map((r) => r.name)).not.toContain("Archived cue");
  });

  it("set_item_scope: widening never affects sprints; narrowing removes or blocks (rule 20)", async () => {
    // cueB is the sprint's only active cue now → narrowing to health would break rule 3.
    const blocked = await rpc<ArchiveResult>(u, "set_item_scope", { p_kind: "cue", p_item_id: cueB, p_scope: "health" });
    expect(blocked.ok).toBe(false);
    expect(blocked.failing![0].reason).toBe("no_cues");
    const [still] = await sql<{ scope: string }[]>`select scope from public.cues where id = ${cueB}`;
    expect(still.scope).toBe("global");

    // Narrowing to the sprint's own area keeps the membership.
    expect(await rpc<ArchiveResult>(u, "set_item_scope", { p_kind: "cue", p_item_id: cueB, p_scope: "wealth" })).toEqual({ ok: true, removed_from: 0 });
    // Widening back to global: nothing affected.
    expect(await rpc<ArchiveResult>(u, "set_item_scope", { p_kind: "cue", p_item_id: cueB, p_scope: "global" })).toEqual({ ok: true, removed_from: 0 });

    // With a second cue in the sprint, narrowing removes cueB from it atomically — once
    // the focus (F7) has moved off it; the focus cue is refused with no_focus_cue.
    await rpc(u, "add_sprint_item", { p_sprint_id: sprintId, p_kind: "cue", p_item_id: cueA });
    expect((await rpc<ArchiveResult>(u, "set_item_scope", { p_kind: "cue", p_item_id: cueB, p_scope: "health" })).failing![0].reason).toBe("no_focus_cue");
    await rpc(u, "set_focus_cue", { p_sprint_id: sprintId, p_cue_id: cueA });
    expect(await rpc<ArchiveResult>(u, "set_item_scope", { p_kind: "cue", p_item_id: cueB, p_scope: "health" })).toEqual({ ok: true, removed_from: 1 });
    const [b] = await sql<{ scope: string }[]>`select scope from public.cues where id = ${cueB}`;
    expect(b.scope).toBe("health");
    const [m] = await sql<{ removed_at: Date | null }[]>`select removed_at from public.sprint_cues where sprint_id = ${sprintId} and cue_id = ${cueB} and removed_at is not null`;
    expect(m.removed_at).not.toBeNull();
    await expectRpcError(u, "set_item_scope", { p_kind: "cue", p_item_id: cueB, p_scope: "work" }, "invalid_scope");
  });

  it("remove_sprint_item refuses to break rules 3 and 5", async () => {
    await expectRpcError(u, "remove_sprint_item", { p_sprint_id: sprintId, p_kind: "cue", p_item_id: cueA }, "no_cues");
    await expectRpcError(u, "remove_sprint_item", { p_sprint_id: sprintId, p_kind: "impediment", p_item_id: impHighest }, "no_highest_impediment");
    await expectRpcError(u, "remove_sprint_item", { p_sprint_id: sprintId, p_kind: "cue", p_item_id: cueB }, "not_in_sprint");
  });

  it("rule 19: delete succeeds only for an item with no sprint history", async () => {
    const fresh = await insertCue(u, "Never used");
    const ok = await u.client.from("cues").delete().eq("id", fresh).select("id");
    expect(ok.error).toBeNull();
    expect(ok.data).toHaveLength(1);

    const used = await u.client.from("cues").delete().eq("id", cueA).select("id");
    expect(used.error).toBeNull();
    expect(used.data).toEqual([]);
    const [row] = await sql<{ id: string }[]>`select id from public.cues where id = ${cueA}`;
    expect(row.id).toBe(cueA);
    // Belt and braces: even the postgres role cannot delete a used item (FK).
    await expect(sql`delete from public.cues where id = ${cueA}`).rejects.toThrow(/violates foreign key/);
  });

  it("set_highest_impediment flips the flag without touching any sprint_days row", async () => {
    const checksum = async () => {
      const [r] = await sql<{ h: string }[]>`select md5(string_agg(t::text, '|' order by day_index)) as h from public.sprint_days t where sprint_id = ${sprintId}`;
      return r.h;
    };
    const before = await checksum();
    await rpc(u, "set_highest_impediment", { p_sprint_id: sprintId, p_impediment_id: impOther });
    const rows = await sql<{ impediment_id: string; is_highest: boolean }[]>`
      select impediment_id, is_highest from public.sprint_impediments where sprint_id = ${sprintId} and removed_at is null`;
    expect(rows.filter((r) => r.is_highest).map((r) => r.impediment_id)).toEqual([impOther]);
    expect(await checksum()).toBe(before);

    // Now the old highest can be removed, and a proof-less impediment cannot become highest.
    await rpc(u, "remove_sprint_item", { p_sprint_id: sprintId, p_kind: "impediment", p_item_id: impHighest });
    const noProof = await insertImpediment(u, "No proof");
    await rpc(u, "add_sprint_item", { p_sprint_id: sprintId, p_kind: "impediment", p_item_id: noProof });
    await expectRpcError(u, "set_highest_impediment", { p_sprint_id: sprintId, p_impediment_id: noProof }, "proof_point_required");
    await expectRpcError(u, "set_highest_impediment", { p_sprint_id: sprintId, p_impediment_id: impHighest }, "not_in_sprint");
  });

  it("set_highest_impediment writes the proof it is given in the same transaction; a rejected call writes nothing (0008)", async () => {
    const [np] = await sql<{ id: string }[]>`select id from public.impediments where user_id = ${u.id} and name = 'No proof'`;
    await rpc(u, "set_highest_impediment", { p_sprint_id: sprintId, p_impediment_id: np.id, p_proof_when: "  I stall  ", p_proof_then: "I start", p_proof_recover: "I am typing" });
    const [written] = await sql<{ proof_when: string; proof_then: string; proof_recover: string }[]>`select proof_when, proof_then, proof_recover from public.impediments where id = ${np.id}`;
    expect(written).toEqual({ proof_when: "I stall", proof_then: "I start", proof_recover: "I am typing" });
    const flags = await sql<{ impediment_id: string }[]>`
      select impediment_id from public.sprint_impediments where sprint_id = ${sprintId} and removed_at is null and is_highest`;
    expect(flags.map((r) => r.impediment_id)).toEqual([np.id]);

    // impHighest was removed from the sprint: the designation is rejected and its proof is untouched.
    const [before] = await sql<{ proof_when: string; proof_then: string }[]>`select proof_when, proof_then from public.impediments where id = ${impHighest}`;
    await expectRpcError(u, "set_highest_impediment", { p_sprint_id: sprintId, p_impediment_id: impHighest, p_proof_when: "changed", p_proof_then: "changed" }, "not_in_sprint");
    const [after] = await sql<{ proof_when: string; proof_then: string }[]>`select proof_when, proof_then from public.impediments where id = ${impHighest}`;
    expect(after).toEqual(before);

    // A blank part is "not given" (F6 coalesce): the row keeps that column. A part the
    // row still lacks is still missing, so the call is rejected and writes nothing.
    const partial = await insertImpediment(u, "Partial proof", { proofWhen: "when" });
    await rpc(u, "add_sprint_item", { p_sprint_id: sprintId, p_kind: "impediment", p_item_id: partial });
    await expectRpcError(u, "set_highest_impediment", { p_sprint_id: sprintId, p_impediment_id: partial, p_proof_when: "   ", p_proof_then: "x" }, "proof_point_required");
    const [kept] = await sql<{ proof_when: string; proof_then: string | null; proof_recover: string | null }[]>`select proof_when, proof_then, proof_recover from public.impediments where id = ${partial}`;
    expect(kept).toEqual({ proof_when: "when", proof_then: null, proof_recover: null });
  });

  it("sprint_invalid_reason with the default arguments judges the whole sprint (0008 null-safety)", async () => {
    // Before 0008 the NULL exclusion arguments made every membership row NOT match, so a
    // valid sprint read as `no_cues`.
    const [r] = await sql<{ reason: string | null }[]>`select public.sprint_invalid_reason(${sprintId}) as reason`;
    expect(r.reason).toBeNull();
    const [c] = await sql<{ n: number }[]>`select count(*)::int as n from public.sprint_cues where sprint_id = ${sprintId} and removed_at is null`;
    expect(c.n).toBeGreaterThan(0);
  });

  it("at most one highest per sprint, even for the postgres role", async () => {
    await expect(
      sql`update public.sprint_impediments set is_highest = true where sprint_id = ${sprintId} and removed_at is null and not is_highest`,
    ).rejects.toThrow(/sprint_impediments_one_highest/);
  });

  it("move_item swaps with the neighbouring active item and is a no-op at the ends", async () => {
    const order = async () => (await u.client.from("cues").select("name").is("archived_at", null).order("rank").order("created_at")).data!.map((r) => r.name);
    const start = await order();
    expect(start[0]).toBe("Cue A");
    await rpc(u, "move_item", { p_kind: "cue", p_item_id: cueA, p_direction: "up" });
    expect(await order()).toEqual(start);
    await rpc(u, "move_item", { p_kind: "cue", p_item_id: cueA, p_direction: "down" });
    const moved = await order();
    expect(moved[1]).toBe("Cue A");
    expect(moved[0]).toBe(start[1]);
    await rpc(u, "move_item", { p_kind: "cue", p_item_id: cueA, p_direction: "up" });
    expect(await order()).toEqual(start);
  });

  it("authenticated cannot write scope, rank or archived_at directly", async () => {
    for (const patch of [{ scope: "health" }, { rank: 99 }, { archived_at: new Date().toISOString() }]) {
      const res = await u.client.from("cues").update(patch).eq("id", cueA);
      expect(res.error, JSON.stringify(patch)).not.toBeNull();
      expect(res.error!.code).toBe("42501");
    }
  });
});

// ---------------------------------------------------------------------------
// Day Close (F7): offered items (rule 23, in the sprint's zone), observations, the
// Highest's answers, snapshots, immutability.
// ---------------------------------------------------------------------------
describe("close_day with day observations (F7)", () => {
  // A zone whose calendar date differs from UTC's right now (tests/support/zones), so a
  // UTC-based ::date in day_offered_items would put memberships on the wrong day.
  const KTZ = zoneOffUtcDate();
  let u: TestUser;
  let today: string;
  let cueA: string;
  let cueRemoved: string;
  let impHighest: string;
  let impRemoved: string;
  let sprintId: string;
  let day1: string;
  let day2: string;

  beforeAll(async () => {
    u = await createTestUser("lib-close");
    today = await dbTodayIn(KTZ);
    await insertVision(u, "health");
    cueA = await insertCue(u, "Cue A");
    cueRemoved = await insertCue(u, "Cue removed today");
    impHighest = await insertImpediment(u, "Highest", PROOF);
    impRemoved = await insertImpediment(u, "Removed today");
    await u.client.from("cues").update({ cue_when: "I open the calendar" }).eq("id", cueA);
    sprintId = await startSprint(
      u,
      moneySprintArgs({
        p_area: "health",
        p_tz: KTZ,
        p_cue_ids: [cueA, cueRemoved],
        p_focus_cue_id: cueA,
        p_impediment_ids: [impHighest, impRemoved],
        p_highest_impediment_id: impHighest,
        p_start_date: today,
        p_amount: 1400,
      }),
    );
    const days = await sql<{ id: string; day_index: number }[]>`select id, day_index from public.sprint_days where sprint_id = ${sprintId} order by day_index`;
    day1 = days[0].id;
    day2 = days[1].id;
    // Removed on day 1 itself: still offered for day 1 (rule 23).
    await rpc(u, "remove_sprint_item", { p_sprint_id: sprintId, p_kind: "cue", p_item_id: cueRemoved });
    await rpc(u, "remove_sprint_item", { p_sprint_id: sprintId, p_kind: "impediment", p_item_id: impRemoved });
  });

  afterAll(async () => {
    await deleteTestUser(u);
  });

  type Offered = { kind: string; item_id: string; name: string; cue_when: string | null; proof_recover: string | null; is_focus: boolean };

  it("offers the items whose membership overlapped the day, later removal notwithstanding, with the F6 columns and the focus flag", async () => {
    const res = await u.client.rpc("day_offered_items", { p_sprint_day_id: day1 });
    expect(res.error).toBeNull();
    const rows = res.data as Offered[];
    const ids = rows.map((r) => `${r.kind}:${r.item_id}`).sort();
    expect(ids).toEqual([`cue:${cueA}`, `cue:${cueRemoved}`, `impediment:${impHighest}`, `impediment:${impRemoved}`].sort());
    expect(rows.find((r) => r.item_id === cueA)).toMatchObject({ cue_when: "I open the calendar", is_focus: true, proof_recover: null });
    expect(rows.find((r) => r.item_id === cueRemoved)).toMatchObject({ is_focus: false });
    expect(rows.find((r) => r.item_id === impHighest)).toMatchObject({ proof_recover: PROOF.proofRecover, is_focus: false, cue_when: null });
  });

  it("membership boundaries are evaluated at midnight in the sprint's zone (table test)", async () => {
    // Day 2's date D; membership timestamps are written as wall-clock times in KTZ and
    // converted in SQL. The ::text cast matters: a parameter Postgres infers as
    // `timestamp` is serialised by the driver through new Date(), i.e. in the machine's
    // local zone, which shifted every boundary by the local UTC offset.
    const [d] = await sql<{ date: string; plus: string; minus: string }[]>`
      select to_char(date, 'YYYY-MM-DD') as date, to_char(date + 1, 'YYYY-MM-DD') as plus, to_char(date - 1, 'YYYY-MM-DD') as minus
      from public.sprint_days where id = ${day2}`;
    const probe = await insertCue(u, "Boundary probe");
    const cases: { added: string; removed: string | null; offered: boolean }[] = [
      { added: `${d.date} 00:00:00`, removed: null, offered: true },
      { added: `${d.date} 23:59:59`, removed: null, offered: true },
      { added: `${d.minus} 12:00:00`, removed: `${d.date} 00:00:00`, offered: true },
      { added: `${d.minus} 12:00:00`, removed: `${d.date} 23:59:59`, offered: true },
      { added: `${d.plus} 00:00:00`, removed: null, offered: false },
      { added: `${d.minus} 00:00:00`, removed: `${d.minus} 23:59:59`, offered: false },
    ];
    for (const c of cases) {
      await sql`delete from public.sprint_cues where cue_id = ${probe}`;
      await sql`
        insert into public.sprint_cues (sprint_id, user_id, cue_id, added_at, removed_at)
        values (${sprintId}, ${u.id}, ${probe},
                (${c.added}::text)::timestamp at time zone ${KTZ},
                case when ${c.removed}::text is null then null else (${c.removed}::text)::timestamp at time zone ${KTZ} end)`;
      const res = await u.client.rpc("day_offered_items", { p_sprint_day_id: day2 });
      expect(res.error).toBeNull();
      const offered = (res.data as { item_id: string }[]).some((r) => r.item_id === probe);
      expect(offered, `added ${c.added}, removed ${c.removed ?? "never"} (${KTZ})`).toBe(c.offered);
    }
    await sql`delete from public.sprint_cues where cue_id = ${probe}`;
  });

  const yes = (item_id: string) => ({ item_id, answer: "yes" });
  const no = (item_id: string) => ({ item_id, answer: "no" });

  it("rejects answers off the scale, duplicates, non-arrays, and items this day never offered", async () => {
    const stranger = await insertImpediment(u, "Never in sprint");
    const strangerCue = await insertCue(u, "Never in sprint");
    const base = { p_sprint_day_id: day1, p_actual: 100 };
    await expectRpcError(u, "close_day", { ...base, p_impediments: [{ item_id: impHighest, answer: "maybe" }] }, "invalid_answer");
    await expectRpcError(u, "close_day", { ...base, p_cues: [{ item_id: cueA }] }, "invalid_answer");
    await expectRpcError(u, "close_day", { ...base, p_cues: { item_id: cueA, answer: "yes" } }, "invalid_answer");
    await expectRpcError(u, "close_day", { ...base, p_impediments: [yes(impHighest), no(impHighest)] }, "duplicate_item");
    await expectRpcError(u, "close_day", { ...base, p_cues: [yes(cueA), yes(cueA)] }, "duplicate_item");
    await expectRpcError(u, "close_day", { ...base, p_impediments: [yes(stranger)] }, "item_not_offered");
    await expectRpcError(u, "close_day", { ...base, p_cues: [yes(strangerCue)] }, "item_not_offered");
    const [row] = await sql<{ closed_at: Date | null }[]>`select closed_at from public.sprint_days where id = ${day1}`;
    expect(row.closed_at).toBeNull();
    const [n] = await sql<{ n: number }[]>`select count(*)::int as n from public.day_impediment_observations where sprint_day_id = ${day1}`;
    expect(n.n).toBe(0);
  });

  it("requires the response and the recovery exactly when the highest occurred, and refuses them otherwise", async () => {
    const base = { p_sprint_day_id: day1, p_actual: 100, p_impediments: [yes(impHighest)] };
    await expectRpcError(u, "close_day", base, "response_required");
    await expectRpcError(u, "close_day", { ...base, p_response: "yes" }, "recovered_required");
    await expectRpcError(u, "close_day", { ...base, p_response: "sometimes", p_recovered: "yes" }, "invalid_answer");
    await expectRpcError(u, "close_day", { ...base, p_response: "yes", p_recovered: "partially" }, "invalid_answer");
    await expectRpcError(u, "close_day", { ...base, p_response: "yes", p_recovered: "yes", p_impact: "huge" }, "invalid_answer");
    // Not occurred, unsure, or never answered: the three questions do not apply.
    await expectRpcError(u, "close_day", { ...base, p_impediments: [no(impHighest)], p_response: "yes", p_recovered: "yes" }, "response_not_applicable");
    await expectRpcError(u, "close_day", { ...base, p_impediments: [{ item_id: impHighest, answer: "unsure" }], p_recovered: "yes" }, "response_not_applicable");
    await expectRpcError(u, "close_day", { ...base, p_impediments: [], p_impact: "some" }, "response_not_applicable");
    const [row] = await sql<{ closed_at: Date | null }[]>`select closed_at from public.sprint_days where id = ${day1}`;
    expect(row.closed_at).toBeNull();
  });

  it("closes with one row per offered item, `unanswered` for the untouched group, and snapshots that survive later edits", async () => {
    await rpc(u, "close_day", {
      p_sprint_day_id: day1,
      p_actual: 100,
      p_notes: "ok",
      p_impediments: [yes(impHighest)],
      p_response: "partially",
      p_recovered: "no",
      p_impact: "some",
    });
    const imps = await u.client.from("day_impediment_observations").select("impediment_id, name, occurred, was_highest").eq("sprint_day_id", day1).order("name");
    expect(imps.error).toBeNull();
    expect(imps.data).toEqual([
      { impediment_id: impHighest, name: "Highest", occurred: "yes", was_highest: true },
      { impediment_id: impRemoved, name: "Removed today", occurred: "unanswered", was_highest: false },
    ]);
    const cues = await u.client.from("day_cue_observations").select("cue_id, name, cue_when, used, was_focus").eq("sprint_day_id", day1).order("name");
    expect(cues.error).toBeNull();
    expect(cues.data).toEqual([
      { cue_id: cueA, name: "Cue A", cue_when: "I open the calendar", used: "unanswered", was_focus: true },
      { cue_id: cueRemoved, name: "Cue removed today", cue_when: null, used: "unanswered", was_focus: false },
    ]);

    const snapshot = () => sql<{ highest_impediment_id: string; proof_when: string; proof_then: string; proof_recover: string; response: string; recovered: string; impact: string }[]>`
      select highest_impediment_id, proof_when, proof_then, proof_recover, response, recovered, impact from public.sprint_days where id = ${day1}`;
    const expected = {
      highest_impediment_id: impHighest,
      proof_when: PROOF.proofWhen,
      proof_then: PROOF.proofThen,
      proof_recover: PROOF.proofRecover,
      response: "partially",
      recovered: "no",
      impact: "some",
    };
    expect((await snapshot())[0]).toEqual(expected);

    // Later library edits reach neither the day row nor the observation rows.
    await u.client.from("impediments").update({ proof_when: "Edited after the close", proof_recover: "Edited too", name: "Renamed" }).eq("id", impHighest);
    await u.client.from("cues").update({ name: "Cue A renamed", cue_when: "edited" }).eq("id", cueA);
    expect((await snapshot())[0]).toEqual(expected);
    const [imp] = await sql<{ name: string }[]>`select name from public.day_impediment_observations where sprint_day_id = ${day1} and impediment_id = ${impHighest}`;
    expect(imp.name).toBe("Highest");
    const [cue] = await sql<{ name: string; cue_when: string }[]>`select name, cue_when from public.day_cue_observations where sprint_day_id = ${day1} and cue_id = ${cueA}`;
    expect(cue).toEqual({ name: "Cue A", cue_when: "I open the calendar" });
  });

  it("a closed day's observations and answers are immutable; the API role cannot write the tables", async () => {
    await expect(sql`update public.day_impediment_observations set occurred = 'no' where sprint_day_id = ${day1}`).rejects.toThrow(/day_closed/);
    await expect(sql`update public.day_cue_observations set used = 'yes' where sprint_day_id = ${day1}`).rejects.toThrow(/day_closed/);
    for (const [column, value] of [
      ["proof_recover", "'x'"],
      ["response", "'yes'"],
      ["recovered", "'yes'"],
      ["impact", "'a_lot'"],
    ]) {
      await expect(sql.unsafe(`update public.sprint_days set ${column} = ${value} where id = '${day1}'`), column).rejects.toThrow(/day_closed/);
    }
    const ins = await u.client.from("day_cue_observations").insert({ sprint_day_id: day1, user_id: u.id, cue_id: cueA, name: "x", used: "yes" });
    expect(ins.error!.code).toBe("42501");
    const upd = await u.client.from("day_impediment_observations").update({ occurred: "no" }).eq("sprint_day_id", day1);
    expect(upd.error!.code).toBe("42501");
    const del = await u.client.from("day_impediment_observations").delete().eq("sprint_day_id", day1);
    expect(del.error!.code).toBe("42501");
  });

  it("deleting the user cascades through every F2 and F7 table without an FK error", async () => {
    const victim = await createTestUser("lib-cascade");
    const items = await seedItems(victim);
    await insertVision(victim, "wealth");
    const sid = await startSprint(victim, moneySprintArgs({ ...items, p_start_date: await dbTodayIn(TZ) }));
    const [d] = await sql<{ id: string }[]>`select id from public.sprint_days where sprint_id = ${sid} and day_index = 1`;
    await rpc(victim, "close_day", {
      p_sprint_day_id: d.id,
      p_actual: 1,
      p_impediments: [yes(items.p_highest_impediment_id)],
      p_cues: [yes(items.p_cue_ids[0])],
      p_response: "yes",
      p_recovered: "yes",
    });
    await deleteTestUser(victim);
    const [left] = await sql<{ n: number }[]>`
      select (select count(*) from public.cues where user_id = ${victim.id})
           + (select count(*) from public.impediments where user_id = ${victim.id})
           + (select count(*) from public.sprint_cues where user_id = ${victim.id})
           + (select count(*) from public.day_cue_observations where user_id = ${victim.id})
           + (select count(*) from public.day_impediment_observations where user_id = ${victim.id}) as n`;
    expect(Number(left.n)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// F7 — the focus cue: required at start, one per sprint, moved with set_focus_cue,
// refused by remove / archive / scope through sprint_invalid_reason.
// ---------------------------------------------------------------------------
describe("F7 focus cue", () => {
  let u: TestUser;
  let today: string;
  let cueA: string;
  let cueB: string;
  let cueC: string;
  let imp: string;
  let sprintId: string;
  let day1: string;

  const focusOf = async () =>
    (await sql<{ cue_id: string }[]>`select cue_id from public.sprint_cues where sprint_id = ${sprintId} and is_focus and removed_at is null`).map((r) => r.cue_id);

  beforeAll(async () => {
    u = await createTestUser("lib-focus");
    today = await dbTodayIn(TZ);
    await insertVision(u, "wealth");
    cueA = await insertCue(u, "Cue A");
    cueB = await insertCue(u, "Cue B");
    cueC = await insertCue(u, "Cue C, never in the sprint");
    imp = await insertImpediment(u, "Highest", PROOF);
  });

  afterAll(async () => {
    await deleteTestUser(u);
  });

  it("start_sprint refuses a focus outside the cues, or none at all, and writes nothing", async () => {
    const args = moneySprintArgs({ p_cue_ids: [cueA, cueB], p_impediment_ids: [imp], p_highest_impediment_id: imp, p_start_date: today });
    await expectRpcError(u, "start_sprint", { ...args, p_focus_cue_id: cueC }, "no_focus_cue");
    await expectRpcError(u, "start_sprint", { ...args, p_focus_cue_id: null }, "no_focus_cue");
    const [n] = await sql<{ n: number }[]>`select count(*)::int as n from public.sprints where user_id = ${u.id}`;
    expect(n.n).toBe(0);
  });

  it("starts with the focus flag on exactly the chosen cue", async () => {
    sprintId = await startSprint(u, moneySprintArgs({ p_cue_ids: [cueA, cueB], p_focus_cue_id: cueB, p_impediment_ids: [imp], p_highest_impediment_id: imp, p_start_date: today }));
    expect(await focusOf()).toEqual([cueB]);
    const [d] = await sql<{ id: string }[]>`select id from public.sprint_days where sprint_id = ${sprintId} and day_index = 1`;
    day1 = d.id;
  });

  it("the partial unique index and the check keep one active focus per sprint", async () => {
    await expect(sql`update public.sprint_cues set is_focus = true where sprint_id = ${sprintId} and cue_id = ${cueA}`).rejects.toThrow(/sprint_cues_one_focus/);
    await expect(sql`update public.sprint_cues set removed_at = now() where sprint_id = ${sprintId} and is_focus`).rejects.toThrow(/sprint_cues_focus_active_check/);
    expect(await focusOf()).toEqual([cueB]);
  });

  it("set_focus_cue moves the flag atomically and refuses a non-member or a stranger", async () => {
    await rpc(u, "set_focus_cue", { p_sprint_id: sprintId, p_cue_id: cueA });
    expect(await focusOf()).toEqual([cueA]);
    await expectRpcError(u, "set_focus_cue", { p_sprint_id: sprintId, p_cue_id: cueC }, "not_in_sprint");
    expect(await focusOf()).toEqual([cueA]);
    const other = await createTestUser("lib-focus-other");
    try {
      await expectRpcError(other, "set_focus_cue", { p_sprint_id: sprintId, p_cue_id: cueA }, "sprint_not_found");
    } finally {
      await deleteTestUser(other);
    }
  });

  it("the focus cue cannot be removed, archived or narrowed while a non-focus cue can", async () => {
    await expectRpcError(u, "remove_sprint_item", { p_sprint_id: sprintId, p_kind: "cue", p_item_id: cueA }, "no_focus_cue");
    const archived = await rpc<ArchiveResult>(u, "archive_item", { p_kind: "cue", p_item_id: cueA });
    expect(archived.ok).toBe(false);
    expect(archived.failing!.map((f) => f.reason)).toEqual(["no_focus_cue"]);
    const scoped = await rpc<ArchiveResult>(u, "set_item_scope", { p_kind: "cue", p_item_id: cueA, p_scope: "health" });
    expect(scoped.ok).toBe(false);
    expect(scoped.failing!.map((f) => f.reason)).toEqual(["no_focus_cue"]);
    const [row] = await sql<{ archived_at: Date | null; scope: string }[]>`select archived_at, scope from public.cues where id = ${cueA}`;
    expect(row).toEqual({ archived_at: null, scope: "global" });
    // The other cue is still free to go, and to come back.
    await rpc(u, "remove_sprint_item", { p_sprint_id: sprintId, p_kind: "cue", p_item_id: cueB });
    await rpc(u, "add_sprint_item", { p_sprint_id: sprintId, p_kind: "cue", p_item_id: cueB });
    expect(await focusOf()).toEqual([cueA]);
  });

  it("None on both groups writes a `no` row per offered item and leaves the Highest's answers null", async () => {
    await rpc(u, "close_day", {
      p_sprint_day_id: day1,
      p_actual: 10,
      p_impediments: [{ item_id: imp, answer: "no" }],
      p_cues: [
        { item_id: cueA, answer: "no" },
        { item_id: cueB, answer: "no" },
      ],
    });
    const cues = await sql<{ cue_id: string; used: string; was_focus: boolean }[]>`
      select cue_id, used, was_focus from public.day_cue_observations where sprint_day_id = ${day1} order by was_focus desc`;
    expect(cues).toEqual([
      { cue_id: cueA, used: "no", was_focus: true },
      { cue_id: cueB, used: "no", was_focus: false },
    ]);
    const [day] = await sql<{ response: string | null; recovered: string | null; impact: string | null; highest_impediment_id: string }[]>`
      select response, recovered, impact, highest_impediment_id from public.sprint_days where id = ${day1}`;
    expect(day).toEqual({ response: null, recovered: null, impact: null, highest_impediment_id: imp });
  });
});

// ---------------------------------------------------------------------------
// F7 — legacy days and the migration's guards.
// ---------------------------------------------------------------------------
describe("F7 legacy days and 0010 guards", () => {
  let u: TestUser;
  let sprintId: string;
  let dayIds: string[];
  let cue: string;
  let imp: string;

  beforeAll(async () => {
    u = await createTestUser("lib-legacy");
    // A past-dated sprint (days 1 and 2 already missed) whose memberships date from
    // its first day, so both days offer the items.
    const [d] = await sql<{ start: string }[]>`select to_char((now() at time zone 'UTC')::date - 2, 'YYYY-MM-DD') as start`;
    const seeded = await insertSprintRows(u, { startDate: d.start, tz: "UTC" });
    sprintId = seeded.sprintId;
    dayIds = seeded.dayIds;
    cue = await insertCue(u, "Legacy cue");
    imp = await insertImpediment(u, "Legacy highest", PROOF);
    await sql`insert into public.sprint_cues (sprint_id, user_id, cue_id, is_focus, added_at) values (${sprintId}, ${u.id}, ${cue}, true, ${d.start}::date)`;
    await sql`insert into public.sprint_impediments (sprint_id, user_id, impediment_id, is_highest, added_at) values (${sprintId}, ${u.id}, ${imp}, true, ${d.start}::date)`;
  });

  afterAll(async () => {
    await deleteTestUser(u);
  });

  it("a day closed with no observation rows is missing, and the next day still closes normally", async () => {
    await rpc(u, "close_day", { p_sprint_day_id: dayIds[0], p_actual: 5, p_cues: [{ item_id: cue, answer: "yes" }] });
    // Stage the pre-0010 shape: rows deleted as the superuser (no API role can).
    await sql`delete from public.day_cue_observations where sprint_day_id = ${dayIds[0]}`;
    await sql`delete from public.day_impediment_observations where sprint_day_id = ${dayIds[0]}`;
    const [missing] = await sql<{ closed: boolean; n: number }[]>`
      select closed_at is not null as closed,
             (select count(*)::int from public.day_cue_observations where sprint_day_id = ${dayIds[0]})
             + (select count(*)::int from public.day_impediment_observations where sprint_day_id = ${dayIds[0]}) as n
      from public.sprint_days where id = ${dayIds[0]}`;
    expect(missing).toEqual({ closed: true, n: 0 });
    const streak = await rpc<number>(u, "close_day", { p_sprint_day_id: dayIds[1], p_actual: 5, p_impediments: [{ item_id: imp, answer: "unsure" }] });
    expect(streak).toBe(0);
    const [rows] = await sql<{ n: number }[]>`
      select count(*)::int as n from public.day_impediment_observations where sprint_day_id = ${dayIds[1]} and occurred = 'unsure' and was_highest`;
    expect(rows.n).toBe(1);
  });

  it("0010 dropped the hurt / helped tables and created the two observation tables with exactly these columns", async () => {
    const tables = await sql<{ table_name: string }[]>`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_name in ('day_impediment_hurt', 'day_cue_helped', 'day_impediment_observations', 'day_cue_observations')
      order by table_name`;
    expect(tables.map((t) => t.table_name)).toEqual(["day_cue_observations", "day_impediment_observations"]);
    const cols = await sql<{ table_name: string; column_name: string; data_type: string; is_nullable: string }[]>`
      select table_name, column_name, data_type, is_nullable from information_schema.columns
      where table_schema = 'public' and table_name in ('day_impediment_observations', 'day_cue_observations')
      order by table_name, ordinal_position`;
    expect(cols).toEqual([
      { table_name: "day_cue_observations", column_name: "id", data_type: "uuid", is_nullable: "NO" },
      { table_name: "day_cue_observations", column_name: "sprint_day_id", data_type: "uuid", is_nullable: "NO" },
      { table_name: "day_cue_observations", column_name: "user_id", data_type: "uuid", is_nullable: "NO" },
      { table_name: "day_cue_observations", column_name: "cue_id", data_type: "uuid", is_nullable: "NO" },
      { table_name: "day_cue_observations", column_name: "name", data_type: "text", is_nullable: "NO" },
      { table_name: "day_cue_observations", column_name: "cue_when", data_type: "text", is_nullable: "YES" },
      { table_name: "day_cue_observations", column_name: "used", data_type: "text", is_nullable: "NO" },
      { table_name: "day_cue_observations", column_name: "was_focus", data_type: "boolean", is_nullable: "NO" },
      { table_name: "day_cue_observations", column_name: "created_at", data_type: "timestamp with time zone", is_nullable: "NO" },
      { table_name: "day_impediment_observations", column_name: "id", data_type: "uuid", is_nullable: "NO" },
      { table_name: "day_impediment_observations", column_name: "sprint_day_id", data_type: "uuid", is_nullable: "NO" },
      { table_name: "day_impediment_observations", column_name: "user_id", data_type: "uuid", is_nullable: "NO" },
      { table_name: "day_impediment_observations", column_name: "impediment_id", data_type: "uuid", is_nullable: "NO" },
      { table_name: "day_impediment_observations", column_name: "name", data_type: "text", is_nullable: "NO" },
      { table_name: "day_impediment_observations", column_name: "occurred", data_type: "text", is_nullable: "NO" },
      { table_name: "day_impediment_observations", column_name: "was_highest", data_type: "boolean", is_nullable: "NO" },
      { table_name: "day_impediment_observations", column_name: "created_at", data_type: "timestamp with time zone", is_nullable: "NO" },
    ]);
    const days = await sql<{ column_name: string }[]>`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'sprint_days' and column_name in ('proof_recover', 'response', 'recovered', 'impact')
      order by column_name`;
    expect(days.map((d) => d.column_name)).toEqual(["impact", "proof_recover", "recovered", "response"]);
  });

  it("the migration's guards raise on a legacy selection row and on an active sprint (its own text, in a rolled-back transaction)", async () => {
    const migration = readFileSync(join(process.cwd(), "supabase", "migrations", "0010_day_observations.sql"), "utf8");
    const guard = migration.slice(migration.indexOf("do $$"), migration.indexOf("$$;", migration.indexOf("do $$")) + 3);
    expect(guard).toContain("legacy_selections_present");
    expect(guard).toContain("focus_backfill_required");
    const ROLLBACK = new Error("rollback");
    const run = async (stage: (tx: TransactionSql) => Promise<void>) => {
      let raised = "";
      await sql
        .begin(async (tx) => {
          await tx`create table public.day_impediment_hurt (id int)`;
          await tx`create table public.day_cue_helped (id int)`;
          await stage(tx);
          await tx.unsafe(guard).catch((e: Error) => {
            raised = e.message;
          });
          throw ROLLBACK;
        })
        .catch((e) => {
          if (e !== ROLLBACK) throw e;
        });
      return raised;
    };
    // This suite's own active sprints trip the second guard, so the first must fire before it.
    expect(await run(async (tx) => { await tx`insert into public.day_cue_helped values (1)`; })).toMatch(/legacy_selections_present/);
    expect(await run(async () => {})).toMatch(/focus_backfill_required/);
    expect(await run(async (tx) => { await tx`update public.sprints set status = 'ended_early' where status = 'active'`; })).toBe("");
  });
});

// ---------------------------------------------------------------------------
// F6 — Libraries v2: cue WHEN, RECOVERED WHEN, rule 6 / rule 22 over three parts,
// the usage view, and the pin test against stale function bodies.
// ---------------------------------------------------------------------------
describe("F6 libraries v2", () => {
  let u: TestUser;
  let today: string;
  let cueId: string;
  let sprintId: string;
  let impHighest: string;
  let impOther: string;

  /** A highest whose RECOVERED WHEN is null: pre-F6 rows look like this. Bypasses the
   *  rule-22 trigger the way no API role can, so the suite can stage legacy state. */
  const stageLegacyHighest = async (id: string) => {
    await sql.begin(async (tx) => {
      await tx`set local session_replication_role = replica`;
      await tx`update public.impediments set proof_recover = null where id = ${id}`;
    });
  };

  beforeAll(async () => {
    u = await createTestUser("lib-v2");
    today = await dbTodayIn(TZ);
    await insertVision(u, "wealth");
    cueId = await insertCue(u, "Ask how much this pays");
    impHighest = await insertImpediment(u, "Starting late", PROOF);
    impOther = await insertImpediment(u, "Other", { proofWhen: "when", proofThen: "then" });
    sprintId = await startSprint(
      u,
      moneySprintArgs({ p_cue_ids: [cueId], p_impediment_ids: [impHighest, impOther], p_highest_impediment_id: impHighest, p_start_date: today }),
    );
  });

  afterAll(async () => {
    await deleteTestUser(u);
  });

  it("adds cues.cue_when and impediments.proof_recover, both nullable text, with INSERT and UPDATE for authenticated", async () => {
    const cols = await sql<{ table_name: string; column_name: string; data_type: string; is_nullable: string }[]>`
      select table_name, column_name, data_type, is_nullable from information_schema.columns
      where table_schema = 'public' and (table_name, column_name) in (('cues', 'cue_when'), ('impediments', 'proof_recover'))
      order by table_name`;
    expect(cols).toEqual([
      { table_name: "cues", column_name: "cue_when", data_type: "text", is_nullable: "YES" },
      { table_name: "impediments", column_name: "proof_recover", data_type: "text", is_nullable: "YES" },
    ]);
    const grants = await sql<{ table_name: string; column_name: string; privilege_type: string }[]>`
      select table_name, column_name, privilege_type from information_schema.column_privileges
      where table_schema = 'public' and grantee = 'authenticated'
        and (table_name, column_name) in (('cues', 'cue_when'), ('impediments', 'proof_recover'))
      order by table_name, privilege_type`;
    expect(grants).toEqual([
      { table_name: "cues", column_name: "cue_when", privilege_type: "INSERT" },
      { table_name: "cues", column_name: "cue_when", privilege_type: "SELECT" },
      { table_name: "cues", column_name: "cue_when", privilege_type: "UPDATE" },
      { table_name: "impediments", column_name: "proof_recover", privilege_type: "INSERT" },
      { table_name: "impediments", column_name: "proof_recover", privilege_type: "SELECT" },
      { table_name: "impediments", column_name: "proof_recover", privilege_type: "UPDATE" },
    ]);
    // The day-row snapshot of RECOVERED WHEN arrived with 0010 (F7), not here.
    const [days] = await sql<{ n: number }[]>`
      select count(*)::int as n from information_schema.columns where table_schema = 'public' and table_name = 'sprint_days' and column_name = 'proof_recover'`;
    expect(days.n).toBe(1);
  });

  it("pin: every redefined function carries the marker only its latest definer has", async () => {
    const fns = await sql<{ proname: string; prosrc: string }[]>`
      select proname, prosrc from pg_proc where pronamespace = 'public'::regnamespace`;
    const src = (name: string) => {
      const rows = fns.filter((f) => f.proname === name);
      expect(rows, `${name}: one definition`).toHaveLength(1);
      return rows[0].prosrc;
    };
    // 0005 markers kept by 0009.
    expect(src("start_sprint")).toMatch(/p_targets/);
    expect(src("start_sprint")).toMatch(/p_intentions/);
    // 0008 markers kept by 0009.
    expect(src("sprint_invalid_reason")).toMatch(/not coalesce\(p_kind = 'cue' and cue_id = p_exclude_item, false\)/);
    expect(src("set_highest_impediment")).toMatch(/p_proof_when/);
    // 0004 markers kept by 0009.
    expect(src("library_item_before_insert")).toMatch(/coalesce\(max\(rank\), 0\) \+ 1/);
    expect(src("impediments_before_update")).toMatch(/s\.status = 'active'/);
    expect(src("cues_before_update")).toMatch(/new\.explanation := nullif/);
    // 0009 itself.
    for (const name of ["start_sprint", "sprint_invalid_reason", "set_highest_impediment", "library_item_before_insert", "impediments_before_update"]) {
      expect(src(name), `${name}: proof_recover`).toMatch(/proof_recover/);
    }
    expect(src("cues_before_update")).toMatch(/cue_when/);
    expect(src("library_item_before_insert")).toMatch(/cue_when/);
    // 0010 (F7): each rebuilt body carries a marker only that version has, and the
    // 0007 lock and streak return survive inside close_day and the trigger.
    expect(src("start_sprint")).toMatch(/p_focus_cue_id/);
    expect(src("sprint_invalid_reason")).toMatch(/no_focus_cue/);
    expect(src("close_day")).toMatch(/p_impediments/);
    expect(src("close_day")).toMatch(/closed_on_time = v_today <= v_day\.date/);
    expect(src("close_day")).toMatch(/sprint_streak_at/);
    expect(src("sprint_days_immutable_after_close")).toMatch(/new\.impact/);
    expect(src("sprint_days_immutable_after_close")).toMatch(/new\.closed_on_time/);
    expect(src("day_offered_items")).toMatch(/is_focus/);
  });

  it("cue_when is trimmed and blank becomes null on insert and update; a cue may be saved without one (D5)", async () => {
    const ins = await u.client.from("cues").insert({ user_id: u.id, name: "Timed", cue_when: "  I schedule anything  " }).select("cue_when").single();
    expect(ins.error).toBeNull();
    expect(ins.data!.cue_when).toBe("I schedule anything");
    const blank = await u.client.from("cues").insert({ user_id: u.id, name: "Legacy", cue_when: "   " }).select("id, cue_when").single();
    expect(blank.error).toBeNull();
    expect(blank.data!.cue_when).toBeNull();
    const upd = await u.client.from("cues").update({ cue_when: " later " }).eq("id", blank.data!.id).select("cue_when").single();
    expect(upd.error).toBeNull();
    expect(upd.data!.cue_when).toBe("later");
  });

  it("proof_recover is trimmed and blank becomes null on insert", async () => {
    const ins = await u.client.from("impediments").insert({ user_id: u.id, name: "Trim me", proof_recover: "  by noon  " }).select("proof_recover").single();
    expect(ins.error).toBeNull();
    expect(ins.data!.proof_recover).toBe("by noon");
    const blank = await u.client.from("impediments").insert({ user_id: u.id, name: "Blank recover", proof_recover: "  " }).select("proof_recover").single();
    expect(blank.error).toBeNull();
    expect(blank.data!.proof_recover).toBeNull();
  });

  describe("start_sprint (rule 6 over three parts)", () => {
    let h: TestUser;
    let hToday: string;
    let hCue: string;

    beforeAll(async () => {
      h = await createTestUser("lib-v2-start");
      hToday = await dbTodayIn(TZ);
      await insertVision(h, "health");
      hCue = await insertCue(h, "Cue");
    });
    afterAll(async () => {
      await deleteTestUser(h);
    });
    const base = (imp: string) =>
      moneySprintArgs({ p_area: "health", p_cue_ids: [hCue], p_impediment_ids: [imp], p_highest_impediment_id: imp, p_start_date: hToday });

    it("rejects a highest with WHEN and THEN but a blank RECOVERED WHEN", async () => {
      const imp = await insertImpediment(h, "Two of three", { proofWhen: "when", proofThen: "then" });
      await expectRpcError(h, "start_sprint", base(imp), "proof_point_required");
      await expectRpcError(h, "start_sprint", { ...base(imp), p_proof_recover: "   " }, "proof_point_required");
      const [n] = await sql<{ n: number }[]>`select count(*)::int as n from public.sprints where user_id = ${h.id}`;
      expect(n.n).toBe(0);
    });

    it("starts when only p_proof_recover is passed for an impediment already carrying WHEN + THEN (coalesce per column)", async () => {
      const imp = await insertImpediment(h, "Two of three, completed at setup", { proofWhen: "when", proofThen: "then" });
      const id = await startSprint(h, { ...base(imp), p_proof_recover: "  recovered by noon  " });
      expect(id).toBeTruthy();
      const [row] = await sql<{ proof_when: string; proof_then: string; proof_recover: string }[]>`
        select proof_when, proof_then, proof_recover from public.impediments where id = ${imp}`;
      expect(row).toEqual({ proof_when: "when", proof_then: "then", proof_recover: "recovered by noon" });
    });

    it("writes all three inline parts to the impediment row when given together", async () => {
      const r = await createTestUser("lib-v2-start-3");
      try {
        await insertVision(r, "wealth");
        const cue = await insertCue(r, "Cue");
        const imp = await insertImpediment(r, "Nothing yet");
        const args = moneySprintArgs({ p_cue_ids: [cue], p_impediment_ids: [imp], p_highest_impediment_id: imp, p_start_date: hToday });
        await startSprint(r, { ...args, p_proof_when: "w", p_proof_then: "t", p_proof_recover: "r" });
        const [row] = await sql<{ proof_when: string; proof_then: string; proof_recover: string }[]>`
          select proof_when, proof_then, proof_recover from public.impediments where id = ${imp}`;
        expect(row).toEqual({ proof_when: "w", proof_then: "t", proof_recover: "r" });
      } finally {
        await deleteTestUser(r);
      }
    });
  });

  it("set_highest_impediment: a call passing only the recover keeps WHEN and THEN; a null recover is rejected and writes nothing", async () => {
    await expectRpcError(u, "set_highest_impediment", { p_sprint_id: sprintId, p_impediment_id: impOther }, "proof_point_required");
    await expectRpcError(
      u,
      "set_highest_impediment",
      { p_sprint_id: sprintId, p_impediment_id: impOther, p_proof_when: "changed", p_proof_then: "changed" },
      "proof_point_required",
    );
    const [untouched] = await sql<{ proof_when: string; proof_then: string; proof_recover: string | null }[]>`
      select proof_when, proof_then, proof_recover from public.impediments where id = ${impOther}`;
    expect(untouched).toEqual({ proof_when: "when", proof_then: "then", proof_recover: null });
    const flags = async () =>
      (await sql<{ impediment_id: string }[]>`select impediment_id from public.sprint_impediments where sprint_id = ${sprintId} and is_highest`).map(
        (r) => r.impediment_id,
      );
    expect(await flags()).toEqual([impHighest]);

    await rpc(u, "set_highest_impediment", { p_sprint_id: sprintId, p_impediment_id: impOther, p_proof_recover: " recovered " });
    const [after] = await sql<{ proof_when: string; proof_then: string; proof_recover: string }[]>`
      select proof_when, proof_then, proof_recover from public.impediments where id = ${impOther}`;
    expect(after).toEqual({ proof_when: "when", proof_then: "then", proof_recover: "recovered" });
    expect(await flags()).toEqual([impOther]);
    await rpc(u, "set_highest_impediment", { p_sprint_id: sprintId, p_impediment_id: impHighest });
    expect(await flags()).toEqual([impHighest]);
  });

  it("rule 22: clearing any of the three parts of the highest is rejected; editing text is allowed", async () => {
    for (const col of ["proof_when", "proof_then", "proof_recover"] as const) {
      const clear = await u.client.from("impediments").update({ [col]: "  " }).eq("id", impHighest);
      expect(clear.error, col).not.toBeNull();
      expect(clear.error!.message).toMatch(/proof_point_required/);
    }
    const edit = await u.client
      .from("impediments")
      .update({ proof_recover: "The timer is running within 5 minutes" })
      .eq("id", impHighest)
      .select("proof_recover")
      .single();
    expect(edit.error).toBeNull();
    expect(edit.data!.proof_recover).toBe("The timer is running within 5 minutes");
    const [row] = await sql<{ proof_when: string; proof_then: string; proof_recover: string }[]>`
      select proof_when, proof_then, proof_recover from public.impediments where id = ${impHighest}`;
    expect(row).toEqual({ proof_when: PROOF.proofWhen, proof_then: PROOF.proofThen, proof_recover: "The timer is running within 5 minutes" });
    // A non-highest impediment can clear its recover freely.
    const other = await u.client.from("impediments").update({ proof_recover: "" }).eq("id", impOther).select("proof_recover").single();
    expect(other.error).toBeNull();
    expect(other.data!.proof_recover).toBeNull();
  });

  describe("a pre-F6 highest whose RECOVERED WHEN is still null", () => {
    beforeAll(async () => {
      await stageLegacyHighest(impHighest);
      const [row] = await sql<{ proof_recover: string | null }[]>`select proof_recover from public.impediments where id = ${impHighest}`;
      expect(row.proof_recover).toBeNull();
    });

    it("rule 22 narrowed: move_item, set_item_scope and a rename go through (not proof); a proof edit that leaves recover null does not", async () => {
      const rank = async () => (await sql<{ rank: number }[]>`select rank from public.impediments where id = ${impHighest}`)[0].rank;
      const r0 = await rank();
      await rpc(u, "move_item", { p_kind: "impediment", p_item_id: impHighest, p_direction: "down" });
      expect(await rank()).not.toBe(r0);
      await rpc(u, "move_item", { p_kind: "impediment", p_item_id: impHighest, p_direction: "up" });
      expect(await rank()).toBe(r0);

      const widen = await rpc<ArchiveResult>(u, "set_item_scope", { p_kind: "impediment", p_item_id: impHighest, p_scope: "global" });
      expect(widen.ok).toBe(true);
      const name = await u.client.from("impediments").update({ name: "Starting late (renamed)" }).eq("id", impHighest).select("name").single();
      expect(name.error).toBeNull();

      const edit = await u.client.from("impediments").update({ proof_then: "changed while incomplete" }).eq("id", impHighest);
      expect(edit.error).not.toBeNull();
      expect(edit.error!.message).toMatch(/proof_point_required/);
    });

    it("sprint_invalid_reason reports proof_point_required, so archive_item and set_item_scope on another member are blocked by it", async () => {
      const [r] = await sql<{ reason: string | null }[]>`select public.sprint_invalid_reason(${sprintId}) as reason`;
      expect(r.reason).toBe("proof_point_required");
      const archive = await rpc<ArchiveResult>(u, "archive_item", { p_kind: "impediment", p_item_id: impOther });
      expect(archive.ok).toBe(false);
      expect(archive.failing![0]).toMatchObject({ sprint_id: sprintId, reason: "proof_point_required" });
      const narrow = await rpc<ArchiveResult>(u, "set_item_scope", { p_kind: "impediment", p_item_id: impOther, p_scope: "health" });
      expect(narrow.ok).toBe(false);
      expect(narrow.failing![0].reason).toBe("proof_point_required");
    });

    it("completing the recover under Edit is allowed and clears the reason", async () => {
      const fix = await u.client.from("impediments").update({ proof_recover: "back on track" }).eq("id", impHighest).select("proof_recover").single();
      expect(fix.error).toBeNull();
      const [r] = await sql<{ reason: string | null }[]>`select public.sprint_invalid_reason(${sprintId}) as reason`;
      expect(r.reason).toBeNull();
    });
  });

  it("library_item_usage: used / active per item, one row per library item, scoped by RLS", async () => {
    type Usage = { kind: string; item_id: string; used: boolean; active: boolean };
    const mine = await u.client.from("library_item_usage").select("*");
    expect(mine.error).toBeNull();
    const rows = mine.data as Usage[];
    const byId = new Map(rows.map((r) => [r.item_id, r]));
    expect(byId.get(cueId)).toMatchObject({ kind: "cue", used: true, active: true });
    expect(byId.get(impHighest)).toMatchObject({ kind: "impediment", used: true, active: true });
    const [{ n: items }] = await sql<{ n: number }[]>`
      select (select count(*) from public.cues where user_id = ${u.id}) + (select count(*) from public.impediments where user_id = ${u.id}) as n`;
    expect(rows).toHaveLength(Number(items));
    const unused = rows.filter((r) => !r.used);
    expect(unused.length).toBeGreaterThan(0);
    expect(unused.every((r) => !r.active)).toBe(true);

    // Removed from the sprint: still used (history), no longer active.
    await rpc(u, "remove_sprint_item", { p_sprint_id: sprintId, p_kind: "impediment", p_item_id: impOther });
    const again = await u.client.from("library_item_usage").select("*").eq("item_id", impOther).single();
    expect(again.data).toMatchObject({ used: true, active: false });

    const b = await createTestUser("lib-v2-b");
    try {
      const theirs = await b.client.from("library_item_usage").select("*");
      expect(theirs.error).toBeNull();
      expect(theirs.data).toEqual([]);
    } finally {
      await deleteTestUser(b);
    }
  });
});
