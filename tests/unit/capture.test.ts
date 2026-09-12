import { describe, expect, it } from "vitest";
import { CAPTURE_KINDS, emptyParts, joinParts, LIST_MAX, missingPart, normalizeParts, PART_MAX, PARTS, stubParse } from "@/lib/capture";

describe("capture: missingPart", () => {
  it("names the first blank required part of every kind, in order, and null when all are present", () => {
    expect(missingPart("vision_goal", { goal: "", proof: "" })).toEqual({ key: "goal", hint: "Say the goal." });
    expect(missingPart("vision_goal", { goal: "run", proof: "  " })).toEqual({ key: "proof", hint: "Say what the observable proof will be." });
    expect(missingPart("vision_goal", { goal: "run", proof: "three runs a week" })).toBeNull();
    expect(missingPart("impediment", { when: "", then: "x", recovered_when: "y" })!.hint).toMatch(/WHEN/);
    // An impediment's response is optional on the library page (F15 rule 6 bites at the sprint).
    expect(missingPart("impediment", { when: "delaying", then: "", recovered_when: "" })).toBeNull();
    expect(missingPart("response", { then: "timer", recovered_when: "" })!.hint).toMatch(/RECOVERED WHEN/);
    expect(missingPart("cue", { when: "I schedule", remind: "" })!.hint).toMatch(/REMIND/);
    expect(missingPart("cue", { when: "", remind: "ask" })!.hint).toMatch(/WHEN/);
  });

  it("treats a list part as present only with a non-blank item", () => {
    expect(missingPart("situations", { situations: [] })).toEqual({ key: "situations", hint: "Name at least one situation." });
    expect(missingPart("situations", { situations: ["  "] })).not.toBeNull();
    expect(missingPart("situations", { situations: ["Starting late"] })).toBeNull();
    // Tasks are optional; the intention is not.
    expect(missingPart("today", { intention: "", tasks: ["a"] })!.key).toBe("intention");
    expect(missingPart("today", { intention: "move the money", tasks: [] })).toBeNull();
  });

  it("emptyParts has exactly the kind's keys, lists as arrays", () => {
    for (const kind of CAPTURE_KINDS) {
      const e = emptyParts(kind);
      expect(Object.keys(e)).toEqual(PARTS[kind].map((p) => p.key));
      for (const p of PARTS[kind]) expect(e[p.key]).toEqual(p.list ? [] : "");
    }
  });
});

describe("capture: normalizeParts (the single funnel)", () => {
  it("drops unknown keys, trims, collapses whitespace and caps text", () => {
    const out = normalizeParts("cue", { when: "  I  schedule\n anything ", remind: "ask", extra: "ignored", situations: ["x"] });
    expect(out).toEqual({ when: "I schedule anything", remind: "ask" });
    expect((normalizeParts("vision_goal", { goal: "g".repeat(PART_MAX + 50), proof: "p" }).goal as string).length).toBe(PART_MAX);
  });

  it("coerces a list: a string becomes one item, blanks are dropped, non-strings ignored, capped at LIST_MAX", () => {
    expect(normalizeParts("situations", { situations: "Starting late" })).toEqual({ situations: ["Starting late"] });
    expect(normalizeParts("situations", { situations: [" a ", "", 3, null, "b"] })).toEqual({ situations: ["a", "b"] });
    expect((normalizeParts("situations", { situations: Array(LIST_MAX + 5).fill("s") }).situations as string[]).length).toBe(LIST_MAX);
    expect(normalizeParts("today", { intention: "x", tasks: undefined })).toEqual({ intention: "x", tasks: [] });
  });

  it("survives a non-object", () => {
    expect(normalizeParts("cue", null)).toEqual({ when: "", remind: "" });
    expect(normalizeParts("today", "text")).toEqual({ intention: "", tasks: [] });
  });
});

