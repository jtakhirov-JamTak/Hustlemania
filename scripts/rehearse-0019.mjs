// Rehearses migration 0019 (F15) against legacy-shaped rows on the LOCAL stack only:
//   1. `supabase db reset --version 0018`  — the schema as the hosted project has it today
//   2. seed two users through the 0010 close_day (the pre-F15 payload)
//   3. `supabase migration up`             — applies 0019 and nothing else
//   4. assert the conversion, print the counts, exit non-zero on any mismatch
// then `supabase db reset` to leave the stack at HEAD for the test suites.
//
// Run: npx tsx --env-file=.env.local scripts/rehearse-0019.mjs
// The real rehearsal is the same steps over a restored hosted dump (RUNBOOK_RESTORE
// §"Restore into the local stack"); this script is the version a machine without the
// dump can run, and the one that turns red if the coalesce or the observation copy is
// dropped from the migration.

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
  // User A: an impediment with a WHEN (name becomes the WHEN), one without (name stays),
  // a cue with a WHEN and one without, a closed day with the highest occurred + recovered.
  await as(sql, A);
  const [imp] = await sql`insert into public.impediments (user_id, name, proof_when, proof_then, proof_recover) values (${A}, 'Starting late', 'I notice delaying', 'timer', 'running in 10') returning id`;
  const [imp2] = await sql`insert into public.impediments (user_id, name, proof_then, proof_recover) values (${A}, 'Phone distraction', 'drawer', 'shut in a minute') returning id`;
  const [cue] = await sql`insert into public.cues (user_id, name, cue_when) values (${A}, 'Ask what it pays', 'I schedule anything') returning id`;
  const [cue2] = await sql`insert into public.cues (user_id, name) values (${A}, 'Shoes by the door') returning id`;
  await sql`select public.save_vision('v', '2099-01-01', 'p')`;
  const [s] = await sql`select public.start_sprint('wealth','o','money','USD',null,1400,7,'w','c','m','[]','UTC', current_date, ${[cue.id, cue2.id]}::uuid[], ${[imp.id, imp2.id]}::uuid[], ${imp.id}::uuid, ${cue.id}::uuid) as id`;
  const [d1] = await sql`select id from public.sprint_days where sprint_id = ${s.id} and day_index = 1`;
  await sql`select public.close_day(${d1.id}::uuid, 100::bigint, null::text, ${sql.json([{ item_id: imp.id, answer: "yes" }, { item_id: imp2.id, answer: "no" }])}, ${sql.json([{ item_id: cue.id, answer: "yes" }, { item_id: cue2.id, answer: "unsure" }])}, 'yes', 'no', 'some')`;
  // User B: one bare impediment, no sprint.
  await as(sql, B);
  await sql`insert into public.impediments (user_id, name) values (${B}, 'Doomscrolling')`;
  return { imp: imp.id, imp2: imp2.id, cue: cue.id, cue2: cue2.id, day: d1.id };
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
  const [counts] = await sql`select (select count(*)::int from public.situations) as situations, (select count(*)::int from public.impediments) as impediments, (select count(*)::int from public.cues) as cues`;
  eq("situations = impediments + cues", counts.situations, counts.impediments + counts.cues);
  const [unattached] = await sql`
    select (select count(*)::int from public.impediments i where not exists (select 1 from public.impediment_situations a where a.impediment_id = i.id))
         + (select count(*)::int from public.cues c where not exists (select 1 from public.cue_situations a where a.cue_id = c.id)) as n`;
  eq("items without a situation", unattached.n, 0);
  const names = await sql`select name from public.impediments where id in (${ids.imp}, ${ids.imp2}) order by name`;
  eq("impediment names (WHEN moved in; the bare one kept its name)", names.map((r) => r.name), ["I notice delaying", "Phone distraction"]);
  const sits = await sql`select kind, name from public.situations where user_id = ${A} order by kind, name`;
  eq("A's situations (old SITUATION names; a cue's WHEN or REMIND)", sits.map((r) => `${r.kind}:${r.name}`), ["cue:I schedule anything", "cue:Shoes by the door", "impediment:Phone distraction", "impediment:Starting late"]);
  const legacy = await sql`select name, occurred, recovered from public.day_impediment_situation_observations order by name`;
  eq("legacy day → situation rows (highest recovered 'no' copied, other not occurred)", legacy.map((r) => [r.name, r.occurred, r.recovered]), [["Phone distraction", false, null], ["Starting late", true, "no"]]);
  const cueLegacy = await sql`select name, applied from public.day_cue_situation_observations order by name`;
  eq("legacy cue rows → applied follows used", cueLegacy.map((r) => [r.name, r.applied]), [["I schedule anything", true], ["Shoes by the door", false]]);
  const [snap] = await sql`select proof_then, proof_recover from public.day_impediment_observations where impediment_id = ${ids.imp}`;
  eq("proof snapshot copied onto the highest's observation row", [snap.proof_then, snap.proof_recover], ["timer", "running in 10"]);
  const [day] = await sql`select response, recovered, impact from public.sprint_days where id = ${ids.day}`;
  eq("legacy day columns untouched", [day.response, day.recovered, day.impact], ["yes", "no", "some"]);
  const [dropped] = await sql`select count(*)::int as n from information_schema.columns where table_schema = 'public' and table_name = 'impediments' and column_name = 'proof_when'`;
  eq("impediments.proof_when dropped", dropped.n, 0);
  const [rec] = await sql`select occurrences, answered, recovered from public.insight_response_recovery((select sprint_id from public.sprint_days where id = ${ids.day})) where item_id = ${ids.imp}`;
  eq("legacy recovery feeds the new card", [rec.occurrences, rec.answered, rec.recovered], [1, 1, 0]);
  if (process.exitCode) fail("conversion assertions failed — do not push 0019");
  else console.log("all assertions passed");
}

(async () => {
  run("npx --no-install supabase db reset --version 0018");
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
    // insight_response_recovery is SECURITY DEFINER and checks ownership from the JWT.
    await as(after, A);
    await assertConverted(after, ids);
  } finally {
    await after.end();
  }
  run("npx --no-install supabase db reset");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
