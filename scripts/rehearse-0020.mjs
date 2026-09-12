// Rehearses migration 0020 (F16) against legacy-shaped rows on the LOCAL stack only:
//   1. `supabase db reset --version 0019`  — the schema as the hosted project has it today
//   2. seed two users through the 0011 / 0019 vision functions (the pre-F16 shape):
//      A has all three F9 steps plus the two optional prompts and an INTERFERES text,
//      B has the vision text alone
//   3. `supabase migration up`             — applies 0020 and nothing else
//   4. assert the schema and the kept rows, prove the sprint gate, exit non-zero on any
//      mismatch
// then `supabase db reset` to leave the stack at HEAD for the test suites.
//
// Run: npx tsx --env-file=.env.local scripts/rehearse-0020.mjs
// The real rehearsal is the same steps over a restored hosted dump (RUNBOOK_RESTORE
// §"Restore into the local stack"); this script is the version a machine without the
// dump can run, and the one that turns red if the column drops, the nullable body or
// the `vision_incomplete` gate are dropped from the migration.

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
  // User A: the full F9 vision with meaning and baseline, an obstacle named on the spot
  // with an INTERFERES text, and the rule written through the 0019 function.
  await as(sql, A);
  const [vision] = await sql`select public.save_vision('A one-year vision', '2099-01-01', 'A signed lease', 'It matters', 'Where I stand') as id`;
  const [obstacle] = await sql`select public.set_vision_obstacle(null, 'Starting late', 'the first hour is gone') as id`;
  await sql`select public.set_vision_rule('I notice delaying', 'timer', 'running in 10')`;
  // A sprint member needs a situation (F15); the obstacle gets one so the gate, not
  // `no_situations`, is what answers below.
  const [sit] = await sql`insert into public.situations (user_id, kind, name) values (${A}, 'impediment', 'Starting late') returning id`;
  await sql`select public.set_item_situations('impediment', ${obstacle.id}::uuid, ${[sit.id]}::uuid[])`;
  // User B: the vision text alone (F9 let this start a sprint; F16 does not).
  await as(sql, B);
  const [visionB] = await sql`select public.save_vision('B vision', '2099-01-01', 'B proof') as id`;
  return { vision: vision.id, obstacle: obstacle.id, visionB: visionB.id };
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

  const cols = await sql`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'visions' order by column_name`;
  eq("visions columns", cols.map((c) => c.column_name), ["archived_at", "body", "confidence", "confidence_reason", "created_at", "deadline", "id", "obstacle_id", "picture", "proof", "updated_at", "user_id"]);
  const [dropped] = await sql`select count(*)::int as n from information_schema.columns where table_schema = 'public' and table_name = 'impediments' and column_name = 'explanation'`;
  eq("impediments.explanation dropped", dropped.n, 0);
  const [cueNote] = await sql`select count(*)::int as n from information_schema.columns where table_schema = 'public' and table_name = 'cues' and column_name = 'explanation'`;
  eq("cues.explanation kept", cueNote.n, 1);

  const [a] = await sql`select body, proof, to_char(deadline, 'YYYY-MM-DD') as deadline, obstacle_id, picture, confidence, confidence_reason from public.visions where id = ${ids.vision}`;
  eq("A's vision keeps body / proof / deadline / obstacle; the new columns start null", [a.body, a.proof, a.deadline, a.obstacle_id === ids.obstacle, a.picture, a.confidence, a.confidence_reason], ["A one-year vision", "A signed lease", "2099-01-01", true, null, null, null]);
  const [imp] = await sql`select name, proof_then, proof_recover, scope from public.impediments where id = ${ids.obstacle}`;
  eq("A's obstacle keeps WHEN (name), THEN, RECOVERED WHEN and its global scope", [imp.name, imp.proof_then, imp.proof_recover, imp.scope], ["I notice delaying", "timer", "running in 10", "global"]);
  const [fns] = await sql`select array_agg(proname order by proname) as names from pg_proc where pronamespace = 'public'::regnamespace and proname in ('save_vision', 'set_vision_rule', 'save_vision_picture', 'save_vision_goal', 'set_vision_obstacle')`;
  eq("old entry points gone, new ones present", fns.names, ["save_vision_goal", "save_vision_picture", "set_vision_obstacle"]);

  // The gate: neither legacy user can start a sprint until the picture is saved.
  const startArgs = (imps, highest) =>
    sql`select public.start_sprint('wealth','o','money','USD',null,1400,7,'w','c','m','[]','UTC', current_date, '{}'::uuid[], ${imps}::uuid[], ${highest}::uuid, null::uuid) as id`;
  await as(sql, A);
  await rejects("A (3 of 3 before F16, no picture) → vision_incomplete", startArgs([ids.obstacle], ids.obstacle), "vision_incomplete");
  await sql`select public.save_vision_picture('A morning run before the kids wake')`;
  const [s] = await startArgs([ids.obstacle], ids.obstacle);
  eq("A starts a sprint once the picture is saved", typeof s.id, "string");
  const [d1] = await sql`select id from public.sprint_days where sprint_id = ${s.id} and day_index = 1`;
  const offered = await sql`select kind, explanation from public.day_offered_items(${d1.id}::uuid)`;
  eq("day_offered_items answers with a null explanation for the impediment", offered.map((r) => [r.kind, r.explanation]), [["impediment", null]]);
  await as(sql, B);
  const [bImp] = await sql`insert into public.impediments (user_id, name, proof_then, proof_recover) values (${B}, 'Doomscrolling', 'phone away', 'task open') returning id`;
  const [bSit] = await sql`insert into public.situations (user_id, kind, name) values (${B}, 'impediment', 'Late night') returning id`;
  await sql`select public.set_item_situations('impediment', ${bImp.id}::uuid, ${[bSit.id]}::uuid[])`;
  await rejects("B (text only) → vision_incomplete", startArgs([bImp.id], bImp.id), "vision_incomplete");
  const [b] = await sql`select body, obstacle_id, picture from public.visions where id = ${ids.visionB}`;
  eq("B's vision row survives with its text, no obstacle, no picture", [b.body, b.obstacle_id, b.picture], ["B vision", null, null]);

  if (process.exitCode) fail("rehearsal assertions failed — do not push 0020");
  else console.log("all assertions passed");
}

(async () => {
  run("npx --no-install supabase db reset --version 0019");
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
