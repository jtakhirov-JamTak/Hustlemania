import { describe, expect, it } from "vitest";
import { attainment, breakdownLines, coverageLine, cueRows, effectiveClosedDays, impactRows, recoveryRows } from "@/lib/insightCards";
import { kitFrom, prefillFromKit } from "@/lib/kit";
import type { AreaKit, CueRow, ImpactRow, RecoveryRow, SituationRow } from "@/lib/data";

const impact = (over: Partial<ImpactRow> = {}): ImpactRow => ({
  item_id: "i1",
  name: "Saying yes to one-off projects",
  is_highest: true,
  present_days: 4,
  absent_days: 4,
  logged_days: 9,
  unsure_days: 1,
  median_present: 0.65,
  median_absent: 1.4,
  delta_pts: -75,
  enough: true,
  ...over,
});

const cue = (over: Partial<CueRow> = {}): CueRow => ({
  item_id: "c1",
  name: "Ask how much this pays",
  is_focus: true,
  used_days: 6,
  unused_days: 3,
  logged_days: 10,
  unsure_days: 1,
  median_used: 1.25,
  median_unused: 0.6,
  delta_pts: 65,
  enough: true,
  ...over,
});

/** F15: one recovery row per impediment over its situation rows. */
const recovery = (over: Partial<RecoveryRow> = {}): RecoveryRow => ({
  item_id: "i1",
  name: "Saying yes",
  proof_then: "I reply with the retainer offer",
  proof_recover: "back on the outreach list within 15 minutes",
  is_highest: true,
  occurrences: 4,
  verdict_occurrences: 4,
  answered: 4,
  recovered: 2,
  didnt: 2,
  rate: 50,
  enough: true,
  ...over,
});

const situation = (over: Partial<SituationRow> = {}): SituationRow => ({
  kind: "impediment",
  item_id: "i1",
  item_name: "Saying yes",
  situation_id: "st1",
  situation_name: "A one-off request lands",
  occurrences: 4,
  asked_days: 9,
  recovered_yes: 2,
  recovered_answered: 4,
  rate: 50,
  enough: true,
  ...over,
});

describe("insight card copy", () => {
  it("renders a median ratio as a percentage and an empty group as an em dash", () => {
    expect(attainment(1.25)).toBe("125%");
    expect(attainment(0.6)).toBe("60%");
    expect(attainment(null)).toBe("—");
  });

  it("an impediment row prints both group sizes and the delta in points, and no perceived-cost tally (F15)", () => {
    const [row] = impactRows([impact()]);
    expect(row.tag).toBe("HIGHEST");
    expect(row.tail).toBe("-75 pts");
    expect(row.tailTone).toBe("bad");
    expect(row.sub).toBe("Present on 4 of 9 logged days");
    expect(row.bars.map((b) => b.value)).toEqual(["65%", "140%"]);
    expect(row.note).toBeNull();
  });

  it("a thin sample says what it needs instead of showing a comparison", () => {
    const [row] = impactRows([impact({ present_days: 2, absent_days: 8, delta_pts: null, enough: false })]);
    expect(row.tail).toBe("Not enough data");
    expect(row.note).toBe("Needs 3 days with and 3 without · has 2 and 8");
    expect(row.warn).toBe(true);
  });

  it("a cue row leads with the focus tag and a positive delta reads good", () => {
    const [row] = cueRows([cue()]);
    expect(row.tag).toBe("FOCUS");
    expect(row.tail).toBe("+65 pts");
    expect(row.tailTone).toBe("good");
    expect(row.sub).toBe("Used on 6 of 10 logged days");
  });

  it("recovery reports recovered against didn't over the answered situation occurrences", () => {
    const [row] = recoveryRows([recovery()]);
    expect(row.tag).toBe("HIGHEST");
    expect(row.tail).toBe("50% recovered");
    expect(row.sub).toBe("Recovered when back on the outreach list within 15 minutes");
    expect(row.bars.map((b) => b.label)).toEqual(["recovered", "didn't recover"]);
    expect(row.bars.map((b) => b.value)).toEqual(["2 of 4", "2 of 4"]);
    expect(row.note).toBeNull();
  });

  it("recovery names the occurrences left blank and the answered count a thin row still needs", () => {
    const [blank] = recoveryRows([recovery({ occurrences: 6, answered: 4 })]);
    expect(blank.note).toBe("2 occurrences left blank");
    const [thin] = recoveryRows([recovery({ occurrences: 2, answered: 2, recovered: 1, didnt: 1, rate: null, enough: false })]);
    expect(thin.tail).toBe("Not enough data");
    expect(thin.note).toBe("Needs 3 answered recoveries · has 2");
    expect(thin.warn).toBe(true);
  });

  it("recovery drops an impediment that never showed up", () => {
    expect(recoveryRows([recovery({ occurrences: 0, verdict_occurrences: 0, answered: 0, recovered: 0, didnt: 0, rate: null, enough: false })])).toEqual([]);
  });

  it("situation lines: occurrences and the recovery rate for an impediment, days applied for a cue, thin rows say so", () => {
    const rows = [
      situation(),
      situation({ situation_id: "st2", situation_name: "Late night", occurrences: 2, recovered_yes: 1, recovered_answered: 2, rate: null, enough: false }),
      situation({ situation_id: "st3", situation_name: "Never", occurrences: 0, recovered_yes: 0, recovered_answered: 0, rate: null, enough: false }),
      situation({ kind: "cue", item_id: "c1", situation_id: "sc1", situation_name: "Scheduling", occurrences: 6, recovered_yes: 0, recovered_answered: 0, rate: null, enough: true }),
      situation({ item_id: "i9", situation_id: "st9", situation_name: "Someone else's" }),
    ];
    expect(breakdownLines(rows, "i1", "impediment")).toEqual([
      { name: "A one-off request lands", text: "4 occurrences · 50% recovered" },
      { name: "Late night", text: "2 occurrences · Not enough data" },
      { name: "Never", text: "never showed up" },
    ]);
    expect(breakdownLines(rows, "c1", "cue")).toEqual([{ name: "Scheduling", text: "applied on 6 days" }]);
    expect(breakdownLines(rows, "c1", "impediment")).toEqual([]);
  });

  it("no card ever says `caused`", () => {
    const text = [...impactRows([impact()]), ...cueRows([cue()]), ...recoveryRows([recovery()])]
      .flatMap((r) => [r.sub, r.tail, r.note ?? "", ...r.bars.map((b) => b.label)])
      .join(" ");
    expect(text.toLowerCase()).not.toContain("caused");
    expect(text.toLowerCase()).not.toContain("because");
  });

  it("coverage names the logged days and the unsure ones", () => {
    expect(coverageLine(12, 13, 1)).toBe("Logged 12 of 13 closed days · 1 unsure");
    expect(coverageLine(1, 1, 0)).toBe("Logged 1 of 1 closed day");
  });

  it("the coverage denominator excludes a zero-target closed day, as the effective view does", () => {
    const days = [
      { closed: true, cancelled: false, target: 100 },
      { closed: true, cancelled: false, target: 0 },
      { closed: true, cancelled: true, target: 100 },
      { closed: false, cancelled: false, target: 100 },
    ];
    expect(effectiveClosedDays(days)).toBe(1);
  });
});

