"use client";

import { ErrorBar } from "@/components/ErrorBar";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { dayOfferedItemsAction } from "@/app/(app)/actions/day";
import { saveTargetsAction } from "@/app/(app)/actions/sprint";
import { CloseFlow } from "@/components/today/CloseFlow";
import { callAction } from "@/lib/callAction";
import type { OfferedItems, SprintDay } from "@/lib/data";
import { showedUpTail, type DayObservations } from "@/lib/daySummary";
import { formatIsoDate } from "@/lib/dates";
import { formatAmount, formatNumber, type Measured } from "@/lib/format";
import { formatTargetInput, isLockedDay, isMissedDay, parseTargetInput, planDelta } from "@/lib/targets";

type Fold = "past" | "yesterday" | "tomorrow" | "future";

/**
 * The 14-day timeline (F8, v8 README): earlier days folded, Yesterday, the Today slot,
 * Tomorrow, the rest folded. A closed row is one line; a missed row opens the backfill
 * modal; a future row shows its target and, while editing, an input. Editing follows the
 * PRD §6 rules unchanged: Save waits until the plan totals the goal again (rule 11),
 * begun days are locked (rule 10), nothing is redistributed (rule 12).
 */
export function Timeline({
  sprintId,
  measured,
  goal,
  days: initialDays,
  focusIndex,
  todayInSprintTz,
  observations,
  highestId,
  initialMode,
  sprintOver,
  today,
}: {
  sprintId: string;
  measured: Measured;
  goal: number;
  days: SprintDay[];
  /** The day in the Today slot (1–14), or 15 once the window has passed. */
  focusIndex: number;
  todayInSprintTz: string;
  observations: Map<string, DayObservations>;
  highestId: string | null;
  initialMode: "same" | "custom";
  sprintOver: boolean;
  /** The Today card, or the ended panel. */
  today: React.ReactNode;
}) {
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const [days, setDays] = useState(initialDays);
  // Fresh rows from the server (after a refresh) replace the local copy a save or a backfill left.
  const [seen, setSeen] = useState(initialDays);
  if (seen !== initialDays) {
    setSeen(initialDays);
    setDays(initialDays);
  }
  const [open, setOpen] = useState<Record<Fold, boolean>>({ past: false, yesterday: false, tomorrow: false, future: false });
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<"same" | "custom">(initialMode);
  const [values, setValues] = useState<Record<number, string>>({});
  const [status, setStatus] = useState<{ kind: "idle" | "saving" | "saved" | "error"; text?: string }>({ kind: "idle" });
  const [backfill, setBackfill] = useState<{ kind: "loading"; index: number } | { kind: "open"; day: SprintDay; offered: OfferedItems } | null>(null);
  const [backfillError, setBackfillError] = useState<string | null>(null);

  const locked = (d: SprintDay) => d.closed_at !== null || isLockedDay(d.date, todayInSprintTz);
  const openDays = days.filter((d) => !locked(d)).length;

  const parsed = days.map((d) => (editing && !locked(d) ? parseTargetInput(measured.measurement, values[d.day_index] ?? "") : Number(d.target)));
  const plan = parsed.every((t): t is number => t !== null) ? parsed : null;
  const delta = plan === null ? null : planDelta(plan, goal);
  const changed = plan !== null && plan.some((t, i) => t !== Number(days[i].target));
  const canSave = editing && delta === 0 && changed && status.kind !== "saving";

  function startEditing() {
    if (sprintOver || openDays === 0) return;
    setValues(Object.fromEntries(days.map((d) => [d.day_index, formatTargetInput(measured.measurement, Number(d.target))])));
    setMode("custom");
    setEditing(true);
    setStatus({ kind: "idle" });
  }

  function cancel() {
    setEditing(false);
    setMode(initialMode);
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
    setStatus({ kind: "saved" });
    router.refresh();
  }

  async function openBackfill(day: SprintDay) {
    setBackfillError(null);
    setBackfill({ kind: "loading", index: day.day_index });
    const res = await callAction(() => dayOfferedItemsAction(day.id));
    if (res.error !== undefined) {
      setBackfillError(res.error);
      setBackfill(null);
      return;
    }
    setBackfill({ kind: "open", day, offered: res.offered });
  }

  const hint =
    !editing || canSave
      ? null
      : delta === null
        ? "Every day needs a whole-number target."
        : delta !== 0
          ? "Move the difference onto other future days until the plan is balanced."
          : "Nothing has changed yet.";

  const toggle = (k: Fold) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const byIndex = (i: number) => days.find((d) => d.day_index === i);
  const range = (a: number, b: number) => `${formatIsoDate(byIndex(a)!.date, { month: "short", day: "numeric" })} – ${formatIsoDate(byIndex(b)!.date, { month: "short", day: "numeric" })}`;

  const yesterday = focusIndex >= 2 ? byIndex(focusIndex - 1) : undefined;
  const tomorrow = focusIndex + 1 <= 14 ? byIndex(focusIndex + 1) : undefined;
  const pastFold = focusIndex >= 3 ? { from: 1, to: focusIndex - 2 } : null;
  const futureFold = focusIndex + 2 <= 14 ? { from: focusIndex + 2, to: 14 } : null;
  const pastOpen = open.past;
  const futureOpen = open.future || editing;
  const tomorrowOpen = open.tomorrow || editing;

  const rowFor = (d: SprintDay, hide?: Fold) => {
    const closed = d.closed_at !== null;
    const missed = isMissedDay(d.date, d.closed_at, todayInSprintTz);
    const isLocked = locked(d);
    const obs = observations.get(d.id);
    const hideButton = hide ? (
      <button type="button" className="j-link" onClick={() => toggle(hide)}>
        hide
      </button>
    ) : null;
    if (closed) {
      const actual = Number(d.actual ?? 0);
      const state = actual >= Number(d.target) ? "at-or-above" : "under";
      return (
        <DayRow key={d.id} d={d} kind="closed" tone={state === "at-or-above" ? "met" : "under"}>
          <div className="j-closed">
            <span>
              <strong>{formatNumber(measured, actual)}</strong> <span className="j-of">of {formatNumber(measured, Number(d.target))}{obs ? showedUpTail(obs) : ""}</span>
            </span>
            <span className="j-row-actions">
              <span className="j-verdict" data-state={state}>
                {state === "at-or-above" ? "met" : "under"}
              </span>
              {hideButton}
            </span>
          </div>
        </DayRow>
      );
    }
    if (missed) {
      return (
        <DayRow key={d.id} d={d} kind="missed">
          <div className="j-missed">
            <span>Missed · target {formatNumber(measured, Number(d.target))}</span>
            <span className="j-row-actions">
              <button type="button" className="j-link" disabled={backfill !== null} aria-busy={backfill?.kind === "loading" && backfill.index === d.day_index ? true : undefined} onClick={() => openBackfill(d)} aria-label={`Backfill day ${d.day_index}`}>
                add
              </button>
              {hideButton}
            </span>
          </div>
        </DayRow>
      );
    }
    const editable = editing && !isLocked;
    const invalid = editable && parsed[d.day_index - 1] === null;
    return (
      <DayRow key={d.id} d={d} kind="future">
        <div className="j-future">
          {editable ? (
            <span className="row">
              Target{" "}
              <input
                id={`plan-target-${d.day_index}`}
                className="input plan-input"
                aria-label={`Day ${d.day_index} target`}
                aria-invalid={invalid || undefined}
                inputMode={measured.measurement === "hours" ? "text" : "numeric"}
                value={values[d.day_index] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [d.day_index]: e.target.value }))}
              />
            </span>
          ) : (
            <span>
              Target <span data-testid={`plan-target-${d.day_index}`}>{formatNumber(measured, Number(d.target))}</span>
              {isLocked ? " · locked" : ""}
            </span>
          )}
          <span className="j-row-actions">
            {!editing && d.day_index === focusIndex + 1 && !sprintOver && openDays > 0 ? (
              <button type="button" className="j-link" onClick={startEditing}>
                edit
              </button>
            ) : null}
            {editing ? null : hideButton}
          </span>
        </div>
      </DayRow>
    );
  };

  return (
    <>
      <div className="timeline" data-testid="timeline" ref={root}>
        {pastFold ? (
          <FoldRow label={pastFold.to === 1 ? "Day 1" : `Days 1–${pastFold.to}`} sub={range(pastFold.from, pastFold.to)} text="Earlier in the sprint" open={pastOpen} onToggle={() => toggle("past")} />
        ) : null}
        {pastFold && pastOpen ? days.filter((d) => d.day_index >= pastFold.from && d.day_index <= pastFold.to).map((d) => rowFor(d)) : null}

        {yesterday ? (
          open.yesterday ? (
            rowFor(yesterday, "yesterday")
          ) : (
            <FoldRow label={`Day ${yesterday.day_index}`} sub={longDate(yesterday.date)} text="Yesterday" open={false} onToggle={() => toggle("yesterday")} />
          )
        ) : null}

        {focusIndex <= 14 ? (
          <>
            <div className="j-label" data-today="true">
              Day {focusIndex} · today
              <DateSub date={byIndex(focusIndex)!.date} />
            </div>
            <div className="j-row" data-kind="today" data-day={focusIndex} data-testid="day-row">
              <span className="j-dot" data-tone="today" />
              {today}
            </div>
          </>
        ) : (
          <>
            <div className="j-label" data-today="true">
              Sprint over
            </div>
            <div className="j-row" data-kind="today" data-testid="day-row">
              <span className="j-dot" data-tone="today" />
              {today}
            </div>
          </>
        )}

        {tomorrow ? (
          tomorrowOpen ? (
            rowFor(tomorrow, "tomorrow")
          ) : (
            <FoldRow label={`Day ${tomorrow.day_index}`} sub={longDate(tomorrow.date)} text="Tomorrow" open={false} onToggle={() => toggle("tomorrow")} />
          )
        ) : null}

        {futureFold ? (
          <FoldRow label={futureFold.from === 14 ? "Day 14" : `Days ${futureFold.from}–14`} sub={range(futureFold.from, 14)} text="Rest of the sprint" open={futureOpen} onToggle={() => toggle("future")} />
        ) : null}
        {futureFold && futureOpen ? days.filter((d) => d.day_index >= futureFold.from).map((d) => rowFor(d)) : null}
      </div>

      <div className="j-plan" data-testid="plan-modes">
        <div className="pill-row" role="group" aria-label="Target mode">
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
        {editing ? (
          <div className="plan-summary" data-testid="plan-summary">
            <span className="plan-summary-item">
              Planned <strong>{plan === null ? "—" : formatAmount(measured, plan.reduce((a, b) => a + b, 0))}</strong>
            </span>
            <span className="plan-summary-item">
              Goal · locked <strong>{formatAmount(measured, goal)}</strong>
            </span>
            <span className="plan-delta" data-testid="plan-delta" data-state={delta === null ? "invalid" : delta === 0 ? "balanced" : delta < 0 ? "below" : "above"}>
              {delta === null ? "Fix the highlighted day" : delta === 0 ? "Balanced" : delta < 0 ? `−${formatAmount(measured, -delta)} below goal` : `+${formatAmount(measured, delta)} above goal`}
            </span>
          </div>
        ) : null}
      </div>

      {status.kind === "error" ? (
        <ErrorBar className="mt-12" action={{ label: "Retry", onClick: save }}>{status.text}</ErrorBar>
      ) : null}
      {backfillError ? <ErrorBar className="mt-12">{backfillError}</ErrorBar> : null}

      {editing ? (
        <div className="j-plan-actions">
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
        <div className="t-status" style={{ textAlign: "right" }} aria-live="polite">
          {status.kind === "saved" ? "Saved" : ""}
        </div>
      )}

      <div className="j-footnote">
        {mode === "custom"
          ? "Every future day stands alone: editing one never changes another, and zero is fine for a day off. Past days and today are locked. "
          : "Goal ÷ 14, the same every day. Choose Custom to set future days individually; past days and today are locked. "}
        Tap a day to see what happened or set its target. Missed days can be added there — they count toward the goal, not the streak.
      </div>

      {backfill?.kind === "open" ? (
        <CloseFlow
          sprintId={sprintId}
          measured={measured}
          goal={goal}
          day={backfill.day}
          offered={backfill.offered}
          highestId={highestId}
          onCancel={() => setBackfill(null)}
          onDone={(outcome) => {
            const index = backfill.day.day_index;
            setDays(outcome.days);
            setBackfill(null);
            router.refresh();
            // The modal would return focus to the "add" button, which is disabled while it
            // is open and gone once the row re-renders as closed; the closed row takes it.
            requestAnimationFrame(() => root.current?.querySelector<HTMLElement>(`[data-kind="closed"][data-day="${index}"]`)?.focus());
          }}
        />
      ) : null}
    </>
  );
}

