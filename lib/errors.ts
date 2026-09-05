/**
 * The database raises short stable codes (see supabase/migrations). Map them to copy
 * here; anything unknown gets a generic line that promises the input is still there.
 */
const MESSAGES: Record<string, string> = {
  not_authenticated: "Your session ended. Sign in again to continue.",
  no_active_vision: "Write this area's 1-year vision before starting a sprint.",
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
  proof_point_required: "The highest impediment needs both a WHEN and a THEN.",
  item_not_found: "That item could not be found in your library.",
  item_archived: "That item is archived. Restore it first.",
  item_out_of_scope: "That item's scope does not cover this area.",
  item_not_offered: "That item was not part of the sprint on this day.",
  most_damaging_required: "Pick the one impediment that hurt most.",
  most_useful_required: "Pick the one cue that helped most.",
  already_in_sprint: "That item is already in this sprint.",
  not_in_sprint: "That item is not in this sprint.",
  invalid_scope: "Scope is Global, Health, Wealth or Relationships.",
  invalid_targets: "A plan has exactly 14 daily targets.",
  negative_target: "A daily target is zero or more.",
  target_precision: "Daily targets are whole units: whole currency, minutes, or whole items.",
  targets_sum_mismatch: "The 14 targets must add up to the sprint goal before saving.",
  target_locked: "Past days and today are locked. Only future days can change.",
  tasks_text_check: "Write the task before saving.",
  task_locked: "A task stays on the day it was written for.",
  "violates foreign key": "That item has sprint history, so it can only be archived.",
  "Signups not allowed": "This email is not on the invite list.",
  otp_disabled: "This email is not on the invite list.",
  signup_disabled: "This email is not on the invite list.",
};

export const GENERIC_SAVE_ERROR = "That did not save. Your input is still here — try again.";

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
    case "proof_point_required":
      return "its highest impediment would lack a WHEN → THEN";
    default:
      return "it would become invalid";
  }
}
