import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestUser, deleteTestUser, expectRpcError, rpc, sql, type TestUser } from "./helpers";

afterAll(async () => {
  await sql.end();
});

// ---------------------------------------------------------------------------
// F17 — parse_permit: the capture parser's per-user cap, exact across instances.
// ---------------------------------------------------------------------------
describe("F17 parse_permit and parse_log", () => {
  let u: TestUser;

  beforeAll(async () => {
    u = await createTestUser("parse-permit");
  });

  afterAll(async () => {
    await deleteTestUser(u);
  });

  it("permits ten sorts a minute, refuses the eleventh, and records a row per permitted call only", async () => {
    for (let i = 0; i < 10; i++) expect(await rpc(u, "parse_permit", { p_kind: "cue" })).toBeNull();
    expect(await rpc(u, "parse_permit", { p_kind: "cue" })).toBe("rate_limited");
    expect(await rpc(u, "parse_permit", { p_kind: "today" })).toBe("rate_limited");
    const [n] = await sql<{ n: number }[]>`select count(*)::int as n from public.parse_log where user_id = ${u.id}`;
    expect(n.n).toBe(10);
  });

  it("refuses the 201st call in a day and prunes the caller's rows older than two days on a permitted call", async () => {
    await sql`delete from public.parse_log where user_id = ${u.id}`;
    // 200 calls spread over the day, none in the last minute, plus one stale row.
    await sql`insert into public.parse_log (user_id, kind, created_at)
              select ${u.id}, 'today', now() - interval '2 hours' - (g || ' seconds')::interval from generate_series(1, 200) as g`;
    await sql`insert into public.parse_log (user_id, kind, created_at) values (${u.id}, 'cue', now() - interval '3 days')`;
    expect(await rpc(u, "parse_permit", { p_kind: "today" })).toBe("rate_limited");
    await sql`delete from public.parse_log where id = (select id from public.parse_log where user_id = ${u.id} and kind = 'today' limit 1)`;
    expect(await rpc(u, "parse_permit", { p_kind: "today" })).toBeNull();
    const [stale] = await sql<{ n: number }[]>`select count(*)::int as n from public.parse_log where user_id = ${u.id} and created_at < now() - interval '2 days'`;
    expect(stale.n).toBe(0);
    const [total] = await sql<{ n: number }[]>`select count(*)::int as n from public.parse_log where user_id = ${u.id}`;
    expect(total.n).toBe(200);
  });

  it("another user's rows do not count against the caller", async () => {
    const other = await createTestUser("parse-permit-other");
    try {
      expect(await rpc(other, "parse_permit", { p_kind: "situations" })).toBeNull();
    } finally {
      await deleteTestUser(other);
    }
  });

  it("refuses an unknown kind; the log is unreadable and unwritable by the signed-in user", async () => {
    await expectRpcError(u, "parse_permit", { p_kind: "essay" }, "invalid_kind");
    const read = await u.client.from("parse_log").select("id");
    expect(read.error?.code).toBe("42501");
    const write = await u.client.from("parse_log").insert({ user_id: u.id, kind: "cue" } as never);
    expect(write.error?.code).toBe("42501");
  });

  it("holds no user text: an id, the owner, a kind and a timestamp", async () => {
    const cols = await sql<{ column_name: string }[]>`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'parse_log' order by column_name`;
    expect(cols.map((c) => c.column_name)).toEqual(["created_at", "id", "kind", "user_id"]);
    const [rls] = await sql<{ relrowsecurity: boolean }[]>`select relrowsecurity from pg_class where oid = 'public.parse_log'::regclass`;
    expect(rls.relrowsecurity).toBe(true);
  });
});
