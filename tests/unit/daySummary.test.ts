import { describe, expect, it } from "vitest";
import { daySummaryLine, NO_OBSERVATIONS, quietItems, showedUpTail, type DayObservations } from "@/lib/daySummary";

const imp = (name: string, occurred: string, was_highest = false) => ({ id: `imp-${name}`, name, occurred, was_highest });
const cue = (name: string, used: string, was_focus = false) => ({ id: `cue-${name}`, name, used, was_focus });
const none = { response: null, recovered: null, impact: null };

describe("daySummaryLine", () => {
  it("joins the four groups with a middle dot, the highest first among the obstacles", () => {
    const obs: DayObservations = {
      impediments: [imp("Phone distraction", "yes"), imp("Starting late", "yes", true)],
      cues: [cue("Ask how much this pays", "yes", true), cue("Close the laptop at nine", "no")],
    };
    expect(daySummaryLine({ response: "yes", recovered: "yes", impact: "some" }, obs)).toBe(
      "Showed up: Starting late, Phone distraction · Response ran · recovered · Cost: some · Cues used: Ask how much this pays",
    );
  });

  it("says No obstacles / No cue used when every row is no, and unsure when every row is unsure", () => {
    expect(daySummaryLine(none, { impediments: [imp("A", "no", true)], cues: [cue("C", "no", true)] })).toBe("No obstacles · No cue used");
    expect(daySummaryLine(none, { impediments: [imp("A", "unsure", true)], cues: [cue("C", "unsure", true)] })).toBe("Obstacles: unsure · Cues: unsure");
  });

  it("leaves out a group nobody answered and a day with no rows at all", () => {
    expect(daySummaryLine(none, { impediments: [imp("A", "unanswered", true)], cues: [cue("C", "yes", true)] })).toBe("Cues used: C");
    expect(daySummaryLine(none, NO_OBSERVATIONS)).toBe("");
  });

  it("renders every response and recovery wording", () => {
    const obs: DayObservations = { impediments: [imp("Starting late", "yes", true)], cues: [] };
    expect(daySummaryLine({ response: "partially", recovered: "no", impact: "a_lot" }, obs)).toBe("Showed up: Starting late · Response partially ran · didn't recover · Cost: a lot");
    expect(daySummaryLine({ response: "no", recovered: "unsure", impact: null }, obs)).toBe("Showed up: Starting late · Response didn't run · recovery unsure");
    expect(daySummaryLine({ response: "unsure", recovered: "yes", impact: "nothing" }, obs)).toBe("Showed up: Starting late · Response unsure · recovered · Cost: nothing");
  });
});

describe("showedUpTail", () => {
  it("names the highest when it showed up, else the first that did, else nothing", () => {
    expect(showedUpTail({ impediments: [imp("Phone", "yes"), imp("Late", "yes", true)], cues: [] })).toBe(" · showed up: Late");
    expect(showedUpTail({ impediments: [imp("Phone", "yes"), imp("Late", "no", true)], cues: [] })).toBe(" · showed up: Phone");
    expect(showedUpTail({ impediments: [imp("Phone", "unsure"), imp("Late", "no", true)], cues: [] })).toBe("");
  });
});

describe("quietItems", () => {
  it("offers No and untouched items, never the highest, the focus, or an unsure or present one", () => {
    const obs: DayObservations = {
      impediments: [imp("Late", "no", true), imp("Phone", "no"), imp("Email", "unanswered"), imp("Noise", "unsure"), imp("Doubt", "yes")],
      cues: [cue("Focus cue", "unanswered", true), cue("Nine", "no"), cue("Walk", "yes")],
    };
    expect(quietItems(obs)).toEqual({ impediments: [{ id: "imp-Phone", name: "Phone" }, { id: "imp-Email", name: "Email" }], cues: [{ id: "cue-Nine", name: "Nine" }] });
  });
});