describe("capture: joinParts round-trips through the stub", () => {
  it("vision_goal", () => {
    const parts = { goal: "run three times a week", proof: "three runs a week held for a quarter" };
    const text = joinParts("vision_goal", parts);
    expect(text).toBe("In 12 months, I run three times a week. The observable proof will be three runs a week held for a quarter.");
    // The lead-in the label supplies is dropped again, so a re-record round-trips exactly.
    expect(stubParse("vision_goal", text)).toEqual(parts);
    expect(stubParse("vision_goal", "In twelve months I have a signed lease. The proof is the lease.")).toEqual({ goal: "have a signed lease", proof: "the lease" });
  });

  it("impediment, response and cue", () => {
    const imp = { when: "I notice delaying", then: "I start a timer", recovered_when: "the timer is running" };
    expect(stubParse("impediment", joinParts("impediment", imp))).toEqual(imp);
    const resp = { then: "I start a timer", recovered_when: "the timer is running" };
    expect(stubParse("response", joinParts("response", resp))).toEqual(resp);
    const cue = { when: "I schedule anything", remind: "ask how much this pays" };
    expect(stubParse("cue", joinParts("cue", cue))).toEqual(cue);
  });

  it("situations and today", () => {
    expect(joinParts("situations", { situations: ["Starting late", "Late night"] })).toBe("Starting late, Late night");
    const today = { intention: "move the $600 before lunch", tasks: ["call the bank about the fee", "move the $600"] };
    expect(joinParts("today", today)).toBe("Today I will move the $600 before lunch. My tasks are call the bank about the fee, move the $600.");
    expect(stubParse("today", joinParts("today", today))).toEqual(today);
  });

  it("skips blank parts", () => {
    expect(joinParts("impediment", { when: "delaying", then: "", recovered_when: "" })).toBe("When delaying,");
    expect(joinParts("today", { intention: "", tasks: [] })).toBe("");
  });
});

describe("capture: stubParse on the golden-path sentences", () => {
  it("sorts the goal and proof", () => {
    expect(stubParse("vision_goal", "In a year I run three times a week and sleep seven hours. The observable proof will be three runs a week held for a quarter.")).toEqual({
      goal: "In a year I run three times a week and sleep seven hours",
      proof: "three runs a week held for a quarter",
    });
    // No proof keyword: everything lands in the goal and the proof stays empty (Save refused).
    expect(stubParse("vision_goal", "In a year I run three times a week.")).toEqual({ goal: "In a year I run three times a week", proof: "" });
  });

  it("sorts WHEN / THEN / RECOVERED WHEN and leaves a missing part empty", () => {
    expect(stubParse("impediment", "When I notice myself delaying my first work block, then I start a 10-minute timer on the smallest executable task. Recovered when the timer is running within 10 minutes.")).toEqual({
      when: "I notice myself delaying my first work block",
      then: "I start a 10-minute timer on the smallest executable task",
      recovered_when: "the timer is running within 10 minutes",
    });
    expect(stubParse("impediment", "When I notice myself delaying, then I start a timer")).toEqual({ when: "I notice myself delaying", then: "I start a timer", recovered_when: "" });
    expect(stubParse("impediment", "Phone distraction")).toEqual({ when: "Phone distraction", then: "", recovered_when: "" });
    expect(stubParse("response", "Then I put the phone in the drawer. Recovered when the drawer is shut within a minute.")).toEqual({
      then: "I put the phone in the drawer",
      recovered_when: "the drawer is shut within a minute",
    });
    expect(stubParse("response", "I put the phone in the drawer")).toEqual({ then: "I put the phone in the drawer", recovered_when: "" });
  });

  it("sorts a cue's WHEN and REMIND", () => {
    expect(stubParse("cue", "When I schedule anything, remind me to ask how much this pays.")).toEqual({ when: "I schedule anything", remind: "ask how much this pays" });
    expect(stubParse("cue", "When I get home, ask myself did I move today")).toEqual({ when: "I get home", remind: "did I move today" });
    expect(stubParse("cue", "I schedule anything")).toEqual({ when: "I schedule anything", remind: "" });
  });

  it("splits a situations list on commas, 'and', newlines and ordinals, and drops the lead-in", () => {
    expect(stubParse("situations", "Situations: getting up early, going to bed late, and phone in bed")).toEqual({ situations: ["getting up early", "going to bed late", "phone in bed"] });
    expect(stubParse("situations", "number one starting late number two late meetings")).toEqual({ situations: ["starting late", "late meetings"] });
    expect(stubParse("situations", "Starting late")).toEqual({ situations: ["Starting late"] });
    expect(stubParse("situations", "   ")).toEqual({ situations: [] });
  });

  it("sorts today's intention and tasks", () => {
    expect(stubParse("today", "Today I will move the $600 before lunch. My tasks are call the bank about the fee and move the $600.")).toEqual({
      intention: "move the $600 before lunch",
      tasks: ["call the bank about the fee", "move the $600"],
    });
    expect(stubParse("today", "Today I will write the draft. Tasks: outline, first paragraph; send it")).toEqual({ intention: "write the draft", tasks: ["outline", "first paragraph", "send it"] });
    expect(stubParse("today", "Move the money before lunch")).toEqual({ intention: "Move the money before lunch", tasks: [] });
  });
});
