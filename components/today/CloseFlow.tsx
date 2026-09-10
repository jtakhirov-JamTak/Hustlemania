"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { closeDayAction } from "@/app/(app)/actions/day";
import { Modal } from "@/components/Modal";
import { answersHint, closeInput, DayQuestions, EMPTY_ANSWERS, highestOf, type DayAnswers } from "@/components/today/DayQuestions";
import { callAction } from "@/lib/callAction";
import type { OfferedItems, SprintDay } from "@/lib/data";
import { attainmentPct, formatAmount, formatNumber, toBaseUnits, unitLabel, type Measured } from "@/lib/format";

export type CloseOutcome = { days: SprintDay[]; streak: number };

/**
 * The backfill of a missed day (F5): the two-step modal, then the result screen. Today's
 * own close happens inline on the Today card (F8); both render the same question set.
 */
export function CloseFlow({
  sprintId,
  measured,
  goal,
  day,
  offered,
  highestId,
  onCancel,
  onDone,
}: {
  sprintId: string;
  measured: Measured;
  goal: number;
  day: SprintDay;
  offered: OfferedItems;
  /** The sprint's highest impediment: its occurrence opens the response questions (F7). */
  highestId: string | null;
  onCancel: () => void;
  /** After the result screen is dismissed; the rows are the sprint's fresh days. */
  onDone: (outcome: CloseOutcome) => void;
}) {
  const [outcome, setOutcome] = useState<CloseOutcome | null>(null);
  if (outcome) {
    return (
      <ResultScreen
        measured={measured}
        goal={goal}
        day={outcome.days.find((d) => d.id === day.id) ?? day}
        days={outcome.days}
        streak={outcome.streak}
        onBack={() => onDone(outcome)}
      />
    );
  }
  return <CloseDialog sprintId={sprintId} measured={measured} day={day} offered={offered} highestId={highestId} onCancel={onCancel} onClosed={setOutcome} />;
}

function CloseDialog(props: {
  sprintId: string;
  measured: Measured;
  day: SprintDay;
  offered: OfferedItems;
  highestId: string | null;
  onCancel: () => void;
  onClosed: (outcome: CloseOutcome) => void;
}) {
  const { measured, day, offered } = props;
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [whole, setWhole] = useState("");
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [answers, setAnswers] = useState<DayAnswers>(EMPTY_ANSWERS);
  const [notes, setNotes] = useState("");
  // `closed` means the day did close and only the refresh failed: no retry, reload instead.
  const [error, setError] = useState<{ text: string; closed: boolean } | null>(null);
  const [pending, start] = useTransition();
  const first = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  // A step change is a new screen: its heading takes focus and is announced.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) heading.current?.focus();
    opened.current = true;
  }, [step]);

  const value =
    measured.measurement === "hours"
      ? hours === "" && minutes === ""
        ? null
        : toBaseUnits("hours", { hours: Number(hours || 0), minutes: Number(minutes || 0) })
      : whole === ""
        ? null
        : toBaseUnits(measured.measurement, { whole: Number(whole) });
  const actualValid = value !== null && Number.isInteger(value) && value >= 0 && (measured.measurement !== "hours" || Number(minutes || 0) < 60);
  const step1Hint = actualValid ? null : "Enter the actual, zero included.";

  const highest = highestOf(offered, props.highestId);
  const step2Hint = answersHint(answers, highest);
  const hint = step === 1 ? step1Hint : step2Hint;
  const closeBlocked = Boolean(step2Hint) || pending || error?.closed === true;

  function submit() {
    if (closeBlocked || step1Hint || value === null) return;
    start(async () => {
      const res = await callAction(() => closeDayAction(day.id, props.sprintId, closeInput(answers, offered, highest, value, notes)));
      if (res.error !== undefined) {
        setError({ text: res.error, closed: res.closed === true });
        return;
      }
      props.onClosed(res);
    });
  }

  return (
    <Modal labelledBy="close-title" onDismiss={props.onCancel} initialFocus={first} maxWidth={620}>
      <div className="dialog-head">
        <span className="label-muted" data-testid="close-step">
          Backfill day {day.day_index} · step {step} of 2
        </span>
        <button type="button" className="link-quiet dialog-x" aria-label="Cancel" onClick={props.onCancel}>
          ×
        </button>
      </div>

      <form
        className="dialog-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (step === 1) {
            if (!step1Hint) setStep(2);
          } else submit();
        }}
      >
        <div className="dialog-body">
          {step === 1 ? (
            <>
              <h2 id="close-title" ref={heading} tabIndex={-1} className="heading dialog-title">
                What was the actual result?
              </h2>
              <div className="dialog-blurb" data-testid="close-note">
                Day {day.day_index}&apos;s target was <strong className="dialog-strong">{formatAmount(measured, Number(day.target))}</strong>. A backfill counts toward the goal and insights, but
                never repairs the streak.
              </div>
              <div className="mt-18">
                {measured.measurement === "hours" ? (
                  <div className="row">
                    <label className="grow">
                      <span className="label-muted">Hours</span>
                      <input ref={first} className="input input-hero" type="number" inputMode="numeric" min={0} step={1} value={hours} onChange={(e) => setHours(e.target.value)} />
                    </label>
                    <label className="grow">
                      <span className="label-muted">Minutes</span>
                      <input className="input input-hero" type="number" inputMode="numeric" min={0} max={59} step={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
                    </label>
                  </div>
                ) : (
                  <label className="block">
                    <span className="label-muted">Actual · {unitLabel(measured)}</span>
                    <input
                      ref={first}
                      className="input input-hero"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      value={whole}
                      onChange={(e) => setWhole(e.target.value)}
                      aria-label="Actual result"
                    />
                  </label>
                )}
              </div>
            </>
          ) : (
            <>
              <h2 id="close-title" ref={heading} tabIndex={-1} className="heading dialog-title">
                What happened on Day {day.day_index}?
              </h2>
              <div className="dialog-blurb">None and Unsure are truthful answers.</div>

              <DayQuestions offered={offered} highest={highest} answers={answers} onChange={setAnswers} />

              <label className="block mt-18">
                <span className="label-muted">Notes · optional</span>
                <textarea className="input mt-6" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything worth remembering about today" />
              </label>
            </>
          )}

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
        </div>

        <div className="dialog-foot">
          {step === 1 ? (
            <button type="button" className="btn btn-ghost" onClick={props.onCancel}>
              Cancel
            </button>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={() => setStep(1)}>
              Back
            </button>
          )}
          <div className="row">
            <span className="hint" id="close-hint" aria-live="polite">
              {hint ?? ""}
            </span>
            {step === 1 ? (
              <button type="submit" className="btn btn-primary" aria-disabled={Boolean(step1Hint)} aria-describedby={step1Hint ? "close-hint" : undefined}>
                Continue
              </button>
            ) : (
              <button type="submit" className="btn btn-primary" aria-disabled={closeBlocked} aria-describedby={step2Hint ? "close-hint" : undefined}>
                {pending ? "Closing…" : "Close the day"}
              </button>
            )}
          </div>
        </div>
      </form>
    </Modal>
  );
}

