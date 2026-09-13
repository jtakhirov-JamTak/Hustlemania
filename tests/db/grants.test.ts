import type { Sql, TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { sql } from "./helpers";

/**
 * Deny-by-default parity with the hosted project ("automatically expose new tables" is
 * off there). These fail locally if a migration creates a table without revoking the
 * API roles' access, or forgets to enable RLS — the two mistakes that only surface in
 * production otherwise.
 */
describe("public schema access model", () => {
  afterAll(async () => {
    await sql.end();
  });

  it("every table in public has RLS enabled", async () => {
    const rows = await sql<{ relname: string }[]>`
      select relname from pg_class
      where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity`;
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it("anon has no privilege on any table in public", async () => {
    const rows = await sql<{ table_name: string; privilege_type: string }[]>`
      select table_name, privilege_type from information_schema.role_table_grants
      where table_schema = 'public' and grantee = 'anon'`;
    expect(rows).toEqual([]);
  });

  it("authenticated may INSERT only library items and tasks (F9: visions only through save_vision), and DELETE only library items (rule 19 via RLS)", async () => {
    const rows = await sql<{ table_name: string; privilege_type: string }[]>`
      select table_name, privilege_type from information_schema.role_table_grants
      where table_schema = 'public' and grantee = 'authenticated' and privilege_type in ('INSERT', 'DELETE')
      order by table_name, privilege_type`;
    // Table-level: DELETE only on the libraries. INSERT is granted per column (below),
    // which role_table_grants does not report.
    // F17: a situation is deleted only through delete_situation; the direct grant is gone.
    expect(rows).toEqual([
      { table_name: "cues", privilege_type: "DELETE" },
      { table_name: "impediments", privilege_type: "DELETE" },
    ]);
    const cols = await sql<{ table_name: string; column_name: string }[]>`
      select table_name, column_name from information_schema.column_privileges
      where table_schema = 'public' and grantee = 'authenticated' and privilege_type = 'INSERT'
      order by table_name, column_name`;
    expect(cols).toEqual([
      { table_name: "cues", column_name: "cue_when" },
      { table_name: "cues", column_name: "name" },
      { table_name: "cues", column_name: "scope" },
      { table_name: "cues", column_name: "user_id" },
      { table_name: "impediments", column_name: "name" },
      { table_name: "impediments", column_name: "proof_recover" },
      { table_name: "impediments", column_name: "proof_then" },
      { table_name: "impediments", column_name: "scope" },
      { table_name: "impediments", column_name: "user_id" },
      { table_name: "situations", column_name: "name" },
      { table_name: "situations", column_name: "scope" },
      { table_name: "situations", column_name: "user_id" },
      // 0023: the client may name the id so a Retry after a lost response replays the same row.
      { table_name: "tasks", column_name: "id" },
      { table_name: "tasks", column_name: "sprint_day_id" },
      { table_name: "tasks", column_name: "text" },
      { table_name: "tasks", column_name: "user_id" },
    ]);
  });

  it("authenticated may update only free-text columns directly (never scope, rank, archived_at, flags)", async () => {
    const rows = await sql<{ table_name: string; column_name: string }[]>`
      select table_name, column_name from information_schema.column_privileges
      where table_schema = 'public' and grantee = 'authenticated' and privilege_type = 'UPDATE'
      order by table_name, column_name`;
    expect(rows).toEqual([
      { table_name: "cues", column_name: "cue_when" },
      { table_name: "cues", column_name: "name" },
      { table_name: "impediments", column_name: "name" },
      { table_name: "impediments", column_name: "proof_recover" },
      { table_name: "impediments", column_name: "proof_then" },
      { table_name: "situations", column_name: "name" },
      { table_name: "sprint_days", column_name: "intention" },
      { table_name: "sprints", column_name: "mantra" },
      { table_name: "tasks", column_name: "archived_at" },
      { table_name: "tasks", column_name: "done" },
      { table_name: "tasks", column_name: "text" },
    ]);
  });

  it("no plain index duplicates a full unique index on the same columns (0008 dropped one)", async () => {
    const rows = await sql<{ dup: string; unique_index: string }[]>`
      select a.indexrelid::regclass::text as dup, b.indexrelid::regclass::text as unique_index
      from pg_index a
      join pg_index b on b.indrelid = a.indrelid and b.indkey::text = a.indkey::text and b.indexrelid <> a.indexrelid
      join pg_class c on c.oid = a.indrelid
      where c.relnamespace = 'public'::regnamespace
        and b.indisunique and b.indpred is null and not a.indisunique`;
    expect(rows).toEqual([]);
  });

  // Every table that holds a user's rows must go with the user (SPEC: delete = cascade).
  // Read from pg_constraint, so a future table (F8 profiles) without the cascade fails here.
  const noCascade = async (q: Sql | TransactionSql) =>
    q<{ table_name: string }[]>`
      select c.relname as table_name
      from pg_class c
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'user_id' and not a.attisdropped
      where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
        and not exists (
          select 1 from pg_constraint k
          where k.conrelid = c.oid and k.contype = 'f' and k.confrelid = 'auth.users'::regclass
            and k.confdeltype = 'c' and a.attnum = any(k.conkey))
      order by 1`;

  it("every public table with a user_id column cascades from auth.users on delete", async () => {
    const [count] = await sql<{ n: number }[]>`
      select count(*)::int as n from pg_attribute a join pg_class c on c.oid = a.attrelid
      where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and a.attname = 'user_id' and not a.attisdropped`;
    expect(count.n).toBeGreaterThanOrEqual(10);
    expect((await noCascade(sql)).map((r) => r.table_name)).toEqual([]);
  });

  it("the cascade check reports a user_id table whose FK does not cascade (rolled back)", async () => {
    const ROLLBACK = new Error("rollback");
    await sql
      .begin(async (tx) => {
        await tx`create table public.__cascade_probe (id int, user_id uuid references auth.users(id))`;
        expect((await noCascade(tx)).map((r) => r.table_name)).toEqual(["__cascade_probe"]);
        throw ROLLBACK;
      })
      .catch((e) => {
        if (e !== ROLLBACK) throw e;
      });
  });

  it("a table created by a later migration is unreachable until granted", async () => {
    await sql.begin(async (tx) => {
      await tx`create table public.__grant_probe (id int)`;
      const [row] = await tx<{ anon: boolean; authed: boolean }[]>`
        select has_table_privilege('anon', 'public.__grant_probe', 'select') as anon,
               has_table_privilege('authenticated', 'public.__grant_probe', 'select') as authed`;
      expect(row).toEqual({ anon: false, authed: false });
      await tx`drop table public.__grant_probe`;
    });
  });

  it("anon can execute no function in public; authenticated only the RPC entry points", async () => {
    const rows = await sql<{ proname: string; anon: boolean; authed: boolean }[]>`
      select p.proname,
             has_function_privilege('anon', p.oid, 'execute') as anon,
             has_function_privilege('authenticated', p.oid, 'execute') as authed
      from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1`;
    expect(rows.filter((r) => r.anon).map((r) => r.proname)).toEqual([]);
    expect(rows.filter((r) => r.authed).map((r) => r.proname)).toEqual([
      "add_sprint_item",
      "archive_item",
      "close_day",
      "complete_sprint",
      "create_situations",
      "day_offered_items",
      "delete_situation",
      "end_sprint_early",
      "finish_review",
      "finish_sprint",
      "insight_cue_usefulness",
      "insight_cue_usefulness_many",
      "insight_impediment_impact",
      "insight_impediment_impact_many",
      "insight_response_recovery",
      "insight_response_recovery_many",
      "insight_situations",
      "insight_situations_many",
      "move_item",
      "parse_permit",
      "remove_sprint_item",
      "replace_vision",
      "restore_item",
      "review_vision",
      "save_targets",
      "save_vision_goal",
      "save_vision_picture",
      "set_focus_cue",
      "set_highest_impediment",
      "set_item_scope",
      "set_item_situations",
      "set_vision_obstacle",
      "sprint_best_streak",
      "sprint_review_summary",
      "sprint_review_summary_many",
      "sprint_streaks",
      "start_sprint",
    ]);
  });

  it("anon cannot execute the write functions", async () => {
    const [row] = await sql<{ start: boolean; close: boolean }[]>`
      select has_function_privilege('anon', 'public.start_sprint(text,text,text,text,text,bigint,int,text,text,jsonb,text,date,uuid[],uuid[],uuid,uuid,text,text,text,bigint[])', 'execute') as "start",
             has_function_privilege('anon', 'public.close_day(uuid,bigint,text,jsonb,jsonb)', 'execute') as close`;
    expect(row).toEqual({ start: false, close: false });
  });

  it("F13: reminder_log and the reminders_* functions are service-role only", async () => {
    const [table] = await sql<{ anon: boolean; authed: boolean; service: boolean }[]>`
      select has_table_privilege('anon', 'public.reminder_log', 'select') as anon,
             has_table_privilege('authenticated', 'public.reminder_log', 'select') as authed,
             has_table_privilege('service_role', 'public.reminder_log', 'select, insert, update') as service`;
    expect(table).toEqual({ anon: false, authed: false, service: true });
    const fns = await sql<{ proname: string; anon: boolean; authed: boolean; service: boolean }[]>`
      select p.proname,
             has_function_privilege('anon', p.oid, 'execute') as anon,
             has_function_privilege('authenticated', p.oid, 'execute') as authed,
             has_function_privilege('service_role', p.oid, 'execute') as service
      from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'reminders\\_%' order by 1`;
    expect(fns).toEqual([
      { proname: "reminders_claim", anon: false, authed: false, service: true },
      { proname: "reminders_due", anon: false, authed: false, service: true },
      { proname: "reminders_mark", anon: false, authed: false, service: true },
    ]);
  });

  it("the plan validator, the lock trigger functions and the fixed-clock streak are not callable by the API roles", async () => {
    const [row] = await sql<{ validate: boolean; lock: boolean; tasks: boolean; streak_at: boolean }[]>`
      select has_function_privilege('authenticated', 'public.validate_targets(text,bigint,bigint[])', 'execute') as validate,
             has_function_privilege('authenticated', 'public.sprint_days_target_locked()', 'execute') as lock,
             has_function_privilege('authenticated', 'public.tasks_lock_with_day()', 'execute') as tasks,
             has_function_privilege('authenticated', 'public.sprint_streak_at(uuid,timestamptz)', 'execute') as streak_at`;
    expect(row).toEqual({ validate: false, lock: false, tasks: false, streak_at: false });
  });
});
