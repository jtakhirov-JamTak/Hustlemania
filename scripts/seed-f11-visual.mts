/**
 * Throwaway seed for F11's visual check: two finished, reviewed Wealth sprints and one
 * Health sprint, with enough logged days that every card has a real comparison and the
 * recurring note has two sprints to agree about.
 *
 * Service-role writes on purpose — `close_day` only closes today, and this needs a
 * history. Run against the LOCAL stack only; `adminClient` refuses a non-loopback host.
 *
 * The statuses are forced, so a row can read "Under · 78% of goal · sprint complete",
 * which the app itself cannot produce: `complete_sprint` refuses below the goal. Do not
 * read the captures as evidence that combination is reachable.
 *
 *   npx tsx --env-file=.env.local scripts/seed-f11-visual.mts
 *
 * Deleted with the mockup once F11 is verified.
 */

import { adminClient, localSupabaseUrl } from "../tests/support/local";
import { insertSprintRows } from "../tests/support/sprints";
import { addDays } from "../lib/sprintDay";

const admin = adminClient(localSupabaseUrl("seed"));
const EMAIL = "f11-visual@example.com";

const IMPS = [
  { name: "Starting late", when: "the first hour is gone", then: "set a 10-minute timer and start the smallest task", recover: "the first task is done before 10am", highest: true },
  { name: "Phone in the room", when: null, then: null, recover: null, highest: false },
];
const CUES = [
  { name: "First hour is outreach", when: "the laptop opens", focus: true },
  { name: "Inbox closed till noon", when: "the day starts", focus: false },
];

/** Per closed day: actual as a share of target, and the day's answers. */
type Day = { share: number; late: "yes" | "no" | "unsure"; phone: "yes" | "no"; outreach: "yes" | "no"; inbox: "yes" | "no"; response?: "yes" | "no" | "partially" | "unsure"; recovered?: "yes" | "no" | "unsure"; impact?: "a_lot" | "some" | "nothing" };

const AUG: Day[] = [
  { share: 0.6, late: "yes", phone: "yes", outreach: "no", inbox: "no", response: "no", recovered: "no", impact: "a_lot" },
  { share: 1.2, late: "no", phone: "no", outreach: "yes", inbox: "yes" },
  { share: 0.55, late: "yes", phone: "yes", outreach: "no", inbox: "yes", response: "yes", recovered: "no", impact: "a_lot" },
  { share: 1.1, late: "no", phone: "no", outreach: "yes", inbox: "yes" },
  { share: 0.7, late: "yes", phone: "yes", outreach: "yes", inbox: "no", response: "yes", recovered: "yes", impact: "some" },
  { share: 0.95, late: "no", phone: "yes", outreach: "yes", inbox: "no" },
  { share: 1.3, late: "no", phone: "no", outreach: "yes", inbox: "yes" },
  { share: 0.65, late: "yes", phone: "yes", outreach: "no", inbox: "no", response: "partially", recovered: "no", impact: "a_lot" },
  { share: 1.05, late: "no", phone: "no", outreach: "yes", inbox: "yes" },
  { share: 0.9, late: "unsure", phone: "no", outreach: "yes", inbox: "no" },
  { share: 1.15, late: "no", phone: "no", outreach: "yes", inbox: "yes" },
  { share: 0.8, late: "yes", phone: "yes", outreach: "no", inbox: "no", response: "yes", recovered: "yes", impact: "some" },
];

const JUL: Day[] = [
  { share: 0.7, late: "yes", phone: "yes", outreach: "no", inbox: "no", response: "no", recovered: "no", impact: "a_lot" },
  { share: 1.0, late: "no", phone: "no", outreach: "yes", inbox: "yes" },
  { share: 0.75, late: "yes", phone: "yes", outreach: "yes", inbox: "no", response: "yes", recovered: "yes", impact: "some" },
  { share: 0.9, late: "no", phone: "yes", outreach: "yes", inbox: "yes" },
  { share: 0.6, late: "yes", phone: "yes", outreach: "no", inbox: "no", response: "no", recovered: "no", impact: "a_lot" },
  { share: 1.1, late: "no", phone: "no", outreach: "yes", inbox: "yes" },
  { share: 0.85, late: "no", phone: "no", outreach: "no", inbox: "no" },
  { share: 1.2, late: "no", phone: "no", outreach: "yes", inbox: "yes" },
  { share: 0.5, late: "yes", phone: "yes", outreach: "no", inbox: "no", response: "yes", recovered: "no", impact: "a_lot" },
];

async function reset() {
  const existing = await admin.auth.admin.listUsers();
  if (existing.error) throw new Error(existing.error.message);
  const found = existing.data.users.find((u) => u.email === EMAIL);
  if (found) await admin.auth.admin.deleteUser(found.id);

  const created = await admin.auth.admin.createUser({ email: EMAIL, email_confirm: true });
  if (created.error) throw new Error(created.error.message);
  return created.data.user!.id;
}

