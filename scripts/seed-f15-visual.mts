/**
 * Throwaway seed for F15's visual check: one user with impediment and cue situations,
 * a blocked item of each kind (no situation yet), a finished, reviewed Wealth sprint
 * whose closed days carry situation observations (thin data: four occurrences, half
 * recovered) and an active Wealth sprint started today with Day 1 open.
 *
 * Service-role writes on purpose; LOCAL stack only (`adminClient` refuses a
 * non-loopback host).
 *
 *   npx tsx --env-file=.env.local scripts/seed-f15-visual.mts
 *
 * Deleted once F15 is verified.
 */

import { adminClient, localSupabaseUrl } from "../tests/support/local";
import { insertSprintRows } from "../tests/support/sprints";
import { addDays } from "../lib/sprintDay";

const admin = adminClient(localSupabaseUrl("seed"));
const EMAIL = "f15-visual@example.com";

const LATE = { name: "I notice myself delaying my first work block", explanation: "the first hour is gone", then: "I start a 10-minute timer on the smallest executable task", recover: "The timer is running within 10 minutes" };
const PHONE = { name: "I reach for the phone between tasks", explanation: null, then: "Phone goes in the drawer", recover: "The drawer is shut and the next task is open" };
const OUTREACH = { name: "Ask how much this pays", when: "I schedule anything" };
const INBOX = { name: "Inbox closed till noon", when: "the day starts" };

type Day = { share: number; late: "yes" | "no" | "unsure"; sits?: ("S1" | "S2" | "S3")[]; rec?: ("yes" | "no" | null)[]; outreach: "yes" | "no"; cueSits?: ("C1" | "C2")[] };

const DAYS: Day[] = [
  { share: 0.6, late: "yes", sits: ["S1"], rec: ["no"], outreach: "no" },
  { share: 1.2, late: "no", outreach: "yes", cueSits: ["C1"] },
  { share: 0.55, late: "yes", sits: ["S1", "S2"], rec: ["yes", null], outreach: "no" },
  { share: 1.1, late: "no", outreach: "yes", cueSits: ["C1", "C2"] },
  { share: 0.7, late: "yes", sits: ["S1"], rec: ["no"], outreach: "yes", cueSits: ["C2"] },
  { share: 0.95, late: "no", outreach: "yes", cueSits: ["C1"] },
  { share: 1.3, late: "no", outreach: "yes", cueSits: ["C1"] },
  { share: 0.65, late: "yes", sits: ["S1", "S3"], rec: ["yes", "no"], outreach: "no" },
  { share: 1.05, late: "no", outreach: "yes", cueSits: ["C1"] },
  { share: 0.9, late: "unsure", outreach: "yes", cueSits: ["C2"] },
  { share: 1.15, late: "no", outreach: "yes", cueSits: ["C1"] },
  { share: 0.8, late: "no", outreach: "no" },
];

/** Throws on the error arm; returns the success arm's data (the Supabase result unions carry `error: null` there). */
function must<R extends { data: unknown; error: { message: string } | null }>(res: R, label: string): Extract<R, { error: null }>["data"] {
  if (res.error) throw new Error(`${label}: ${res.error.message}`);
  return res.data as Extract<R, { error: null }>["data"];
}

async function reset() {
  const existing = must(await admin.auth.admin.listUsers(), "listUsers");
  const found = existing.users.find((u) => u.email === EMAIL);
  if (found) await admin.auth.admin.deleteUser(found.id);
  const created = must(await admin.auth.admin.createUser({ email: EMAIL, email_confirm: true }), "createUser");
  return created.user!.id;
}

async function library(userId: string) {
  const sits = must(
    await admin
      .from("situations")
      .insert([
        { user_id: userId, kind: "impediment", name: "Starting late", rank: 1 },
        { user_id: userId, kind: "impediment", name: "Late night before", rank: 2 },
        { user_id: userId, kind: "impediment", name: "After lunch", rank: 3 },
        { user_id: userId, kind: "cue", name: "Scheduling", rank: 1 },
        { user_id: userId, kind: "cue", name: "Any meeting", rank: 2 },
      ])
      .select("id, kind, name"),
    "situations",
  );
  const sit = (kind: string, name: string) => sits.find((s) => s.kind === kind && s.name === name)!.id;
  const S = { S1: sit("impediment", "Starting late"), S2: sit("impediment", "Late night before"), S3: sit("impediment", "After lunch") };
  const C = { C1: sit("cue", "Scheduling"), C2: sit("cue", "Any meeting") };

  const imps = must(
    await admin
      .from("impediments")
      .insert([
        { user_id: userId, name: LATE.name, explanation: LATE.explanation, scope: "global", rank: 1, proof_then: LATE.then, proof_recover: LATE.recover },
        { user_id: userId, name: PHONE.name, explanation: PHONE.explanation, scope: "global", rank: 2, proof_then: PHONE.then, proof_recover: PHONE.recover },
      ])
      .select("id, name"),
    "impediments",
  );
  const cues = must(
    await admin
      .from("cues")
      .insert([
        { user_id: userId, name: OUTREACH.name, scope: "global", rank: 1, cue_when: OUTREACH.when },
        { user_id: userId, name: INBOX.name, scope: "global", rank: 2, cue_when: INBOX.when },
      ])
      .select("id, name"),
    "cues",
  );
  const late = imps.find((r) => r.name === LATE.name)!.id;
  const outreach = cues.find((r) => r.name === OUTREACH.name)!.id;

  must(await admin.from("impediment_situations").insert([S.S1, S.S2, S.S3].map((situation_id) => ({ user_id: userId, impediment_id: late, situation_id }))), "impediment_situations");
  must(await admin.from("cue_situations").insert([C.C1, C.C2].map((situation_id) => ({ user_id: userId, cue_id: outreach, situation_id }))), "cue_situations");

  return { late, outreach, S, C, sitName: (id: string) => sits.find((s) => s.id === id)!.name };
}

