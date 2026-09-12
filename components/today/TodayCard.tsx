"use client";

import { ErrorBar } from "@/components/ErrorBar";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { closeDayAction, saveIntention } from "@/app/(app)/actions/day";
import { removeSprintItem } from "@/app/(app)/actions/library";
import { AddItemPicker, candidatesFor } from "@/components/today/AddItemPicker";
import { DayQuestions } from "@/components/today/DayQuestions";
import { TaskList } from "@/components/today/TaskList";
import { callAction } from "@/lib/callAction";
import type { ItemKind, LibraryItem, OfferedItems, SituationItem, SprintDay, SprintItems, Task } from "@/lib/data";
import { answersHint, closeInput, EMPTY_ANSWERS, type DayAnswers } from "@/lib/dayAnswers";
import { daySummaryLine, quietItems, type DayObservations } from "@/lib/daySummary";
import { formatNumber, toBaseUnits, unitLabel, type Measured } from "@/lib/format";

/**
 * The Today card (F8, v8 README): planned in place (intention, tasks), closed in place
 * (the actual, then the F7 questions), then the result, the summary of what happened and
 * "Set up tomorrow". The DB decides what a close means; this card only asks.
 */
export function TodayCard({
  sprintId,
  measured,
  day,
  nextTarget,
  tz,
  offered,
  highestId,
  tasks,
  observations,
  items,
  library,
  situations,
  canClose,
  cannotCloseReason,
  dayOneAhead,
}: {
  sprintId: string;
  measured: Measured;
  day: SprintDay;
  /** Tomorrow's target, or null on the final day. */
  nextTarget: number | null;
  tz: string;
  offered: OfferedItems;
  highestId: string | null;
  tasks: Task[];
  observations: DayObservations;
  items: SprintItems;
  library: { cues: LibraryItem[]; impediments: LibraryItem[] };
  /** F15: the live situations per kind, for "Set up tomorrow"'s inline creates. */
  situations: { cues: SituationItem[]; impediments: SituationItem[] };
  canClose: boolean;
  cannotCloseReason?: string;
  /** The sprint starts tomorrow: this is Day 1 shown ahead of time. */
  dayOneAhead: boolean;
}) {
  const router = useRouter();
  const [reviewing, setReviewing] = useState(false);
  // Set by an inline close in this page session; drives "Set up tomorrow" until Done.
  const [justClosed, setJustClosed] = useState(false);
  const [closedDay, setClosedDay] = useState<SprintDay | null>(null);

  const current = day.closed_at !== null ? day : closedDay && closedDay.closed_at !== null ? closedDay : day;
  const closed = current.closed_at !== null;
  const target = Number(current.target);
  const tzText = tz.replace("_", " ");
  const state = closed ? "closed" : reviewing ? "reviewing" : "planning";

  return (
    <div className="today-card" data-testid="today-card" data-state={state}>
      {state === "planning" ? (
        <>
          <div className="t-head">
            <span className="t-kicker">
              {dayOneAhead ? "Day 1 target" : "Today's entry"} · target {formatNumber(measured, target)}
            </span>
            <span className="t-closes">closes 11:59 PM {tzText}</span>
          </div>
          <div className="heading t-big" data-hero>
            {formatNumber(measured, target)}
          </div>
          <div className="t-unit">{unitLabel(measured)} today</div>
          <div className="t-rule">
            <div className="t-prompt">How do I intend to produce today&apos;s target?</div>
            <Intention key={day.id} dayId={day.id} initial={day.intention ?? ""} locked={false} />
            <TaskList key={`tasks-${day.id}`} dayId={day.id} initial={tasks} locked={false} lockedReason="" />
          </div>
          <div className="t-foot">
            <span className="t-foot-hint">At the end of the day, enter the actual and log what showed up.</span>
            <span className="t-foot-actions">
              <span className="hint" id="close-reason">
                {!canClose && cannotCloseReason ? cannotCloseReason : ""}
              </span>
              <button
                type="button"
                className="btn btn-primary"
                aria-disabled={!canClose}
                aria-describedby={canClose ? undefined : "close-reason"}
                onClick={() => {
                  if (canClose) setReviewing(true);
                }}
              >
                Close the day
              </button>
            </span>
          </div>
        </>
      ) : null}

      {state === "reviewing" ? (
        <Reviewing
          sprintId={sprintId}
          measured={measured}
          day={day}
          tzText={tzText}
          offered={offered}
          highestId={highestId}
          tasks={tasks}
          onBack={() => setReviewing(false)}
          onClosed={(fresh) => {
            setClosedDay(fresh);
            setJustClosed(true);
            setReviewing(false);
            router.refresh();
          }}
        />
      ) : null}

      {state === "closed" ? (
        <Closed
          sprintId={sprintId}
          measured={measured}
          day={current}
          nextTarget={nextTarget}
          tasks={tasks}
          observations={observations}
          items={items}
          library={library}
          situations={situations}
          setupTomorrow={justClosed && nextTarget !== null}
          announce={justClosed}
          onDone={() => setJustClosed(false)}
        />
      ) : null}
    </div>
  );
}