async function library(userId: string) {
  const imps = await admin
    .from("impediments")
    .insert(IMPS.map((i, rank) => ({ user_id: userId, name: i.name, scope: "global", rank, proof_when: i.when, proof_then: i.then, proof_recover: i.recover })))
    .select("id, name");
  if (imps.error) throw new Error(`impediments: ${imps.error.message}`);

  const cues = await admin
    .from("cues")
    .insert(CUES.map((c, rank) => ({ user_id: userId, name: c.name, scope: "global", rank, cue_when: c.when })))
    .select("id, name");
  if (cues.error) throw new Error(`cues: ${cues.error.message}`);

  const id = (rows: { id: string; name: string }[], name: string) => rows.find((r) => r.name === name)!.id;
  return {
    late: id(imps.data, "Starting late"),
    phone: id(imps.data, "Phone in the room"),
    outreach: id(cues.data, "First hour is outreach"),
    inbox: id(cues.data, "Inbox closed till noon"),
  };
}

type Ids = Awaited<ReturnType<typeof library>>;

async function sprint(userId: string, ids: Ids, opts: { start: string; area: string; outcome: string; target: number; days: Day[]; status: string; lesson: string }) {
  const { sprintId, dayIds } = await insertSprintRows(admin, userId, { startDate: opts.start, tz: "UTC", area: opts.area, target: opts.target, outcome: opts.outcome, mantra: "One more call." });

  const members = await Promise.all([
    admin.from("sprint_impediments").insert([
      { sprint_id: sprintId, user_id: userId, impediment_id: ids.late, is_highest: true },
      { sprint_id: sprintId, user_id: userId, impediment_id: ids.phone, is_highest: false },
    ]),
    admin.from("sprint_cues").insert([
      { sprint_id: sprintId, user_id: userId, cue_id: ids.outreach, is_focus: true },
      { sprint_id: sprintId, user_id: userId, cue_id: ids.inbox, is_focus: false },
    ]),
  ]);
  for (const m of members) if (m.error) throw new Error(`membership: ${m.error.message}`);

  const highest = IMPS[0];
  for (const [i, day] of opts.days.entries()) {
    const closed = await admin
      .from("sprint_days")
      .update({
        actual: Math.round(opts.target * day.share),
        closed_at: new Date(`${addDays(opts.start, i)}T18:00:00Z`).toISOString(),
        closed_on_time: true,
        highest_impediment_id: ids.late,
        proof_when: highest.when,
        proof_then: highest.then,
        proof_recover: highest.recover,
        response: day.response ?? null,
        recovered: day.recovered ?? null,
        impact: day.impact ?? null,
      })
      .eq("id", dayIds[i]);
    if (closed.error) throw new Error(`day ${i + 1}: ${closed.error.message}`);

    const obs = await Promise.all([
      admin.from("day_impediment_observations").insert([
        { sprint_day_id: dayIds[i], user_id: userId, impediment_id: ids.late, name: IMPS[0].name, occurred: day.late, was_highest: true },
        { sprint_day_id: dayIds[i], user_id: userId, impediment_id: ids.phone, name: IMPS[1].name, occurred: day.phone, was_highest: false },
      ]),
      admin.from("day_cue_observations").insert([
        { sprint_day_id: dayIds[i], user_id: userId, cue_id: ids.outreach, name: CUES[0].name, cue_when: CUES[0].when, used: day.outreach, was_focus: true },
        { sprint_day_id: dayIds[i], user_id: userId, cue_id: ids.inbox, name: CUES[1].name, cue_when: CUES[1].when, used: day.inbox, was_focus: false },
      ]),
    ]);
    for (const o of obs) if (o.error) throw new Error(`observations day ${i + 1}: ${o.error.message}`);
  }

  const finish = await admin.from("sprints").update({ status: opts.status, closed_at: new Date().toISOString() }).eq("id", sprintId);
  if (finish.error) throw new Error(`finish: ${finish.error.message}`);

  const review = await admin.from("reviews").insert({ user_id: userId, sprint_id: sprintId, lesson: opts.lesson, moved_vision: true, verdict: "partly" }).select("id").single();
  if (review.error) throw new Error(`review: ${review.error.message}`);

  const decisions = await admin.from("review_decisions").insert([
    { review_id: review.data.id, user_id: userId, kind: "impediment", item_id: ids.late, decision: "highest" },
    { review_id: review.data.id, user_id: userId, kind: "impediment", item_id: ids.phone, decision: "keep" },
    { review_id: review.data.id, user_id: userId, kind: "cue", item_id: ids.outreach, decision: "keep" },
    { review_id: review.data.id, user_id: userId, kind: "cue", item_id: ids.inbox, decision: "test_more" },
  ]);
  if (decisions.error) throw new Error(`decisions: ${decisions.error.message}`);

  return sprintId;
}

const userId = await reset();
const ids = await library(userId);

const today = new Date().toISOString().slice(0, 10);
await sprint(userId, ids, { start: addDays(today, -20), area: "wealth", outcome: "Land three retainer clients", target: 100, days: AUG, status: "completed", lesson: "Outreach only happens when it is the first thing on the list." });
await sprint(userId, ids, { start: addDays(today, -40), area: "wealth", outcome: "Bank the side income", target: 120, days: JUL, status: "ended", lesson: "Two calls before email, or the morning is gone." });
await sprint(userId, ids, { start: addDays(today, -60), area: "health", outcome: "Ship the strength base", target: 30, days: JUL.slice(0, 5), status: "ended_early", lesson: "Shoes by the door is the whole trick." });

console.log(`seeded ${EMAIL} (${userId}) — three finished sprints, two in Wealth`);
