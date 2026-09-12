import { describe, expect, it } from "vitest";
import type { OfferedItems } from "@/lib/data";
import { answersHint, closeInput, EMPTY_ANSWERS, setAnswer, setRecovered, tickedOf, toggleSituation } from "@/lib/dayAnswers";

/**
 * F15: the close's answer state. One impediment with two situations, one cue with one;
 * the DB contract (`closeDayAction`) is what `closeInput` has to produce exactly.
 */
const item = (id: string, name: string, kind: "cue" | "impediment", situations: { id: string; name: string }[]) => ({
  id,
  kind,
  name,
  scope: "global" as const,
  rank: 1,
  archived_at: null,
  cue_when: kind === "cue" ? "I schedule anything" : null,
  proof_then: kind === "impediment" ? "timer" : null,
  proof_recover: kind === "impediment" ? "running in 10" : null,
  situations,
  used: true,
  active: true,
});

const offered: OfferedItems = {
  impediments: [item("imp", "I notice delaying", "impediment", [{ id: "s1", name: "Starting late" }, { id: "s2", name: "Late night" }])],
  cues: [{ ...item("cue", "Ask how much this pays", "cue", [{ id: "sc", name: "Scheduling" }]), is_focus: true }],
};

describe("answers state", () => {
  it("a yes opens the ticks; leaving yes drops them", () => {
    let a = setAnswer(EMPTY_ANSWERS, "impediments", "imp", "yes");
    a = toggleSituation(a, "impediments", "imp", "s1");
    expect(tickedOf(a.impediments.imp, offered.impediments[0].situations)).toEqual(["s1"]);
    a = setAnswer(a, "impediments", "imp", "no");
    expect(a.impediments.imp.situations).toEqual({});
    // Back to yes starts clean: a No never carries a situation.
    a = setAnswer(a, "impediments", "imp", "yes");
    expect(tickedOf(a.impediments.imp, offered.impediments[0].situations)).toEqual([]);
  });

  it("a tick under a non-yes item is a no-op, and toggling twice unticks", () => {
    const untouched = toggleSituation(EMPTY_ANSWERS, "impediments", "imp", "s1");
    expect(untouched).toBe(EMPTY_ANSWERS);
    let a = setAnswer(EMPTY_ANSWERS, "impediments", "imp", "yes");
    a = toggleSituation(toggleSituation(a, "impediments", "imp", "s1"), "impediments", "imp", "s1");
    expect(tickedOf(a.impediments.imp, offered.impediments[0].situations)).toEqual([]);
  });

  it("recovery is per ticked situation and may be cleared back to blank", () => {
    let a = setAnswer(EMPTY_ANSWERS, "impediments", "imp", "yes");
    a = toggleSituation(a, "impediments", "imp", "s2");
    a = setRecovered(a, "imp", "s2", "no");
    expect(a.impediments.imp.situations.s2).toEqual({ recovered: "no" });
    a = setRecovered(a, "imp", "s2", null);
    expect(a.impediments.imp.situations.s2).toEqual({ recovered: null });
    // An unticked situation takes no recovery.
    expect(setRecovered(a, "imp", "s1", "yes")).toBe(a);
  });
});

describe("answersHint", () => {
  it("names the first yes-item with nothing ticked, impediments before cues, and clears once ticked", () => {
    let a = setAnswer(setAnswer(EMPTY_ANSWERS, "cues", "cue", "yes"), "impediments", "imp", "yes");
    expect(answersHint(a, offered)).toBe("Tick at least one situation for I notice delaying.");
    a = toggleSituation(a, "impediments", "imp", "s1");
    expect(answersHint(a, offered)).toBe("Tick at least one situation for Ask how much this pays.");
    a = toggleSituation(a, "cues", "cue", "sc");
    expect(answersHint(a, offered)).toBeNull();
  });

  it("an untouched day and a day of No / Unsure can close", () => {
    expect(answersHint(EMPTY_ANSWERS, offered)).toBeNull();
    expect(answersHint(setAnswer(setAnswer(EMPTY_ANSWERS, "impediments", "imp", "no"), "cues", "cue", "unsure"), offered)).toBeNull();
  });

  it("a blank recovery does not block the close (F15: the user may leave it)", () => {
    const a = toggleSituation(setAnswer(EMPTY_ANSWERS, "impediments", "imp", "yes"), "impediments", "imp", "s1");
    expect(answersHint(a, offered)).toBeNull();
  });
});

describe("closeInput", () => {
  it("sends touched items only, situations under a yes in offered order, recovered null for a blank tick", () => {
    let a = setAnswer(EMPTY_ANSWERS, "impediments", "imp", "yes");
    a = toggleSituation(a, "impediments", "imp", "s2");
    a = toggleSituation(a, "impediments", "imp", "s1");
    a = setRecovered(a, "imp", "s1", "yes");
    expect(closeInput(a, offered, 600, " ok ")).toEqual({
      actual: 600,
      notes: " ok ",
      impediments: [{ id: "imp", answer: "yes", situations: [{ situationId: "s1", recovered: "yes" }, { situationId: "s2", recovered: null }] }],
      cues: [],
    });
  });

  it("a No carries no situations; a cue carries situation ids only", () => {
    const a = toggleSituation(setAnswer(setAnswer(EMPTY_ANSWERS, "impediments", "imp", "no"), "cues", "cue", "yes"), "cues", "cue", "sc");
    expect(closeInput(a, offered, 1, "")).toEqual({
      actual: 1,
      notes: "",
      impediments: [{ id: "imp", answer: "no", situations: [] }],
      cues: [{ id: "cue", answer: "yes", situations: ["sc"] }],
    });
  });

  it("a tick on a situation the day no longer offers is dropped rather than sent", () => {
    let a = setAnswer(EMPTY_ANSWERS, "impediments", "imp", "yes");
    a = toggleSituation(a, "impediments", "imp", "s1");
    const narrower: OfferedItems = { ...offered, impediments: [{ ...offered.impediments[0], situations: [{ id: "s2", name: "Late night" }] }] };
    expect(closeInput(a, narrower, 1, "").impediments[0].situations).toEqual([]);
  });
});