type Ids = Awaited<ReturnType<typeof library>>;

async function members(sprintId: string, userId: string, ids: Ids) {
  must(await admin.from("sprint_impediments").insert({ sprint_id: sprintId, user_id: userId, impediment_id: ids.late, is_highest: true }), "sprint_impediments");
  must(await admin.from("sprint_cues").insert({ sprint_id: sprintId, user_id: userId, cue_id: ids.outreach, is_focus: true }), "sprint_cues");
}

async function finished(userId: string, ids: Ids, start: string) {
  const target = 100;
  const { sprintId, dayIds } = await insertSprintRows(admin, userId, { startDate: start, tz: "UTC", area: "wealth", target, outcome: "Land three retainer clients", mantra: "One more call." });
  await members(sprintId, userId, ids);

  for (const [i, day] of DAYS.entries()) {
    must(
      await admin
        .from("sprint_days")
        .update({ actual: Math.round(target * day.share), closed_at: new Date(`${addDays(start, i)}T18:00:00Z`).toISOString(), closed_on_time: true, highest_impediment_id: ids.late })
        .eq("id", dayIds[i]),
      `day ${i + 1}`,
    );
    const imp = must(
      await admin
        .from("day_impediment_observations")
        .insert({ sprint_day_id: dayIds[i], user_id: userId, impediment_id: ids.late, name: LATE.name, occurred: day.late, was_highest: true, proof_then: LATE.then, proof_recover: LATE.recover })
        .select("id")
        .single(),
      `imp obs day ${i + 1}`,
    );
    const ticked = day.sits ?? [];
    must(
      await admin.from("day_impediment_situation_observations").insert(
        (["S1", "S2", "S3"] as const).map((k) => {
          const at = ticked.indexOf(k);
          return { observation_id: imp.id, user_id: userId, situation_id: ids.S[k], name: ids.sitName(ids.S[k]), occurred: at >= 0, recovered: at >= 0 ? (day.rec?.[at] ?? null) : null };
        }),
      ),
      `imp sit obs day ${i + 1}`,
    );
    const cue = must(
      await admin
        .from("day_cue_observations")
        .insert({ sprint_day_id: dayIds[i], user_id: userId, cue_id: ids.outreach, name: OUTREACH.name, cue_when: OUTREACH.when, used: day.outreach, was_focus: true })
        .select("id")
        .single(),
      `cue obs day ${i + 1}`,
    );
    const applied = day.cueSits ?? [];
    must(
      await admin.from("day_cue_situation_observations").insert(
        (["C1", "C2"] as const).map((k) => ({ observation_id: cue.id, user_id: userId, situation_id: ids.C[k], name: ids.sitName(ids.C[k]), applied: applied.includes(k) })),
      ),
      `cue sit obs day ${i + 1}`,
    );
  }

  must(await admin.from("sprints").update({ status: "completed", closed_at: new Date().toISOString() }).eq("id", sprintId), "finish");
  const review = must(
    await admin.from("reviews").insert({ user_id: userId, sprint_id: sprintId, lesson: "Outreach only happens when it is the first thing on the list.", moved_vision: true, verdict: "partly" }).select("id").single(),
    "review",
  );
  must(
    await admin.from("review_decisions").insert([
      { review_id: review.id, user_id: userId, kind: "impediment", item_id: ids.late, decision: "highest" },
      { review_id: review.id, user_id: userId, kind: "cue", item_id: ids.outreach, decision: "keep" },
    ]),
    "decisions",
  );
  return sprintId;
}

const userId = await reset();
const ids = await library(userId);
const today = new Date().toISOString().slice(0, 10);
const done = await finished(userId, ids, addDays(today, -20));
const { sprintId: active } = await insertSprintRows(admin, userId, { startDate: today, tz: "UTC", area: "wealth", target: 100, outcome: "Bank the side income", mantra: "One more call." });
await members(active, userId, ids);

console.log(`seeded ${EMAIL} (${userId}) — finished sprint ${done}, active sprint ${active}`);