/** The Daily Intention: one borderless line that grows, saved on blur. */
function Intention({ dayId, initial, locked }: { dayId: string; initial: string; locked: boolean }) {
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [status, setStatus] = useState<{ kind: "idle" | "saving" | "saved" | "error"; text?: string }>({ kind: "idle" });
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  async function persist() {
    if (text.trim() === saved.trim()) return;
    setStatus({ kind: "saving" });
    const res = await callAction(() => saveIntention(dayId, text));
    if (res.error) {
      setStatus({ kind: "error", text: res.error });
      return;
    }
    setSaved(text);
    setStatus({ kind: "saved" });
  }

  if (locked) {
    return text.trim() ? <div className="t-prompt mt-6" data-testid="intention-locked">{text}</div> : null;
  }

  return (
    <div data-testid="intention-card">
      <textarea
        ref={ref}
        id="intention"
        className="t-intention"
        rows={1}
        value={text}
        aria-label="Daily intention"
        onChange={(e) => setText(e.target.value)}
        onBlur={persist}
        placeholder="Today I will…"
      />
      <div className="t-status" data-tone={status.kind === "error" ? "error" : undefined} aria-live="polite">
        {status.kind === "saving" ? "Saving…" : status.kind === "saved" ? "Saved" : ""}
      </div>
      {status.kind === "error" ? (
        <ErrorBar className="mt-6" action={{ label: "Retry", onClick: persist }}>{status.text}</ErrorBar>
      ) : null}
    </div>
  );
}

