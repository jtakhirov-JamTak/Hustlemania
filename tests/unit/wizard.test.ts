import { describe, expect, it } from "vitest";
import { BLOCKED_LINE, CONFIDENCE_QUESTION, type HintFacts, MANTRA_HINT, planHint, STEPS, stepHints } from "@/components/wizard/draft";

/** Every rung satisfied: the ladder answers null five times. */
const ready: HintFacts = {
  vision: true,
  area: true,
  outcome: "Save $8,000",
  amountValid: true,
  measurement: "money",
  currency: "USD",
  unit: "",
  usageValid: true,
  confidence: 7,
  celebration: "Dinner at the lake",
  mantra: "Boring money stays.",
  plan: null,
  impediments: 1,
  highest: true,
  proofOk: true,
  incomplete: null,
};

describe("the wizard's five steps", () => {
  it("names them in order and pins the copy the SPEC quotes", () => {
    expect(STEPS).toEqual(["Area & outcome", "Measure & goal", "Confidence & mantra", "Daily targets", "Impediments & cues"]);
    expect(BLOCKED_LINE).toBe("A sprint has to advance the vision; finish its three steps first.");
    expect(CONFIDENCE_QUESTION).toBe("How confident are you that you will be able to achieve the Sprint goal?");
    expect(MANTRA_HINT).toBe("A quote, a saying, or anything that inspires you or lifts you up when you are down.");
  });

  it("answers null on every step once every rung is satisfied", () => {
    expect(stepHints(ready)).toEqual([null, null, null, null, null]);
  });
});

describe("stepHints — the ladder, one rung at a time", () => {
  it("step 1: the vision, then an area, then the outcome", () => {
    expect(stepHints({ ...ready, vision: false, area: false, outcome: "" })[0]).toBe("Finish the vision first.");
    expect(stepHints({ ...ready, area: false, outcome: "" })[0]).toBe("Choose an area without an active sprint.");
    expect(stepHints({ ...ready, outcome: "   " })[0]).toBe("Describe the outcome.");
  });

  it("step 2: the amount, then the currency, the unit, the usage rows", () => {
    expect(stepHints({ ...ready, amountValid: false, currency: "" })[1]).toBe("Enter a whole-number goal above zero.");
    expect(stepHints({ ...ready, currency: "US" })[1]).toBe("Currency is a 3-letter code.");
    expect(stepHints({ ...ready, measurement: "hours", currency: "" })[1]).toBeNull();
    expect(stepHints({ ...ready, measurement: "quantity", unit: " " })[1]).toBe("Name the unit.");
    expect(stepHints({ ...ready, usageValid: false })[1]).toBe("Each usage row needs a label and an amount.");
  });

  it("step 3: the confidence, the celebration, the mantra — no why, no alignment", () => {
    expect(stepHints({ ...ready, confidence: null, celebration: "", mantra: "" })[2]).toBe("Pick a confidence from 1 to 10.");
    expect(stepHints({ ...ready, celebration: "", mantra: "" })[2]).toBe("Name a celebration.");
    expect(stepHints({ ...ready, mantra: " " })[2]).toBe("A mantra is required.");
    const all = stepHints({ ...ready, vision: false, area: false, outcome: "", amountValid: false, confidence: null, plan: "x", impediments: 0 }).join(" ");
    expect(all).not.toMatch(/why|vision checkbox|advances the vision|intention/i);
  });

  it("step 4: the plan hints alone", () => {
    expect(stepHints({ ...ready, plan: "The 14 targets must add up to the goal." })[3]).toBe("The 14 targets must add up to the goal.");
    expect(stepHints({ ...ready, plan: null, impediments: 0 })[3]).toBeNull();
  });

  it("step 5: the item hints — impediments, the highest, its response, a watched one still incomplete", () => {
    expect(stepHints({ ...ready, impediments: 0, highest: false, proofOk: false })[4]).toBe("Select 1–3 impediments.");
    expect(stepHints({ ...ready, highest: false, proofOk: false })[4]).toBe("Designate the highest impediment.");
    expect(stepHints({ ...ready, proofOk: false })[4]).toBe("The highest impediment needs THEN and a recovery criterion.");
    expect(stepHints({ ...ready, incomplete: "Phone distraction" })[4]).toBe("Phone distraction needs a THEN and a RECOVERED WHEN — make it the highest and complete it here, or finish it on the Impediments page.");
  });

  it("a plan hint never blocks step 5 and an item hint never blocks step 4", () => {
    const h = stepHints({ ...ready, plan: "Every day needs a whole-number target.", impediments: 0, highest: false, proofOk: false });
    expect(h[3]).toBe("Every day needs a whole-number target.");
    expect(h[4]).toBe("Select 1–3 impediments.");
  });
});

describe("planHint", () => {
  it("is silent in Same mode, asks for whole numbers, then for the sum", () => {
    expect(planHint({ mode: "same", customPlan: null, delta: 5 })).toBeNull();
    expect(planHint({ mode: "custom", customPlan: null, delta: null })).toBe("Every day needs a whole-number target.");
    expect(planHint({ mode: "custom", customPlan: [1], delta: -571 })).toBe("The 14 targets must add up to the goal.");
    expect(planHint({ mode: "custom", customPlan: [1], delta: 0 })).toBeNull();
  });
});