describe("the Area kit", () => {
  const items = {
    impediments: [
      { id: "i1", name: "Saying yes" },
      { id: "i2", name: "Phone" },
      { id: "i3", name: "Starting late" },
    ],
    cues: [
      { id: "c1", name: "Ask how much" },
      { id: "c2", name: "Outreach at 9" },
    ],
  };

  it("defaults every undecided item to keep", () => {
    expect(kitFrom({}, items)).toEqual({
      highest: null,
      watching: ["Saying yes", "Phone", "Starting late"],
      cues: ["Ask how much", "Outreach at 9"],
    });
  });

  it("a promotion becomes the highest and leaves the watch list", () => {
    expect(kitFrom({ i2: "highest", i3: "drop", c1: "drop" }, items)).toEqual({
      highest: "Phone",
      watching: ["Saying yes"],
      cues: ["Outreach at 9"],
    });
  });
});

describe("prefilling step 4 from the kit", () => {
  const library = {
    impediments: [{ id: "i1" }, { id: "i2" }, { id: "i3" }],
    cues: [{ id: "c1" }, { id: "c2" }],
  };
  const kit = (over: Partial<AreaKit> = {}): AreaKit => ({
    sprintId: "s1",
    lesson: "L",
    impedimentIds: ["i1", "i2"],
    cueIds: ["c1", "c2"],
    highestId: "i2",
    ...over,
  });

  it("no kit leaves step 4 empty, exactly as before F10", () => {
    expect(prefillFromKit(null, library)).toEqual({ impedimentIds: [], highestId: null, cueIds: [], focusId: null });
  });

  it("pre-checks the keepers, promotes the highest and defaults the focus to the first cue", () => {
    expect(prefillFromKit(kit(), library)).toEqual({
      impedimentIds: ["i2", "i1"],
      highestId: "i2",
      cueIds: ["c1", "c2"],
      focusId: "c1",
    });
  });

  it("drops an item this Area's library no longer offers, and the highest with it", () => {
    expect(prefillFromKit(kit({ highestId: "i9", impedimentIds: ["i1", "i9"] }), library)).toEqual({
      impedimentIds: ["i1"],
      highestId: null,
      cueIds: ["c1", "c2"],
      focusId: "c1",
    });
  });

  it("trims to the rule 3-4 caps (F15: three of each) rather than handing start_sprint something it refuses", () => {
    const big = {
      impediments: Array.from({ length: 7 }, (_, i) => ({ id: `i${i}` })),
      cues: Array.from({ length: 5 }, (_, i) => ({ id: `c${i}` })),
    };
    const out = prefillFromKit(
      kit({ impedimentIds: big.impediments.map((i) => i.id), cueIds: big.cues.map((c) => c.id), highestId: "i6" }),
      big,
    );
    expect(out.impedimentIds).toHaveLength(3);
    expect(out.cueIds).toHaveLength(3);
    // The promoted one survives the cap: it leads the list.
    expect(out.impedimentIds[0]).toBe("i6");
    expect(out.highestId).toBe("i6");
  });
});
