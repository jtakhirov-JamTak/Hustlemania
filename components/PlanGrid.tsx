"use client";

import { dayOfMonth, dayOfWeek, SHORT_DOW } from "@/lib/dates";
import { formatAmount, formatNumber, type Measured } from "@/lib/format";

export type PlanCell = {
  dayIndex: number;
  date: string;
  /** Rule 10: the day has begun in the sprint's zone (or is closed); shown, never edited. */
  locked: boolean;
  /** Current persisted target in base units. */
  target: number;
  /** Closed days show their actual under the target. */
  actual: number | null;
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
}: {
  measured: Measured;
  goal: number;
  cells: PlanCell[];
  editing: boolean;
  values: string[];
  parsed: (number | null)[];
  onChange: (index: number, raw: string) => void;
  inputIdPrefix?: string;
}) {
  const effective = cells.map((c, i) => (editing && !c.locked ? parsed[i] : c.target));
  const allValid = effective.every((t) => t !== null);
  const planned = allValid ? effective.reduce((a, b) => (a ?? 0) + (b ?? 0), 0)! : null;
  const delta = planned === null ? null : planned - goal;

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 6 }} data-strip data-testid="plan-grid">
        {cells.map((c, i) => {
          const edit = editing && !c.locked;
          const invalid = edit && parsed[i] === null;
          return (
            <div
              key={c.dayIndex}
              data-day={c.dayIndex}
              data-locked={c.locked ? "true" : "false"}
              style={{
                border: `1px solid ${invalid ? "var(--under)" : "var(--divider)"}`,
                borderRadius: 10,
                padding: "8px 6px",
                textAlign: "center",
                minWidth: 0,
                background: c.locked ? "var(--faint)" : "var(--panel)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 4 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: "var(--accent)" }}>D{c.dayIndex}</span>
                <span style={{ fontSize: 9.5, color: "var(--muted)" }}>
                  {SHORT_DOW[dayOfWeek(c.date)]} {dayOfMonth(c.date)}
                </span>
              </div>
              {edit ? (
                <input
                  id={`${inputIdPrefix}-${c.dayIndex}`}
                  className="input"
                  aria-label={`Day ${c.dayIndex} target`}
                  aria-invalid={invalid || undefined}
                  inputMode={measured.measurement === "hours" ? "text" : "numeric"}
                  value={values[i]}
                  onChange={(e) => onChange(i, e.target.value)}
                  style={{ marginTop: 4, padding: "5px 6px", fontSize: 13, fontWeight: 600, textAlign: "center", borderRadius: 8 }}
                />
              ) : (
                <>
                  <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 4 }} data-testid={`plan-target-${c.dayIndex}`}>
                    {formatNumber(measured, c.target)}
                  </div>
                  <div style={{ fontSize: 9.5, color: c.actual !== null ? (c.actual >= c.target ? "var(--success)" : "var(--under)") : "var(--muted)", marginTop: 2 }}>
                    {c.actual !== null ? `actual ${formatNumber(measured, c.actual)}` : c.locked ? "locked" : " "}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12.5, marginTop: 12 }} data-testid="plan-summary">
        <span style={{ color: "var(--muted)" }}>
          Planned <strong style={{ fontWeight: 600, color: "var(--ink)" }}>{planned === null ? "—" : formatAmount(measured, planned)}</strong>
        </span>
        <span style={{ color: "var(--muted)" }}>
          Goal · locked <strong style={{ fontWeight: 600, color: "var(--ink)" }}>{formatAmount(measured, goal)}</strong>
        </span>
        <span
          data-testid="plan-delta"
          data-state={delta === null ? "invalid" : delta === 0 ? "balanced" : delta < 0 ? "below" : "above"}
          style={{ fontWeight: 600, color: delta === 0 ? "var(--success)" : delta === null || delta < 0 ? "var(--under)" : "var(--ink)" }}
        >
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