function longDate(date: string) {
  return formatIsoDate(date, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function DateSub({ date }: { date: string }) {
  return (
    <>
      <span className="j-label-sub j-label-long">{longDate(date)}</span>
      <span className="j-label-sub j-label-short">{formatIsoDate(date, { weekday: "short", month: "short", day: "numeric" })}</span>
    </>
  );
}

function DayRow({ d, kind, tone, children }: { d: SprintDay; kind: "closed" | "missed" | "future"; tone?: "met" | "under"; children: React.ReactNode }) {
  return (
    <>
      <div className="j-label">
        Day {d.day_index}
        <DateSub date={d.date} />
      </div>
      <div className="j-row" data-kind={kind} data-day={d.day_index} data-testid="day-row" tabIndex={-1}>
        <span className="j-dot" data-tone={tone} />
        {children}
      </div>
    </>
  );
}

function FoldRow({ label, sub, text, open, onToggle }: { label: string; sub: string; text: string; open: boolean; onToggle: () => void }) {
  return (
    <>
      <div className="j-label">
        {label}
        <span className="j-label-sub">{sub}</span>
      </div>
      <div className="j-row" data-kind="summary" data-testid="day-row">
        <span className="j-dot" />
        <button type="button" className="j-fold" aria-expanded={open} onClick={onToggle}>
          <span>{text}</span>
          <span className="j-link">{open ? "hide" : "show"}</span>
        </button>
      </div>
    </>
  );
}
