"use client";

import { ErrorBar } from "@/components/ErrorBar";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { dayOfferedItemsAction } from "@/app/(app)/actions/day";
import { saveTargetsAction } from "@/app/(app)/actions/sprint";
import { effectivePlan, PlanGrid, type PlanCell } from "@/components/PlanGrid";
import { CloseFlow } from "@/components/today/CloseFlow";
import { callAction } from "@/lib/callAction";
import type { OfferedItems, SprintDay } from "@/lib/data";
import type { Measured } from "@/lib/format";
import { formatTargetInput, isLockedDay, isMissedDay, parseTargetInput, planDelta } from "@/lib/targets";

/**
 * The 14-day plan on Today (PRD §6). "Same" is the plan the sprint started with;
 * "Custom" opens every future day for editing. Save stays disabled until the plan
 * totals the goal again (rule 11); begun days are shown locked (rule 10); nothing is
 * redistributed for the user (rule 12). A missed day offers Backfill (F5), which runs
 * the same Day Close with that day's own offers, fetched when the button is pressed.
 */
export function PlanCard({
  sprintId,
  measured,
  goal,
  initialMode,
  days: initialDays,
  highestId,
  todayInSprintTz,
  sprintOver,
}: {
  sprintId: string;
  measured: Measured;
  goal: number;
  initialMode: "same" | "custom";
  days: SprintDay[];
  /** F7: the sprint's highest impediment, for the backfill dialog's response questions. */
  highestId: string | null;
  todayInSprintTz: string;
  /** The 14-day window has passed: the plan is read-only. Backfill stays available while the DB accepts it. */
  sprintOver: boolean;
}) {
  const router = useRouter();
  const [days, setDays] = useState(initialDays);
  const [savedMode, setSavedMode] = useState<"same" | "custom">(initialMode);
  const [mode, setMode] = useState<"same" | "custom">(initialMode);
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<string[]>([]);
  const [status, setStatus] = useState<{ kind: "idle" | "saving" | "saved" | "error"; text?: string }>({ kind: "idle" });
  const [backfill, setBackfill] = useState<{ kind: "loading" } | { kind: "open"; day: SprintDay; offered: OfferedItems } | null>(null);
  const [backfillError, setBackfillError] = useState<string | null>(null);

  const cells: PlanCell[] = days.map((d) => ({
    dayIndex: d.day_index,
    date: d.date,
    locked: d.closed_at !== null || isLockedDay(d.date, todayInSprintTz),
    target: Number(d.target),
    actual: d.actual === null ? null : Number(d.actual),
    missed: isMissedDay(d.date, d.closed_at, todayInSprintTz),
  }));

  async function openBackfill(index: number) {
    const day = days[index];
    setBackfillError(null);
    setBackfill({ kind: "loading" });
    const res = await callAction(() => dayOfferedItemsAction(day.id));
    if (res.error !== undefined) {
      setBackfillError(res.error);
      setBackfill(null);
      return;
    }
    setBackfill({ kind: "open", day, offered: res.offered });
  }

  const parsed = cells.map((c, i) => (editing && !c.locked ? parseTargetInput(measured.measurement, values[i] ?? "") : c.target));
  const plan = effectivePlan(cells, editing, parsed);
  const delta = plan === null ? null : planDelta(plan, goal);
  const changed = plan !== null && plan.some((t, i) => t !== cells[i].target);
  const canSave = editing && delta === 0 && changed && status.kind !== "saving";
  const openDays = cells.filter((c) => !c.locked).length;

  function startEditing() {
    setValues(cells.map((c) => formatTargetInput(measured.measurement, c.target)));
    setMode("custom");
    setEditing(true);
    setStatus({ kind: "idle" });
  }

  function cancel() {
    setEditing(false);
    setMode(savedMode);
    setStatus({ kind: "idle" });
  }

  async function save() {
    if (!plan || !canSave) return;
    setStatus({ kind: "saving" });
    const res = await callAction(() => saveTargetsAction(sprintId, plan));
    if (res.error) {
      setStatus({ kind: "error", text: res.error });
      return;
    }
    if (res.days) setDays(res.days);
    setEditing(false);
    setMode("custom");
    setSavedMode("custom");
    setStatus({ kind: "saved" });
    router.refresh();
  }

  const hint =
    !editing || canSave
      ? null
      : delta === null
        ? "Every day needs a whole-number target."
        : delta !== 0
          ? "Move the difference onto other future days until the plan is balanced."
          : "Nothing has changed yet.";

  return (
    <section className="card" style={{ marginTop: 20, padding: "22px 26px" }} data-testid="plan-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <h2 className="card-title">14-day plan</h2>
        <div style={{ display: "flex", gap: 6 }} role="group" aria-label="Target mode">
          <span className={`chip ${mode === "same" ? "chip-on" : ""}`} aria-current={mode === "same" ? "true" : undefined}>
            Same daily target
          </span>
          {sprintOver || openDays === 0 ? (
            <span className={`chip ${mode === "custom" ? "chip-on" : ""}`} aria-current={mode === "custom" ? "true" : undefined}>
              Custom
            </span>
          ) : (
            <button type="button" className={`chip ${mode === "custom" ? "chip-on" : ""}`} aria-pressed={mode === "custom"} onClick={editing ? undefined : startEditing}>
              {mode === "custom" && !editing ? "Custom · edit" : "Custom"}
            </button>
          )}
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <PlanGrid
          measured={measured}
          goal={goal}
          cells={cells}
          editing={editing}
          values={values}
          parsed={parsed}
          onChange={(i, raw) => setValues((v) => v.map((x, j) => (j === i ? raw : x)))}
          inputIdPrefix="plan-target"
          onBackfill={editing ? undefined : openBackfill}
          backfillBusy={backfill?.kind === "loading"}
        />
      </div>

      {backfillError ? (
        <ErrorBar style={{ marginTop: 12 }}>{backfillError}</ErrorBar>
      ) : null}

      {backfill?.kind === "open" ? (
        <CloseFlow
          sprintId={sprintId}
          measured={measured}
          goal={goal}
          day={backfill.day}
          offered={backfill.offered}
          highestId={highestId}
          backfill
          onCancel={() => setBackfill(null)}
          onDone={(outcome) => {
            setDays(outcome.days);
            setBackfill(null);
            router.refresh();
          }}
        />
      ) : null}

      <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 10, lineHeight: 1.5, maxWidth: "64ch" }}>
        {mode === "custom"
          ? "Every future day stands alone: editing one never changes another, and zero is fine for a day off. Past days and today are locked. The plan saves only when it totals the goal."
          : "Goal ÷ 14, the same every day. Choose Custom to set future days individually; past days and today are locked."}{" "}
        A missed day can still be backfilled; it counts, but the streak stays broken.
      </div>

      {status.kind === "error" ? (
        <ErrorBar style={{ marginTop: 12 }} action={{ label: "Retry", onClick: save }}>{status.text}</ErrorBar>
      ) : null}

      {editing ? (
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
          <span className="hint" id="plan-hint" aria-live="polite">
            {hint ?? ""}
          </span>
          <button type="button" className="btn btn-ghost" onClick={cancel} disabled={status.kind === "saving"}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" aria-disabled={!canSave} aria-describedby={hint ? "plan-hint" : undefined} onClick={save}>
            {status.kind === "saving" ? "Saving…" : "Save plan"}
          </button>
        </div>
      ) : (
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 10, textAlign: "right", minHeight: 14 }} aria-live="polite">
          {status.kind === "saved" ? "Saved" : ""}
        </div>
      )}
    </section>
  );
}
