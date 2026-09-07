"use client";

import { dayOfMonth, dayOfWeek, SHORT_DOW } from "@/lib/dates";
import { formatAmount, formatNumber, type Measured } from "@/lib/format";
import { planDelta } from "@/lib/targets";

export type PlanCell = {
  dayIndex: number;
  date: string;
  /** Rule 10: the day has begun in the sprint's zone (or is closed); shown, never edited. */
  locked: boolean;
  /** Current persisted target in base units. */
  target: number;
  /** Closed days show their actual under the target. */
  actual: number | null;
  /** F5: the date has passed in the sprint's zone and the day was never closed. */
  missed?: boolean;
};

/**
 * The 14-day plan: seven columns, two rows. In edit mode every unlocked day is an
 * input holding the user's raw text; the host parses it and passes `parsed` so the
 * grid can flag a cell it could not read. Summary line: planned, locked goal, delta.
 */
export function PlanGrid({
  measured,
  goal,
  cells,
  editing,
  values,
  parsed,
  onChange,
  inputIdPrefix = "target",
  onBackfill,
  backfillBusy = false,
}: {
  measured: Measured;
  goal: number;
  cells: PlanCell[];
  editing: boolean;
  values: string[];
  parsed: (number | null)[];
  onChange: (index: number, raw: string) => void;
  inputIdPrefix?: string;
  /** When given, a missed day is one Backfill button (F5). */
  onBackfill?: (index: number) => void;
  /** A backfill is being opened: the buttons stay put, disabled. */
  backfillBusy?: boolean;
}) {
  const effective = effectivePlan(cells, editing, parsed);
  const planned = effective === null ? null : effective.reduce((a, b) => a + b, 0);
  const delta = effective === null ? null : planDelta(effective, goal);

  return (
    <>
      <div className="plan-grid" data-strip data-testid="plan-grid">
        {cells.map((c, i) => {
          const edit = editing && !c.locked;
          const invalid = edit && parsed[i] === null;
          const backfillable = Boolean(c.missed && onBackfill);
          const status =
            c.actual !== null
              ? { text: `actual ${formatNumber(measured, c.actual)}`, tone: c.actual >= c.target ? "met" : "under" }
              : c.missed
                ? { text: "missed", tone: "missed" }
                : c.locked
                  ? { text: "locked", tone: "locked" }
                  : null;
          const header = (
            <div className="plan-cell-head">
              <span className="plan-d">D{c.dayIndex}</span>
              <span className="plan-date">
                {SHORT_DOW[dayOfWeek(c.date)]} {dayOfMonth(c.date)}
              </span>
            </div>
          );
          const cellClass = `plan-cell ${c.locked ? "plan-cell-locked" : ""} ${invalid ? "plan-cell-invalid" : ""}`;
          if (backfillable) {
            // The whole cell is the target (≥ 44 pt tall), so the label never has to be.
            return (
              <button
                key={c.dayIndex}
                className={`${cellClass} plan-cell-backfill`}
                type="button"
                data-day={c.dayIndex}
                data-locked="true"
                data-missed="true"
                aria-label={`Backfill day ${c.dayIndex}`}
                aria-busy={backfillBusy || undefined}
                disabled={backfillBusy}
                onClick={() => onBackfill?.(i)}
              >
                {header}
                <div className="plan-target" data-testid={`plan-target-${c.dayIndex}`}>
                  {formatNumber(measured, c.target)}
                </div>
                <div className="plan-status" data-tone="missed">
                  missed
                </div>
                <div className="plan-backfill-label">Backfill</div>
              </button>
            );
          }
          return (
            <div key={c.dayIndex} className={cellClass} data-day={c.dayIndex} data-locked={c.locked ? "true" : "false"} data-missed={c.missed ? "true" : undefined}>
              {header}
              {edit ? (
                <input
                  id={`${inputIdPrefix}-${c.dayIndex}`}
                  className="input plan-input"
                  aria-label={`Day ${c.dayIndex} target`}
                  aria-invalid={invalid || undefined}
                  inputMode={measured.measurement === "hours" ? "text" : "numeric"}
                  value={values[i]}
                  onChange={(e) => onChange(i, e.target.value)}
                />
              ) : (
                <>
                  <div className="plan-target" data-testid={`plan-target-${c.dayIndex}`}>
                    {formatNumber(measured, c.target)}
                  </div>
                  <div className="plan-status" data-tone={status?.tone}>
                    {status?.text ?? ""}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="plan-summary" data-testid="plan-summary">
        <span className="plan-summary-item">
          Planned <strong>{planned === null ? "—" : formatAmount(measured, planned)}</strong>
        </span>
        <span className="plan-summary-item">
          Goal · locked <strong>{formatAmount(measured, goal)}</strong>
        </span>
        <span className="plan-delta" data-testid="plan-delta" data-state={delta === null ? "invalid" : delta === 0 ? "balanced" : delta < 0 ? "below" : "above"}>
          {delta === null
            ? "Fix the highlighted day"
            : delta === 0
              ? "Balanced"
              : delta < 0
                ? `−${formatAmount(measured, -delta)} below goal`
                : `+${formatAmount(measured, delta)} above goal`}
        </span>
      </div>
    </>
  );
}

/** Planned total of the effective plan, or null while any edited cell is unreadable. */
export function effectivePlan(cells: PlanCell[], editing: boolean, parsed: (number | null)[]): number[] | null {
  const out = cells.map((c, i) => (editing && !c.locked ? parsed[i] : c.target));
  return out.every((t): t is number => t !== null) ? out : null;
}
