"use client";

import { PlanGrid, type PlanCell } from "@/components/PlanGrid";
import type { Measured } from "@/lib/format";
import { unitLabel } from "@/lib/format";
import { hasRoundingDifference } from "@/lib/targets";

/** Step 4: the plan alone — Same or Custom, the 14-day grid, the note under it (F3). */
export function StepTargets({
  mode,
  onMode,
  measured,
  amount,
  cells,
  values,
  parsed,
  onValue,
  sameTargets,
}: {
  mode: "same" | "custom";
  onMode: (mode: "same" | "custom") => void;
  measured: Measured;
  amount: number;
  cells: PlanCell[];
  values: string[];
  parsed: (number | null)[];
  onValue: (i: number, raw: string) => void;
  sameTargets: number[];
}) {
  return (
    <>
      <div className="wz-between">
        <div className="label-accent">14 daily targets · {mode === "same" ? "same each day" : "custom"}</div>
        <div className="wz-modes" role="group" aria-label="Target mode">
          <button type="button" className={`chip ${mode === "same" ? "chip-on" : ""}`} aria-pressed={mode === "same"} onClick={() => onMode("same")}>
            Same
          </button>
          <button type="button" className={`chip ${mode === "custom" ? "chip-on" : ""}`} aria-pressed={mode === "custom"} onClick={() => onMode("custom")}>
            Custom
          </button>
        </div>
      </div>
      <div className="mt-12">
        <PlanGrid measured={measured} goal={amount} cells={cells} editing={mode === "custom"} values={values} parsed={parsed} onChange={onValue} />
      </div>
      <div className="wz-note wz-narrow mt-10">
        {mode === "custom"
          ? `Each day stands alone — zero is fine for a day off. Start is available once the plan totals the goal.${measured.measurement === "hours" ? " Enter hours as h:mm." : ""}`
          : hasRoundingDifference(sameTargets)
            ? `The goal does not split evenly, so the first days carry one extra ${unitLabel(measured)}.`
            : "Goal ÷ 14, the same every day. Choose Custom to set days individually."}
      </div>
    </>
  );
}