/** Step 1 and 2 in one place: the actual over the questions, Back, Confirm close. */
function Reviewing({
  sprintId,
  measured,
  day,
  tzText,
  offered,
  highestId,
  tasks,
  onBack,
  onClosed,
}: {
  sprintId: string;
  measured: Measured;
  day: SprintDay;
  tzText: string;
  offered: OfferedItems;
  highestId: string | null;
  tasks: Task[];
  onBack: () => void;
  onClosed: (fresh: SprintDay) => void;
}) {
  const router = useRouter();
  const [whole, setWhole] = useState("");
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [answers, setAnswers] = useState<DayAnswers>(EMPTY_ANSWERS);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<{ text: string; closed: boolean } | null>(null);
  const [pending, start] = useTransition();
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => {
    first.current?.focus();
  }, []);

  const target = Number(day.target);
  const value =
    measured.measurement === "hours"
      ? hours === "" && minutes === ""
        ? null
        : toBaseUnits("hours", { hours: Number(hours || 0), minutes: Number(minutes || 0) })
      : whole === ""
        ? null
        : toBaseUnits(measured.measurement, { whole: Number(whole) });
  const actualValid = value !== null && Number.isInteger(value) && value >= 0 && (measured.measurement !== "hours" || Number(minutes || 0) < 60);
  const hint = !actualValid ? "Enter today's actual — zero is truthful" : answersHint(answers, offered);
  const blocked = Boolean(hint) || pending || error?.closed === true;

  function submit() {
    if (blocked || value === null) return;
    start(async () => {
      const res = await callAction(() => closeDayAction(day.id, sprintId, closeInput(answers, offered, value, notes)));
      if (res.error !== undefined) {
        setError({ text: res.error, closed: res.closed === true });
        return;
      }
      onClosed(res.days.find((d) => d.id === day.id) ?? day);
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="t-head">
        <span className="t-kicker">
          Closing Day {day.day_index} · target {formatNumber(measured, target)}
        </span>
        <span className="t-closes">closes 11:59 PM {tzText}</span>
      </div>
      {measured.measurement === "hours" ? (
        <>
          <input ref={first} className="heading t-big-input" type="number" inputMode="numeric" min={0} step={1} value={hours} onChange={(e) => setHours(e.target.value)} aria-label="Actual hours" placeholder="0" />
          <label className="t-minutes">
            <input className="input" type="number" inputMode="numeric" min={0} max={59} step={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} aria-label="Actual minutes" placeholder="00" />
            <span className="t-unit">minutes · against {formatNumber(measured, target)}</span>
          </label>
        </>
      ) : (
        <>
          <input ref={first} className="heading t-big-input" type="number" inputMode="numeric" min={0} step={1} value={whole} onChange={(e) => setWhole(e.target.value)} aria-label="Actual result" placeholder="0" />
          <div className="t-unit">
            {unitLabel(measured)} · against {formatNumber(measured, target)}
          </div>
        </>
      )}

      <div className="t-prompt mt-14">What happened on Day {day.day_index}? None and Unsure are truthful answers.</div>
      <DayQuestions offered={offered} highestId={highestId} answers={answers} onChange={setAnswers} />

      <div className="t-rule">
        <div className="t-prompt">{day.intention?.trim() ? day.intention : "Tasks"}</div>
        <TaskList key={`tasks-${day.id}`} dayId={day.id} initial={tasks} locked lockedReason="Locked while closing" />
      </div>
      <input className="t-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="A note about today (optional)" aria-label="Note" />

      {error ? (
        <div role="alert" className="error-bar mt-14">
          <span>{error.text}</span>
          {error.closed ? (
            <button type="button" className="link-quiet error-bar-action" onClick={() => router.refresh()}>
              Reload
            </button>
          ) : (
            <button type="submit" className="link-quiet error-bar-action">
              Retry
            </button>
          )}
        </div>
      ) : null}

      <div className="t-foot">
        <span className="hint" id="close-hint" aria-live="polite">
          {hint ?? ""}
        </span>
        <span className="t-foot-actions">
          <button type="button" className="t-back" onClick={onBack}>
            Back
          </button>
          <button type="submit" className="btn btn-primary" aria-disabled={blocked} aria-describedby={hint ? "close-hint" : undefined}>
            {pending ? "Closing…" : "Confirm close"}
          </button>
        </span>
      </div>
    </form>
  );
}

/** The closed day: result, summary line, note, intention and tasks read-only, "Set up tomorrow". */
function Closed({
  sprintId,
  measured,
  day,
  nextTarget,
  tasks,
  observations,
  items,
  library,
  situations,
  setupTomorrow,
  announce,
  onDone,
}: {
  sprintId: string;
  measured: Measured;
  day: SprintDay;
  nextTarget: number | null;
  tasks: Task[];
  observations: DayObservations;
  items: SprintItems;
  library: { cues: LibraryItem[]; impediments: LibraryItem[] };
  situations: { cues: SituationItem[]; impediments: SituationItem[] };
  setupTomorrow: boolean;
  /** The close just happened here: the result takes focus so it is announced (SC 4.1.3). */
  announce: boolean;
  onDone: () => void;
}) {
  const [adding, setAdding] = useState<ItemKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const actual = Number(day.actual ?? 0);
  const target = Number(day.target);
  const atOrAbove = actual >= target;
  const result = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (announce) result.current?.focus();
  }, [announce]);
  const summary = daySummaryLine(observations);
  const quiet = quietItems(observations);
  // Only items still in the sprint can be pruned; a removed one drops out on refresh.
  const quietImps = quiet.impediments.map((q) => items.impediments.find((i) => i.id === q.id)).filter((i): i is SprintItems["impediments"][number] => Boolean(i));
  const quietCues = quiet.cues.map((q) => items.cues.find((c) => c.id === q.id)).filter((c): c is SprintItems["cues"][number] => Boolean(c));

  function remove(kind: ItemKind, id: string) {
    setError(null);
    start(async () => {
      const res = await callAction(() => removeSprintItem(sprintId, kind, id));
      if (res.error) setError(res.error);
    });
  }

  return (
    <>
      <div className="t-head">
        <span className="t-kicker">Today&apos;s entry · closed</span>
        <span className="t-closes">closed</span>
      </div>
      {/* Focus lands on the whole result so the actual and its verdict are read together. */}
      <div ref={result} tabIndex={-1} className="focus-quiet">
        <div className="heading t-big" data-testid="closed-actual" data-state={atOrAbove ? "at-or-above" : "under"}>
          {formatNumber(measured, actual)}
        </div>
        <div className="t-unit">
          {unitLabel(measured)} against {formatNumber(measured, target)}
          {atOrAbove ? "" : " · under target"}
        </div>
      </div>
      {summary ? (
        <div className="t-summary" data-testid="day-summary">
          {summary}
        </div>
      ) : null}
      {day.notes?.trim() ? <blockquote className="t-quote">“{day.notes}”</blockquote> : null}
      <div className="t-rule">
        {day.intention?.trim() ? <div className="t-prompt" data-testid="intention-locked">{day.intention}</div> : null}
        <TaskList key={`tasks-${day.id}`} dayId={day.id} initial={tasks} locked lockedReason="Locked with the closed day" />
      </div>

      {setupTomorrow ? (
        <div className="t-tomorrow" data-testid="setup-tomorrow">
          <div className="r-head">
            <span className="t-kicker">Set up tomorrow · Day {day.day_index + 1}</span>
            <button type="button" className="j-link" onClick={onDone}>
              Done
            </button>
          </div>
          <div className="t-tomorrow-blurb">Keep what still matters. Anything you remove leaves this sprint, not the library.</div>
          {error ? (
            <ErrorBar className="mt-10" action={{ label: "Dismiss", onClick: () => setError(null) }}>{error}</ErrorBar>
          ) : null}
          {quietImps.length > 0 ? (
            <>
              <div className="t-tomorrow-section">Didn&apos;t show up today</div>
              {quietImps.map((i) => (
                <div key={i.id} className="t-tomorrow-item" data-testid="quiet-impediment">
                  <span>{i.name}</span>
                  <button type="button" className="j-link j-link-muted" disabled={pending} onClick={() => remove("impediment", i.id)} aria-label={`Remove ${i.name}`}>
                    Remove
                  </button>
                </div>
              ))}
            </>
          ) : null}
          {quietCues.length > 0 ? (
            <>
              <div className="t-tomorrow-section">Not used today</div>
              {quietCues.map((c) => (
                <div key={c.id} className="t-tomorrow-item" data-testid="quiet-cue">
                  <span>{c.name}</span>
                  <button type="button" className="j-link j-link-muted" disabled={pending} onClick={() => remove("cue", c.id)} aria-label={`Remove ${c.name}`}>
                    Remove
                  </button>
                </div>
              ))}
            </>
          ) : null}
          {quietImps.length === 0 && quietCues.length === 0 ? <div className="t-tomorrow-section">Everything in the sprint earned its place today.</div> : null}
          <div className="t-tomorrow-adds">
            {items.impediments.length < 3 ? (
              <button type="button" className="j-link" onClick={() => setAdding("impediment")}>
                Add impediment
              </button>
            ) : null}
            {items.cues.length < 3 ? (
              <button type="button" className="j-link" onClick={() => setAdding("cue")}>
                Add cue
              </button>
            ) : null}
          </div>
          {adding ? (
            <AddItemPicker
              kind={adding}
              sprintId={sprintId}
              candidates={candidatesFor(adding, library, adding === "cue" ? items.cues : items.impediments)}
              situations={adding === "cue" ? situations.cues : situations.impediments}
              onClose={() => setAdding(null)}
            />
          ) : null}
        </div>
      ) : null}

      <div className="t-locked" data-testid="day-locked">
        Day closed · locked · {nextTarget === null ? "final day" : `tomorrow's target ${formatNumber(measured, nextTarget)}`}
      </div>
    </>
  );
}
