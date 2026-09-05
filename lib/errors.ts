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
  sprint_locked: "The goal, measurement and dates are locked once a sprint starts.",
  sprints_mantra_check: "A mantra is required.",
  sprints_outcome_check: "Describe the sprint outcome.",
  sprints_why_check: "Say why this sprint matters.",
  sprints_celebration_check: "Name a celebration.",
  sprints_confidence_check: "Confidence is a number from 1 to 10.",
  sprints_currency_check: "Currency is a 3-letter code like USD.",
  sprints_measurement_fields_check: "Money needs a currency, quantity needs a unit name.",
  visions_body_check: "Write something before saving the vision.",
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