/**
 * What a close leaves behind: the actual, the 14-day strip, streak, cumulative, next
 * target. Whether it was a backfill comes from the row the DB wrote, never from the
 * caller: a close submitted after midnight is a backfill however the dialog opened.
 */
function ResultScreen({
  measured,
  goal,
  day,
  days,
  streak,
  onBack,
}: {
  measured: Measured;
  goal: number;
  day: SprintDay;
  days: SprintDay[];
  streak: number;
  onBack: () => void;
}) {
  const backfill = day.closed_on_time === false;
  const actual = Number(day.actual ?? 0);
  const target = Number(day.target);
  const atOrAbove = actual >= target;
  const cumulative = days.reduce((acc, d) => acc + Number(d.actual ?? 0), 0);
  const next = days.find((d) => d.day_index === day.day_index + 1);
  const summary = useRef<HTMLDivElement>(null);

  return (
    <Modal labelledBy="result-title" onDismiss={onBack} initialFocus={summary} maxWidth={620} style={{ animation: "popIn 220ms ease-out" }}>
      <div className="dialog-body result-body">
        {/* Focus lands on the whole summary, so the actual and its verdict are read together. */}
        <div id="result-title" ref={summary} tabIndex={-1} className="focus-quiet">
          <span className="label-muted">{backfill ? `Day ${day.day_index} backfilled` : `Day ${day.day_index} closed`}</span>
          <div className="heading result-actual" data-testid="result-actual" data-state={atOrAbove ? "at-or-above" : "under"}>
            {formatNumber(measured, actual)}
          </div>
          <div className="result-unit">
            {unitLabel(measured)} · target {formatNumber(measured, target)}
            {atOrAbove ? "" : " · under target"}
          </div>
        </div>

        <div className="result-strip" role="img" aria-label={`${days.filter((d) => d.closed_at !== null).length} of 14 days closed`}>
          {days.map((d) => {
            const c = d.closed_at !== null;
            const h = c && Number(d.actual) >= Number(d.target);
            return <span key={d.id} className="result-seg" data-state={c ? (h ? "at-or-above" : "under") : "open"} />;
          })}
        </div>

        <div className="result-row result-row-first">
          <span className="result-key">Streak</span>
          <strong className="result-val" data-testid="result-streak">
            {streak} {streak === 1 ? "day" : "days"}
            {backfill ? " · unchanged by a backfill" : ""}
          </strong>
        </div>
        <div className="result-row">
          <span className="result-key">Cumulative</span>
          <strong className="result-val">
            {formatAmount(measured, cumulative)} · {attainmentPct(cumulative, goal)}% of goal
          </strong>
        </div>
        {next ? (
          <div className="result-row">
            <span className="result-key">{backfill ? `Day ${next.day_index} target` : "Tomorrow's target"}</span>
            <strong className="result-val">{formatAmount(measured, Number(next.target))}</strong>
          </div>
        ) : (
          <div className="result-row result-key">That was the last day of the sprint.</div>
        )}
      </div>
      <div className="dialog-foot result-foot">
        <button type="button" className="btn btn-primary" onClick={onBack}>
          Back to today
        </button>
      </div>
    </Modal>
  );
}
