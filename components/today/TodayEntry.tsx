"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { saveIntention } from "@/app/(app)/actions/day";
import { createTask, removeTask } from "@/app/(app)/actions/tasks";
import { CaptureBox, focusMissingPart, type CapturePhase } from "@/components/CaptureBox";
import { ErrorBar } from "@/components/ErrorBar";
import { TaskList } from "@/components/today/TaskList";
import { callAction } from "@/lib/callAction";
import { emptyParts, joinParts, missingPart, partList, partText, type Parts } from "@/lib/capture";
import type { Task } from "@/lib/data";
import { GENERIC_SAVE_ERROR } from "@/lib/errors";
import { type EntryStep, planEntrySteps, RERECORD_LINE, savedSoFar } from "@/lib/todayEntry";

type Row = { id: string; text: string; done: boolean };

/** One Save: the steps in order, the first not yet done, what the creates produced, the done tasks that stay. */
type Run = { steps: EntryStep[]; next: number; created: Row[]; kept: Row[]; error: string | null; gen: number };

/**
 * F19: Today's entry as one box. On a fresh day the card shows the box ("Today I will … My
 * tasks are …"); Save writes the intention, then creates the tasks in order — a failure
 * mid-list keeps what landed and Retry continues from there. Afterwards the intention is
 * a line, the tasks the F4 list, and Re-record opens the box again: the new recording
 * replaces the intention, keeps every task already done, archives the undone ones and
 * creates the new list.
 */
export function TodayEntry({ dayId, intention, tasks }: { dayId: string; intention: string; tasks: Task[] }) {
  const router = useRouter();
  // Saved here this page session, shown until the refresh brings the same value back as a prop.
  const [saved, setSaved] = useState<{ intention: string; gen: number } | null>(null);
  const [rerecording, setRerecording] = useState(false);
  const [prefill, setPrefill] = useState("");
  const [boxKey, setBoxKey] = useState(0);
  const [parts, setParts] = useState<Parts>(() => emptyParts("today"));
  const [phase, setPhase] = useState<CapturePhase>("idle");
  // The list's live rows (TaskList reports every tick, add and remove): what a re-recording
  // reads, and what the list restarts from when the box closes again.
  const [rows, setRows] = useState<Row[]>(() => tasks.map((t) => ({ id: t.id, text: t.text, done: t.done })));
  const [run, setRun] = useState<Run | null>(null);
  const [pending, start] = useTransition();
  // Set synchronously on Save: `pending` is transition state and is false until the
  // re-render, so clicks landing in the same tick would each start a plan (eval-12 P2-1).
  const saving = useRef(false);
  const line = useRef<HTMLDivElement>(null);
  // After a Save the form is gone; the intention line takes focus so the result is announced.
  useEffect(() => {
    if (saved) line.current?.focus();
  }, [saved]);

  const current = saved ?? { intention: intention.trim(), gen: 0 };
  const showBox = rerecording || (!current.intention && rows.length === 0);
  const hint = phase === "parsing" ? "Reading your words…" : (missingPart("today", parts)?.hint ?? null);

  function execute(r: Run) {
    start(async () => {
      const created = [...r.created];
      for (let next = r.next; next < r.steps.length; next++) {
        const step = r.steps[next];
        let error: string | undefined;
        if (step.kind === "intention") {
          error = (await callAction(() => saveIntention(dayId, step.text))).error;
        } else if (step.kind === "archive") {
          error = (await callAction(() => removeTask(step.id))).error;
        } else {
          const res = await callAction(() => createTask(dayId, step.text, step.id));
          if (res.error || !res.task) error = res.error ?? GENERIC_SAVE_ERROR;
          else created.push({ id: res.task.id, text: res.task.text, done: res.task.done });
        }
        if (error) {
          saving.current = false;
          setRun({ ...r, next, created, error });
          return;
        }
      }
      saving.current = false;
      const first = r.steps[0];
      setSaved({ intention: first.kind === "intention" ? first.text : "", gen: r.gen });
      setRows([...r.kept, ...created]);
      setRun(null);
      setRerecording(false);
      setParts(emptyParts("today"));
      setPhase("idle");
      router.refresh();
    });
  }

  function save() {
    if (pending || saving.current) return;
    if (run) {
      saving.current = true;
      execute(run);
      return;
    }
    if (hint) {
      focusMissingPart("today", "today", parts);
      return;
    }
    saving.current = true;
    const r: Run = {
      steps: planEntrySteps({ intention: partText(parts, "intention"), tasks: partList(parts, "tasks"), existing: rows }),
      next: 0,
      created: [],
      kept: rows.filter((t) => t.done),
      error: null,
      gen: current.gen + 1,
    };
    setRun(r);
    execute(r);
  }

  function openRerecord() {
    setParts(emptyParts("today"));
    setPhase("idle");
    setPrefill(joinParts("today", { intention: current.intention, tasks: rows.filter((t) => !t.done).map((t) => t.text) }));
    setBoxKey((k) => k + 1);
    setRerecording(true);
  }

  function cancel() {
    setRerecording(false);
    setParts(emptyParts("today"));
    setPhase("idle");
  }

  if (!showBox) {
    return (
      <div data-testid="today-entry" data-state="saved">
        <div
          ref={line}
          tabIndex={-1}
          className={`t-intention-line focus-quiet ${current.intention ? "" : "t-intention-missing"}`}
          data-testid="intention-line"
          data-missing={current.intention ? undefined : "true"}
        >
          {current.intention || "No intention yet — Re-record to say one."}
        </div>
        <TaskList key={`tasks-${dayId}-${current.gen}`} dayId={dayId} initial={rows} locked={false} lockedReason="" onRows={setRows} />
        <div className="t-rerecord">
          <button type="button" className="btn btn-ghost btn-ghost-accent" onClick={openRerecord}>
            Re-record
          </button>
          <span className="hint">{RERECORD_LINE}</span>
        </div>
      </div>
    );
  }

  const busy = pending || run !== null;
  return (
    <form
      className="t-entry"
      data-testid="today-entry"
      data-state={rerecording ? "rerecording" : "box"}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <CaptureBox key={boxKey} kind="today" idPrefix="today" mode="capture" parts={parts} onParts={setParts} onPhase={setPhase} disabled={busy} initialText={rerecording ? prefill : undefined} />
      {run?.error ? (
        <ErrorBar className="mt-12" action={{ label: "Retry", onClick: save }}>
          {run.error} {savedSoFar(run.steps, run.next)}
        </ErrorBar>
      ) : null}
      <div className="j-plan-actions">
        <span className="hint" id="today-hint" aria-live="polite">
          {hint ?? ""}
        </span>
        {rerecording && !run ? (
          <button type="button" className="btn btn-ghost" onClick={cancel}>
            Cancel
          </button>
        ) : null}
        <button type="submit" className="btn btn-primary" aria-disabled={busy || Boolean(hint)} aria-describedby={hint ? "today-hint" : undefined}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
