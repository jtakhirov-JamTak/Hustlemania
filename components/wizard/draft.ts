import type { AreaKey } from "@/lib/areas";
import type { Measurement } from "@/lib/format";

/**
 * F18: the wizard's draft and its hint ladder, pure so the unit test can enumerate every
 * rung. The steps render the draft (`components/wizard/Step*.tsx`); the wizard owns the
 * state, the submit and the footer. No `why`, no vision checkbox, no intention: the
 * database rules guard every invariant the checkbox used to ask about.
 */
export type Draft = {
  area: AreaKey | null;
  outcome: string;
  measurement: Measurement;
  goalWhole: string;
  goalHours: string;
  goalMinutes: string;
  currency: string;
  unit: string;
  usage: { label: string; amount: string }[];
  startsTomorrow: boolean;
  confidence: number | null;
  celebration: string;
  mantra: string;
  mode: "same" | "custom";
  /** Raw custom-target inputs by day; parsed with parseTargetInput. */
  custom: string[];
  impedimentIds: string[];
  highestId: string | null;
  proofThen: string;
  proofRecover: string;
  cueIds: string[];
  /** F7: one of cueIds; follows the picks so it is never stale. */
  focusId: string | null;
};

export const STEPS = ["Area & outcome", "Measure & goal", "Confidence & mantra", "Daily targets", "Impediments & cues"] as const;

export const BLOCKED_LINE = "A sprint has to advance the vision; finish its three steps first.";
export const CONFIDENCE_QUESTION = "How confident are you that you will be able to achieve the Sprint goal?";
export const MANTRA_HINT = "A quote, a saying, or anything that inspires you or lifts you up when you are down.";

/** Step 4: what keeps a custom plan from starting; null in Same mode or once the 14 targets total the goal. */
export function planHint(f: { mode: "same" | "custom"; customPlan: number[] | null; delta: number | null }): string | null {
  if (f.mode !== "custom") return null;
  if (f.customPlan === null) return "Every day needs a whole-number target.";
  if (f.delta !== 0) return "The 14 targets must add up to the goal.";
  return null;
}

/** The facts each rung reads, already derived by the wizard. */
export type HintFacts = {
  vision: boolean;
  area: boolean;
  outcome: string;
  amountValid: boolean;
  measurement: Measurement;
  currency: string;
  unit: string;
  usageValid: boolean;
  confidence: number | null;
  celebration: string;
  mantra: string;
  /** `planHint`'s answer. */
  plan: string | null;
  impediments: number;
  highest: boolean;
  /** The highest has, or is being given, THEN and RECOVERED WHEN. */
  proofOk: boolean;
  /** A watched (non-highest) impediment still lacking its response, by name. */
  incomplete: string | null;
};

/** One hint per step, or null where the step may continue; the footer shows the current step's. */
export function stepHints(f: HintFacts): [string | null, string | null, string | null, string | null, string | null] {
  return [
    !f.vision ? "Finish the vision first." : !f.area ? "Choose an area without an active sprint." : !f.outcome.trim() ? "Describe the outcome." : null,
    !f.amountValid
      ? "Enter a whole-number goal above zero."
      : f.measurement === "money" && !/^[A-Za-z]{3}$/.test(f.currency)
        ? "Currency is a 3-letter code."
        : f.measurement === "quantity" && !f.unit.trim()
          ? "Name the unit."
          : !f.usageValid
            ? "Each usage row needs a label and an amount."
            : null,
    f.confidence === null ? "Pick a confidence from 1 to 10." : !f.celebration.trim() ? "Name a celebration." : !f.mantra.trim() ? "A mantra is required." : null,
    f.plan,
    f.impediments === 0
      ? "Select 1–3 impediments."
      : !f.highest
        ? "Designate the highest impediment."
        : !f.proofOk
          ? "The highest impediment needs THEN and a recovery criterion."
          : f.incomplete
            ? `${f.incomplete} needs a THEN and a RECOVERED WHEN — make it the highest and complete it here, or finish it on the Impediments page.`
            : null,
  ];
}
