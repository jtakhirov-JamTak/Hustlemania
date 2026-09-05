"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveTargetsAction } from "@/app/(app)/actions";
import { effectivePlan, PlanGrid, type PlanCell } from "@/components/PlanGrid";
import type { SprintDay } from "@/lib/data";
import type { Measured } from "@/lib/format";
import { formatTargetInput, isLockedDay, parseTargetInput } from "@/lib/targets";

/**
 * The 14-day plan on Today (PRD §6). "Same" is the plan the sprint started with;
 * "Custom" opens every future day for editing. Save stays disabled until the plan
 * totals the goal again (rule 11); begun days are shown locked (rule 10); nothing is
 * redistributed for the user (rule 12).
 */
export function PlanCard({
  sprintId,
  measured,
  goal,
  initialMode,
  days: initialDays,
  todayInSprintTz,
  locked,
}: {
  sprintId: string;
  measured: Measured;
  goal: number;
  initialMode: "same" | "custom";
  days: SprintDay[];
  todayInSprintTz: string;
  locked: boolean;
}) {
  const router = useRouter();
  const [days, setDays] = useState(initialDays);
  const [savedMode, setSavedMode] = useState<"same" | "custom">(initialMode);
  const [mode, setMode] = useState<"same" | "custom">(initialMode);
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<string[]>([]);
  const [status, setStatus] = useState<{ kind: "idle" | "saving" | "saved" | "error"; text?: string }>({ kind: "idle" });

  const cells: PlanCell[] = days.map((d) => ({
    dayIndex: d.day_index,
    date: d.date,
    locked: d.closed_at !== null || isLockedDay(d.date, todayInSprintTz),
    target: Number(d.target),
    actual: d.actual === null ? null : Number(d.actual),
  }));
  const parsed = cells.map((c, i) => (editing && !c.locked ? parseTargetInput(measured.measurement, values[i] ?? "") : c.target));
  const plan = effectivePlan(cells, editing, parsed);
  const delta = plan === null ? null : plan.reduce((a, b) => a + b, 0) - goal;
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
    if (!plan) return;
    setStatus({ kind: "saving" });
    const res = await saveTargetsAction(sprintId, plan);
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
        <span style={{ fontSize: 13, fontWeight: 600 }}>14-day plan</span>
        <div style={{ display: "flex", gap: 6 }} role="group" aria-label="Target mode">
          <span className={`chip ${mode === "same" ? "chip-on" : ""}`} aria-current={mode === "same" ? "true" : undefined}>
            Same daily target
          </span>
          {locked || openDays === 0 ? (
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
        <PlanGrid measured={measured} goal={goal} cells={cells} editing={editing} values={values} parsed={parsed} onChange={(i, raw) => setValues((v) => v.map((x, j) => (j === i ? raw : x)))} inputIdPrefix="plan-target" />
      </div>

      <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 10, lineHeight: 1.5, maxWidth: "64ch" }}>
        {mode === "custom"
          ? "Every future day stands alone: editing one never changes another, and zero is fine for a day off. Past days and today are locked. The plan saves only when it totals the goal."
          : "Goal ÷ 14, the same every day. Choose Custom to set future days individually; past days and today are locked."}
      </div>

      {status.kind === "error" ? (
        <div role="alert" className="error-bar" style={{ marginTop: 12 }}>
          <span>{status.text}</span>
          <button type="button" className="link-quiet" style={{ color: "inherit", fontWeight: 600 }} onClick={save}>
            Retry
          </button>
        </div>
      ) : null}

      {editing ? (
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
          {hint ? <span className="hint">{hint}</span> : null}
          <button type="button" className="btn btn-ghost" onClick={cancel} disabled={status.kind === "saving"}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={!canSave} onClick={save}>
            {status.kind === "saving" ? "Saving…" : "Save plan"}
          </button>
        </div>
      ) : status.kind === "saved" ? (
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 10, textAlign: "right" }}>Saved</div>
      ) : null}
    </section>
  );
}
