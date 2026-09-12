// Rehearses migration 0021 (F17) against legacy-shaped rows on the LOCAL stack only:
//   1. `supabase db reset --version 0020`  — the schema as the hosted project has it today
//   2. seed two users through the 0020 functions (the pre-F17 shape): A has a 3-of-3
//      vision, an impediment with two impediment situations, a cue with a NOTE and two
//      cue situations (so ranks 1 and 2 collide across the two kinds), a 22-argument
//      sprint with a `why`, and a closed day 1 that observed one situation; B has loose
//      situations of both kinds and nothing else
//   3. `supabase migration up`             — applies 0021 and 0022 and nothing else
//   4. assert the schema and the kept rows, the renumbering, the 20-argument
//      start_sprint, and the three delete_situation outcomes; exit non-zero on any mismatch
// then `supabase db reset` to leave the stack at HEAD for the test suites.
//
// Run: npx tsx --env-file=.env.local scripts/rehearse-0021.mjs
// The real rehearsal is the same steps over a restored hosted dump (RUNBOOK_RESTORE
// §"Restore into the local stack"); this script is the version a machine without the
// dump can run, and the one that turns red if the renumbering, the column drops, the
// signature change or the delete outcomes are dropped from the migration.

import { execSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const postgres = require("postgres");

const url = process.env.LOCAL_DATABASE_URL;
if (!url || !/127\.0\.0\.1|localhost/.test(url)) {
  console.error("LOCAL_DATABASE_URL must point at the local stack (npm run pretest:db writes .env.local).");
  process.exit(2);
}

const run = (cmd) => {
  console.log(`$ ${cmd}`);
  execSync(cmd, { stdio: "inherit", shell: true });
};

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const as = (sql, u) => sql.unsafe(`select set_config('request.jwt.claims', '{"sub":"${u}","role":"authenticated"}', false)`);

async function seedLegacy(sql) {
  for (const u of [A, B]) {
    await sql`insert into auth.users (id, email, aud, role, instance_id) values (${u}, ${u.slice(0, 4) + "@rehearsal.local"}, 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000')`;
  }
  await as(sql, A);
  // A: the three F16 steps.
  await sql`select public.save_vision_picture('A morning run before the kids wake')`;
  await sql`select public.save_vision_goal('A one-year goal', 'A signed lease', 8, null)`;
  const [obstacle] = await sql`select public.set_vision_obstacle(null, 'I notice delaying', 'timer', 'running in 10') as id`;
  // Two impediment situations (ranks 1, 2 in the impediment list) and a cue with a NOTE
  // and two cue situations (ranks 1, 2 in the cue list) — the ranks collide across kinds.
  const [is1] = await sql`insert into public.situations (user_id, kind, name) values (${A}, 'impediment', 'Starting late') returning id`;
  const [is2] = await sql`insert into public.situations (user_id, kind, name) values (${A}, 'impediment', 'Late night') returning id`;
  await sql`select public.set_item_situations('impediment', ${obstacle.id}::uuid, ${[is1.id, is2.id]}::uuid[])`;
  const [cue] = await sql`insert into public.cues (user_id, name, explanation, cue_when) values (${A}, 'Ask how much this pays', 'a note that will not survive', 'I schedule anything') returning id`;
  const [cs1] = await sql`insert into public.situations (user_id, kind, name) values (${A}, 'cue', 'Scheduling') returning id`;
  const [cs2] = await sql`insert into public.situations (user_id, kind, name) values (${A}, 'cue', 'Any meeting') returning id`;
  await sql`select public.set_item_situations('cue', ${cue.id}::uuid, ${[cs1.id, cs2.id]}::uuid[])`;
  // A 22-argument sprint with a why, starting today, and day 1 closed with one situation observed.
  const [s] = await sql`select public.start_sprint('wealth','o','money','USD',null,1400,7,'because it matters','c','m','[]','UTC', current_date, ${[cue.id]}::uuid[], ${[obstacle.id]}::uuid[], ${obstacle.id}::uuid, ${cue.id}::uuid) as id`;
  const [d1] = await sql`select id from public.sprint_days where sprint_id = ${s.id} and day_index = 1`;
  // postgres.js would double-encode a JSON string under `::jsonb`; sql.json sends the value itself.
  await sql`select public.close_day(${d1.id}::uuid, 100, null,
    ${sql.json([{ item_id: obstacle.id, answer: "yes", situations: [{ situation_id: is1.id, recovered: "yes" }] }])},
    ${sql.json([{ item_id: cue.id, answer: "no", situations: [] }])})`;
  // B: loose situations of both kinds.
  await as(sql, B);
  const [bi] = await sql`insert into public.situations (user_id, kind, name) values (${B}, 'impediment', 'B impediment situation') returning id`;
  const [bc] = await sql`insert into public.situations (user_id, kind, name) values (${B}, 'cue', 'B cue situation') returning id`;
  return { obstacle: obstacle.id, cue: cue.id, sprint: s.id, is1: is1.id, is2: is2.id, cs1: cs1.id, cs2: cs2.id, bi: bi.id, bc: bc.id };
}

async function assertConverted(sql, ids) {
  const fail = (msg) => {
    console.error(`FAIL: ${msg}`);
    process.exitCode = 1;
  };
  const eq = (label, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${JSON.stringify(got)}${ok ? "" : ` (wanted ${JSON.stringify(want)})`}`);
    if (!ok) process.exitCode = 1;
  };
  const rejects = async (label, promise, code) => {
    try {
      await promise;
      eq(label, "no error", code);
    } catch (e) {
      eq(label, String(e.message).includes(code) ? code : e.message, code);
    }
  };

  const cols = await sql`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'situations' order by column_name`;
  eq("situations columns", cols.map((c) => c.column_name), ["archived_at", "created_at", "id", "name", "rank", "scope", "updated_at", "user_id"]);
  const [anchors] = await sql`select count(*)::int as n from information_schema.columns where table_schema = 'public' and table_name in ('impediment_situations', 'cue_situations') and column_name = 'situation_kind'`;
  eq("situation_kind anchors dropped", anchors.n, 0);
  const [why] = await sql`select count(*)::int as n from information_schema.columns where table_schema = 'public' and table_name = 'sprints' and column_name = 'why'`;
  eq("sprints.why dropped", why.n, 0);
  const [note] = await sql`select count(*)::int as n from information_schema.columns where table_schema = 'public' and table_name = 'cues' and column_name = 'explanation'`;
  eq("cues.explanation dropped", note.n, 0);
  const [parseLog] = await sql`select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_name = 'parse_log'`;
  eq("parse_log present (0022)", parseLog.n, 1);

  // The renumbering: A's four situations are 1..4, the impediment pair first, each in its old order.
  const ranks = await sql`select id, name, rank from public.situations where user_id = ${A} order by rank`;
  eq("A's ranks are 1..4, impediment situations first in their old order", ranks.map((r) => [r.name, r.rank]), [["Starting late", 1], ["Late night", 2], ["Scheduling", 3], ["Any meeting", 4]]);
  const bRanks = await sql`select name, rank from public.situations where user_id = ${B} order by rank`;
  eq("B's ranks are 1..2", bRanks.map((r) => [r.name, r.rank]), [["B impediment situation", 1], ["B cue situation", 2]]);
  const [dups] = await sql`select count(*)::int as n from (select user_id, rank from public.situations group by user_id, rank having count(*) > 1) d`;
  eq("no duplicate (user, rank)", dups.n, 0);

  // Attachments unchanged; the sprint survives without its why; the observation row is still there.
  const [att] = await sql`select (select count(*)::int from public.impediment_situations where impediment_id = ${ids.obstacle}) as imp, (select count(*)::int from public.cue_situations where cue_id = ${ids.cue}) as cue`;
  eq("attachment counts unchanged", [att.imp, att.cue], [2, 2]);
  const [sprint] = await sql`select status, mantra from public.sprints where id = ${ids.sprint}`;
  eq("the sprint row survives", [sprint.status, sprint.mantra], ["active", "m"]);
  const [obs] = await sql`select count(*)::int as n from public.day_impediment_situation_observations where situation_id = ${ids.is1}`;
  eq("the day-1 observation row survives", obs.n, 1);

  // day_offered_items without explanation.
  const [d1] = await sql`select id from public.sprint_days where sprint_id = ${ids.sprint} and day_index = 1`;
  const offered = await sql`select * from public.day_offered_items(${d1.id}::uuid)`;
  eq("day_offered_items rows carry no explanation key", offered.length > 0 && offered.every((r) => !("explanation" in r)), true);

  // Exactly one start_sprint, with 20 arguments; it starts a sprint for A in another area.
  const fns = await sql`select pronargs from pg_proc where pronamespace = 'public'::regnamespace and proname = 'start_sprint'`;
  eq("one start_sprint with 20 arguments", fns.map((f) => f.pronargs), [20]);
  await as(sql, A);
  const [imp2] = await sql`insert into public.impediments (user_id, name, proof_then, proof_recover) values (${A}, 'Second', 'then', 'recovered') returning id`;
  await sql`select public.set_item_situations('impediment', ${imp2.id}::uuid, ${[ids.cs1]}::uuid[])`;
  const [started] = await sql`select public.start_sprint('health','o','money','USD',null,1400,7,'c','m','[]','UTC', current_date, '{}'::uuid[], ${[imp2.id]}::uuid[], ${imp2.id}::uuid, null::uuid, 'Day one intention') as id`;
  eq("the 20-argument start_sprint starts a sprint", typeof started.id, "string");
  const [dayOne] = await sql`select intention from public.sprint_days where sprint_id = ${started.id} and day_index = 1`;
  eq("day 1 carries the intention, days 2–14 none", [dayOne.intention, (await sql`select count(*)::int as n from public.sprint_days where sprint_id = ${started.id} and intention is not null`)[0].n], ["Day one intention", 1]);
  await rejects("the 22-argument call no longer resolves", sql`select public.start_sprint('wealth','o','money','USD',null,1400,7,'why','c','m','[]','UTC', current_date, '{}'::uuid[], ${[imp2.id]}::uuid[], ${imp2.id}::uuid, null::uuid, null, null, null, null, null)`, "does not exist");

  // A cue situation now attaches to an impediment (one library).
  await sql`select public.set_item_situations('impediment', ${imp2.id}::uuid, ${[ids.cs1, ids.cs2]}::uuid[])`;
  const [both] = await sql`select count(*)::int as n from public.impediment_situations where impediment_id = ${imp2.id}`;
  eq("a former cue situation attaches to an impediment", both.n, 2);

  // delete_situation: archived for the observed one, deleted for a loose one, refused for a member's last.
  const archived = await sql`select public.delete_situation(${ids.is1}::uuid) as out`;
  eq("delete_situation → archived for the observed situation", archived[0].out.outcome, "archived");
  const [is1Row] = await sql`select archived_at is not null as archived from public.situations where id = ${ids.is1}`;
  eq("the observed situation is archived, not gone", is1Row.archived, true);
  await sql`select public.set_item_situations('cue', ${ids.cue}::uuid, ${[ids.cs1]}::uuid[])`;
  const refused = await sql`select public.delete_situation(${ids.cs1}::uuid) as out`;
  eq("delete_situation → refused for a member's last live situation", [refused[0].out.ok, refused[0].out.failing?.[0]?.reason], [false, "no_situations"]);
  await as(sql, B);
  const deleted = await sql`select public.delete_situation(${ids.bc}::uuid) as out`;
  eq("delete_situation → deleted for a loose situation", deleted[0].out, { ok: true, outcome: "deleted", detached_from: [] });
  const [bLeft] = await sql`select count(*)::int as n from public.situations where user_id = ${B}`;
  eq("B keeps one situation", bLeft.n, 1);

  if (process.exitCode) fail("rehearsal assertions failed — do not push 0021");
  else console.log("all assertions passed");
}

(async () => {
  run("npx --no-install supabase db reset --version 0020");
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  let ids;
  try {
    ids = await seedLegacy(sql);
  } finally {
    await sql.end();
  }
  run("npx --no-install supabase migration up");
  const after = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await assertConverted(after, ids);
  } finally {
    await after.end();
  }
  run("npx --no-install supabase db reset");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
