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

  it("authenticated may INSERT only library items and DELETE only library items (rule 19 via RLS)", async () => {
    const rows = await sql<{ table_name: string; privilege_type: string }[]>`
      select table_name, privilege_type from information_schema.role_table_grants
      where table_schema = 'public' and grantee = 'authenticated' and privilege_type in ('INSERT', 'DELETE')
      order by table_name, privilege_type`;
    // Table-level: DELETE only on the libraries. INSERT is granted per column (below),
    // which role_table_grants does not report.
    expect(rows).toEqual([
      { table_name: "cues", privilege_type: "DELETE" },
      { table_name: "impediments", privilege_type: "DELETE" },
    ]);
    const cols = await sql<{ table_name: string; column_name: string }[]>`
      select table_name, column_name from information_schema.column_privileges
      where table_schema = 'public' and grantee = 'authenticated' and privilege_type = 'INSERT'
      order by table_name, column_name`;
    expect(cols).toEqual([
      { table_name: "cues", column_name: "explanation" },
      { table_name: "cues", column_name: "name" },
      { table_name: "cues", column_name: "scope" },
      { table_name: "cues", column_name: "user_id" },
      { table_name: "impediments", column_name: "explanation" },
      { table_name: "impediments", column_name: "name" },
      { table_name: "impediments", column_name: "proof_then" },
      { table_name: "impediments", column_name: "proof_when" },
      { table_name: "impediments", column_name: "scope" },
      { table_name: "impediments", column_name: "user_id" },
      { table_name: "visions", column_name: "area" },
      { table_name: "visions", column_name: "body" },
      { table_name: "visions", column_name: "user_id" },
    ]);
  });

  it("authenticated may update only free-text columns directly (never scope, rank, archived_at, flags)", async () => {
    const rows = await sql<{ table_name: string; column_name: string }[]>`
      select table_name, column_name from information_schema.column_privileges
      where table_schema = 'public' and grantee = 'authenticated' and privilege_type = 'UPDATE'
      order by table_name, column_name`;
    expect(rows).toEqual([
      { table_name: "cues", column_name: "explanation" },
      { table_name: "cues", column_name: "name" },
      { table_name: "impediments", column_name: "explanation" },
      { table_name: "impediments", column_name: "name" },
      { table_name: "impediments", column_name: "proof_then" },
      { table_name: "impediments", column_name: "proof_when" },
      { table_name: "sprint_days", column_name: "intention" },
      { table_name: "sprints", column_name: "mantra" },
      { table_name: "visions", column_name: "body" },
    ]);
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
      "day_offered_items",
      "move_item",
      "remove_sprint_item",
      "restore_item",
      "save_targets",
      "set_highest_impediment",
      "set_item_scope",
      "start_sprint",
    ]);
  });

  it("anon cannot execute the write functions", async () => {
    const [row] = await sql<{ start: boolean; close: boolean }[]>`
      select has_function_privilege('anon', 'public.start_sprint(text,text,text,text,text,bigint,int,text,text,text,jsonb,text,date,uuid[],uuid[],uuid,text,text,text,bigint[],text[])', 'execute') as "start",
             has_function_privilege('anon', 'public.close_day(uuid,bigint,text,uuid[],uuid,uuid[],uuid)', 'execute') as close`;
    expect(row).toEqual({ start: false, close: false });
  });

  it("the plan validator and the lock trigger function are not callable by the API roles", async () => {
    const [row] = await sql<{ validate: boolean; lock: boolean }[]>`
      select has_function_privilege('authenticated', 'public.validate_targets(text,bigint,bigint[])', 'execute') as validate,
             has_function_privilege('authenticated', 'public.sprint_days_target_locked()', 'execute') as lock`;
    expect(row).toEqual({ validate: false, lock: false });
  });
});
