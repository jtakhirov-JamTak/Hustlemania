import { describe, expect, it } from "vitest";
import { attainment, coverageLine, cueRows, effectiveClosedDays, followThroughRows, impactRows, recoveryRows } from "@/lib/insightCards";
import { kitFrom, prefillFromKit } from "@/lib/kit";
import type { AreaKit, CueRow, FollowThroughRow, ImpactRow, RecoveryRow } from "@/lib/data";

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
  felt_a_lot: 2,
  felt_some: 2,
  felt_nothing: 0,
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

const follow = (over: Partial<FollowThroughRow> = {}): FollowThroughRow => ({
  item_id: "i1",
  name: "Saying yes",
  proof_then: "I reply with the retainer offer",
  occurrences: 4,
  answered: 4,
  ran: 2,
  didnt: 2,
  partially: 1,
  unsure: 0,
  rate: 50,
  enough: true,
  ...over,
});

const recovery = (over: Partial<RecoveryRow> = {}): RecoveryRow => ({
  item_id: "i1",
  name: "Saying yes",
  proof_recover: "back on the outreach list within 15 minutes",
  with_response: 2,
  with_recovered: 1,
  without_response: 2,
  without_recovered: 1,
  answered: 4,
  rate: 50,
  enough: true,
  median_recovered: 0.65,
  median_not: 0.65,
  outcome_enough: true,
  ...over,
});

describe("insight card copy", () => {
  it("renders a median ratio as a percentage and an empty group as an em dash", () => {
    expect(attainment(1.25)).toBe("125%");
    expect(attainment(0.6)).toBe("60%");
    expect(attainment(null)).toBe("—");
  });

  it("an impediment row prints both group sizes and the delta in points", () => {
    const [row] = impactRows([impact()]);
    expect(row.tag).toBe("HIGHEST");
    expect(row.tail).toBe("-75 pts");
    expect(row.tailTone).toBe("bad");
    expect(row.sub).toBe("Present on 4 of 9 logged days");
    expect(row.bars.map((b) => b.value)).toEqual(["65%", "140%"]);
    expect(row.note).toBe("Felt: 2 a lot, 2 some");
  });

  it("a thin sample says what it needs instead of showing a comparison", () => {
    const [row] = impactRows([impact({ present_days: 2, absent_days: 8, delta_pts: null, enough: false, felt_a_lot: 0, felt_some: 0 })]);
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

  it("follow-through reports `partially` separately and never inside `ran`", () => {
    const [row] = followThroughRows([follow()]);
    expect(row.tail).toBe("50% ran");
    expect(row.bars[0]).toMatchObject({ value: "2", label: "ran the response" });
    expect(row.note).toBe("1 partially");
  });

  it("follow-through drops an impediment that never occurred", () => {
    expect(followThroughRows([follow({ occurrences: 0, answered: 0, ran: 0, didnt: 0, partially: 0, rate: null, enough: false })])).toEqual([]);
  });

  it("recovery compares with the response against without it", () => {
    const [row] = recoveryRows([recovery()]);
    expect(row.bars.map((b) => b.label)).toEqual(["recovered with the response", "recovered without it"]);
    expect(row.bars.map((b) => b.value)).toEqual(["1 of 2", "1 of 2"]);
    expect(row.note).toContain("Attainment 65% when recovered vs 65% when not");
  });

  it("recovery hides the attainment line until each side has two days", () => {
    const [row] = recoveryRows([recovery({ outcome_enough: false })]);
    expect(row.note).toBeNull();
  });

  it("no card ever says `caused`", () => {
    const text = [...impactRows([impact()]), ...cueRows([cue()]), ...followThroughRows([follow()]), ...recoveryRows([recovery()])]
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

  it("trims to the rule 3-4 caps rather than handing start_sprint something it refuses", () => {
    const big = {
      impediments: Array.from({ length: 7 }, (_, i) => ({ id: `i${i}` })),
      cues: Array.from({ length: 5 }, (_, i) => ({ id: `c${i}` })),
    };
    const out = prefillFromKit(
      kit({ impedimentIds: big.impediments.map((i) => i.id), cueIds: big.cues.map((c) => c.id), highestId: "i6" }),
      big,
    );
    expect(out.impedimentIds).toHaveLength(5);
    expect(out.cueIds).toHaveLength(3);
    // The promoted one survives the cap: it leads the list.
    expect(out.impedimentIds[0]).toBe("i6");
    expect(out.highestId).toBe("i6");
  });
});
