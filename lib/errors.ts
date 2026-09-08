/**
 * The database raises short stable codes (see supabase/migrations). Map them to copy
 * here; anything unknown gets a generic line that promises the input is still there.
 */
const MESSAGES: Record<string, string> = {
  not_authenticated: "Your session ended. Sign in again to continue.",
  no_active_vision: "There is no active vision. Write it first.",
  vision_body_required: "Write the vision before saving.",
  vision_proof_required: "Name what would prove it happened.",
  vision_deadline_past: "The deadline must be in the future.",
  obstacle_pick_or_name: "Pick one impediment or name a new one, not both.",
  obstacle_not_global: "The main obstacle has to be a global impediment.",
  no_vision_obstacle: "Name the obstacle before writing its rule.",
  rule_incomplete: "WHEN, THEN and the recovery criterion are all required.",
  invalid_verdict: "That review answer is not one of the choices.",
  vision_obstacle: "This impediment is the vision's main obstacle. Change the obstacle on the Vision tab first.",
  visions_obstacle_id_fkey: "This impediment is the vision's main obstacle. Change the obstacle on the Vision tab first.",
  active_sprint_exists: "This area already has an active sprint.",
  invalid_start_date: "A sprint starts today or tomorrow.",
  invalid_tz: "Your browser's time zone was not recognised.",
  invalid_amount: "The goal must be a whole number above zero.",
  invalid_actual: "The actual must be zero or more.",
  day_not_found: "That day could not be found.",
  day_closed: "This day is already closed and locked.",
  day_in_future: "Only today or an earlier day can be closed.",
  sprint_not_active: "This sprint is no longer active.",
  sprint_not_found: "That sprint could not be found.",
  sprint_locked: "The goal, measurement and dates are locked once a sprint starts.",
  sprints_mantra_check: "A mantra is required.",
  sprints_outcome_check: "Describe the sprint outcome.",
  sprints_why_check: "Say why this sprint matters.",
  sprints_celebration_check: "Name a celebration.",
  sprints_confidence_check: "Confidence is a number from 1 to 10.",
  sprints_currency_check: "Currency is a 3-letter code like USD.",
  sprints_measurement_fields_check: "Money needs a currency, quantity needs a unit name.",
  visions_body_check: "Write something before saving the vision.",
  cues_name_check: "Give the cue a name.",
  impediments_name_check: "Give the impediment a name.",
  no_cues: "A sprint needs at least one execution cue.",
  too_many_cues: "A sprint carries at most three execution cues.",
  no_impediments: "A sprint needs at least one impediment.",
  too_many_impediments: "A sprint carries at most five impediments.",
  no_highest_impediment: "Designate one of the impediments as the highest.",
  proof_point_required: "The highest impediment needs a WHEN, a THEN and a RECOVERED WHEN.",
  item_not_found: "That item could not be found in your library.",
  item_archived: "That item is archived. Restore it first.",
  item_out_of_scope: "That item's scope does not cover this area.",
  item_not_offered: "That item was not part of the sprint on this day.",
  invalid_answer: "That answer is not one of the choices.",
  duplicate_item: "An item was answered twice.",
  response_required: "Say whether the response ran — Unsure is a truthful answer.",
  recovered_required: "Say whether you recovered — Unsure is a truthful answer.",
  response_not_applicable: "The response questions only apply when the highest impediment showed up.",
  no_focus_cue: "A sprint needs one focus cue among its execution cues.",
  already_in_sprint: "That item is already in this sprint.",
  not_in_sprint: "That item is not in this sprint.",
  invalid_scope: "Scope is Global, Health, Wealth or Relationships.",
  invalid_targets: "A plan has exactly 14 daily targets.",
  negative_target: "A daily target is zero or more.",
  target_precision: "Daily targets are whole units: whole currency, minutes, or whole items.",
  targets_sum_mismatch: "The 14 targets must add up to the sprint goal before saving.",
  target_locked: "Past days and today are locked. Only future days can change.",
  tasks_text_check: "Write the task before saving.",
  goal_not_reached: "Complete sprint unlocks once the closed days reach the goal.",
  window_passed: "The 14 days have passed. Finish the sprint instead.",
  sprint_running: "This sprint is still running.",
  sprint_finished: "This sprint is finished and its record is locked.",
  review_required: "Finish the last sprint's postmortem in this area before starting another.",
  review_exists: "This sprint already has a postmortem.",
  lesson_required: "Write the one lesson before finishing the review.",
  vision_answer_required: "Say whether the sprint moved the vision.",
  verdict_required: "Give the proof point a verdict.",
  verdict_not_applicable: "The highest impediment never showed up, so there is no verdict to give.",
  item_not_in_sprint: "That item was not part of this sprint.",
  one_highest_only: "Only one impediment can be promoted to highest.",
  invalid_decisions: "The carry-forward choices could not be read.",
  task_locked: "A task stays on the day it was written for.",
  "violates foreign key": "That item has sprint history, so it can only be archived.",
};

export const GENERIC_SAVE_ERROR = "That did not save. Your input is still here — try again.";

/** Rule 22 on the Impediments page: a proof edit that would leave the highest of an active sprint incomplete. */
export const HIGHEST_PROOF_EDIT_ERROR = "This is the highest impediment of an active sprint: WHEN, THEN and RECOVERED WHEN are all required.";

export function friendlyError(message: string | undefined | null): string {
  if (!message) return GENERIC_SAVE_ERROR;
  for (const [code, copy] of Object.entries(MESSAGES)) {
    if (message.includes(code)) return copy;
  }
  return GENERIC_SAVE_ERROR;
}

/** Why an archive or scope change was blocked for one sprint (archive_item / set_item_scope). */
export function blockedReason(reason: string): string {
  switch (reason) {
    case "no_cues":
      return "it would be left without an execution cue";
    case "no_impediments":
      return "it would be left without an impediment";
    case "no_highest_impediment":
      return "this is its highest impediment";
    case "no_focus_cue":
      return "this is its focus cue";
    case "proof_point_required":
      return "its highest impediment would lack a WHEN, a THEN or a RECOVERED WHEN";
    default:
      return "it would become invalid";
  }
}
