import { describe, expect, it } from "vitest";
import { daySummaryLine, NO_OBSERVATIONS, quietItems, showedUpTail, type DayObservations, type SituationObservation } from "@/lib/daySummary";

const sit = (name: string, occurred: boolean, recovered: string | null = null): SituationObservation => ({ id: `sit-${name}`, name, occurred, recovered });
const imp = (name: string, occurred: string, was_highest = false, situations: SituationObservation[] = []) => ({ id: `imp-${name}`, name, occurred, was_highest, situations });
const cue = (name: string, used: string, was_focus = false, applied: string[] = []) => ({
  id: `cue-${name}`,
  name,
  used,
  was_focus,
  situations: applied.map((s) => ({ id: `sit-${s}`, name: s, applied: true })),
});

describe("daySummaryLine", () => {
  it("names each occurred impediment with its ticked situations and answered recoveries, highest first, then the cues used", () => {
    const obs: DayObservations = {
      impediments: [
        imp("Phone distraction", "yes", false, [sit("Commute", true), sit("Evening", false)]),
        imp("Starting late", "yes", true, [sit("Monday standup", true, "yes"), sit("Late night", true, "no"), sit("Travel", false)]),
      ],
      cues: [cue("Ask how much this pays", "yes", true, ["Scheduling"]), cue("Close the laptop at nine", "no")],
    };
    expect(daySummaryLine(obs)).toBe("Showed up: Starting late (Monday standup, Late night; recovered 1 of 2), Phone distraction (Commute) · Cues used: Ask how much this pays (Scheduling)");
  });

  it("leaves the recovery clause out while no recovery was answered, and the situations out when none was ticked (legacy rows)", () => {
    expect(daySummaryLine({ impediments: [imp("Starting late", "yes", true, [sit("Monday standup", true, null)])], cues: [] })).toBe("Showed up: Starting late (Monday standup)");
    expect(daySummaryLine({ impediments: [imp("Starting late", "yes", true)], cues: [cue("C", "yes", true)] })).toBe("Showed up: Starting late · Cues used: C");
  });

  it("says No obstacles / No cue used when every row is no, and unsure when every row is unsure", () => {
    expect(daySummaryLine({ impediments: [imp("A", "no", true)], cues: [cue("C", "no", true)] })).toBe("No obstacles · No cue used");
    expect(daySummaryLine({ impediments: [imp("A", "unsure", true)], cues: [cue("C", "unsure", true)] })).toBe("Obstacles: unsure · Cues: unsure");
  });

  it("leaves out a group nobody answered and a day with no rows at all", () => {
    expect(daySummaryLine({ impediments: [imp("A", "unanswered", true)], cues: [cue("C", "yes", true)] })).toBe("Cues used: C");
    expect(daySummaryLine(NO_OBSERVATIONS)).toBe("");
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
