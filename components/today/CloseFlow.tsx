"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { closeDayAction, type Answer, type ImpactAnswer, type ResponseAnswer } from "@/app/(app)/actions/day";
import { Modal } from "@/components/Modal";
import { callAction } from "@/lib/callAction";
import type { OfferedItems, SprintDay } from "@/lib/data";
import { formatAmount, formatNumber, toBaseUnits, unitLabel, type Measured } from "@/lib/format";

export type CloseOutcome = { days: SprintDay[]; streak: number };

/**
 * The whole Day Close: the two-step dialog, then the result screen, for today's day or
 * a missed one being backfilled (F5). Hosted by CloseCard and PlanCard, which only
 * decide when it opens and what to do with the fresh rows when it is dismissed.
 */
export function CloseFlow({
  sprintId,
  measured,
  goal,
  day,
  offered,
  highestId,
  backfill,
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
  /** The day's date has passed in the sprint's zone: the pre-close copy says so. */
  backfill: boolean;
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
  return (
    <CloseDialog sprintId={sprintId} measured={measured} day={day} offered={offered} highestId={highestId} backfill={backfill} onCancel={onCancel} onClosed={setOutcome} />
  );
}

/**
 * One multi-pick group (F7): tapping an item marks it yes and the rest no; None marks
 * every item no; Unsure marks every item unsure; a group never touched sends nothing,
 * and the DB stores every offered item as unanswered.
 */
type Group = { mode: "untouched" | "picked" | "none" | "unsure"; picked: string[] };
const UNTOUCHED: Group = { mode: "untouched", picked: [] };

function answersOf(group: Group, ids: string[]): { id: string; answer: Answer }[] {
  switch (group.mode) {
    case "untouched":
      return [];
    case "none":
      return ids.map((id) => ({ id, answer: "no" }));
    case "unsure":
      return ids.map((id) => ({ id, answer: "unsure" }));
    case "picked":
      return ids.map((id) => ({ id, answer: group.picked.includes(id) ? "yes" : "no" }));
  }
}

function pick(group: Group, id: string): Group {
  if (group.mode !== "picked") return { mode: "picked", picked: [id] };
  const picked = group.picked.includes(id) ? group.picked.filter((x) => x !== id) : [...group.picked, id];
  return picked.length === 0 ? UNTOUCHED : { mode: "picked", picked };
}

function CloseDialog(props: {
  sprintId: string;
  measured: Measured;
  day: SprintDay;
  offered: OfferedItems;
  highestId: string | null;
  backfill: boolean;
  onCancel: () => void;
  onClosed: (outcome: CloseOutcome) => void;
}) {
  const { measured, day, offered, backfill } = props;
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [whole, setWhole] = useState("");
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [cues, setCues] = useState<Group>(UNTOUCHED);
  const [imps, setImps] = useState<Group>(UNTOUCHED);
  const [response, setResponse] = useState<ResponseAnswer | null>(null);
  const [recovered, setRecovered] = useState<Answer | null>(null);
  const [impact, setImpact] = useState<ImpactAnswer | null>(null);
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

  // The highest impediment, as this day offers it; its occurrence opens the response questions.
  const highest = offered.impediments.find((i) => i.id === props.highestId) ?? null;
  const highestOccurred = highest !== null && imps.mode === "picked" && imps.picked.includes(highest.id);
  const step2Hint = !highestOccurred ? null : !response ? "Did the response run?" : !recovered ? "Did you recover?" : null;
  const hint = step === 1 ? step1Hint : step2Hint;
  const closeBlocked = Boolean(step2Hint) || pending || error?.closed === true;

  function setImpediments(next: Group) {
    setImps(next);
    // The three questions apply only while the highest is picked; drop stale answers otherwise.
    if (!(highest && next.mode === "picked" && next.picked.includes(highest.id))) {
      setResponse(null);
      setRecovered(null);
      setImpact(null);
    }
  }

  function submit() {
    if (closeBlocked || step1Hint || value === null) return;
    start(async () => {
      const res = await callAction(() =>
        closeDayAction(day.id, props.sprintId, {
          actual: value,
          notes,
          impediments: answersOf(imps, offered.impediments.map((i) => i.id)),
          cues: answersOf(cues, offered.cues.map((c) => c.id)),
          response: highestOccurred ? response : null,
          recovered: highestOccurred ? recovered : null,
          impact: highestOccurred ? impact : null,
          highestId: highest?.id ?? null,
        }),
      );
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
          {backfill ? "Backfill" : "Close"} day {day.day_index} · step {step} of 2
        </span>
        <button type="button" className="link-quiet" aria-label="Cancel" onClick={props.onCancel} style={{ fontSize: 18, lineHeight: 1 }}>
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
              <h2 id="close-title" ref={heading} tabIndex={-1} className="heading" style={{ fontSize: 26, margin: 0, outline: "none" }}>
                What was the actual result?
              </h2>
              <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 6 }} data-testid="close-note">
                {backfill ? `Day ${day.day_index}'s target was ` : "Today's target was "}
                <strong style={{ fontWeight: 600, color: "var(--ink)" }}>{formatAmount(measured, Number(day.target))}</strong>.{" "}
                {backfill ? "A backfill counts toward the goal and insights, but never repairs the streak." : "Zero is a truthful answer."}
              </div>
              <div style={{ marginTop: 18 }}>
                {measured.measurement === "hours" ? (
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                    <label style={{ flex: 1 }}>
                      <span className="label-muted">Hours</span>
                      <input ref={first} className="input input-hero" type="number" inputMode="numeric" min={0} step={1} value={hours} onChange={(e) => setHours(e.target.value)} />
                    </label>
                    <label style={{ flex: 1 }}>
                      <span className="label-muted">Minutes</span>
                      <input className="input input-hero" type="number" inputMode="numeric" min={0} max={59} step={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
                    </label>
                  </div>
                ) : (
                  <label style={{ display: "block" }}>
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
              <h2 id="close-title" ref={heading} tabIndex={-1} className="heading" style={{ fontSize: 26, margin: 0, outline: "none" }}>
                What happened on Day {day.day_index}?
              </h2>
              <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 6 }}>None and Unsure are truthful answers.</div>

              <PickGroup
                testId="use-group"
                kicker="Use"
                question="Which cues did you use?"
                items={offered.cues.map((c) => ({ id: c.id, label: c.name, tag: c.is_focus ? "FOCUS" : null }))}
                emptyLine="No cues were in the sprint on this day."
                group={cues}
                onChange={setCues}
              />

              <PickGroup
                testId="occurrence-group"
                kicker="Occurrence"
                question="Which obstacles showed up?"
                sub={highest ? `Highest: ${highest.name}` : null}
                items={offered.impediments.map((i) => ({ id: i.id, label: i.name, tag: null }))}
                emptyLine="No impediments were in the sprint on this day."
                group={imps}
                onChange={setImpediments}
              />

              {highestOccurred && highest ? (
                <>
                  <AnswerGroup
                    testId="response-group"
                    kicker={`Response · ${highest.name}`}
                    question="Did you run the response?"
                    sub={`${highest.proof_then ? `THEN ${highest.proof_then} · ` : ""}judge the first time it showed up today`}
                    options={[
                      ["yes", "Yes"],
                      ["no", "No"],
                      ["partially", "Partially"],
                      ["unsure", "Unsure"],
                    ]}
                    value={response}
                    onChange={setResponse}
                  />
                  <AnswerGroup
                    testId="recovery-group"
                    kicker="Recovery"
                    question="Did you recover?"
                    sub={highest.proof_recover ? `Recovered when ${highest.proof_recover}` : "No recovery criterion recorded for this day"}
                    options={[
                      ["yes", "Yes"],
                      ["no", "No"],
                      ["unsure", "Unsure"],
                    ]}
                    value={recovered}
                    onChange={setRecovered}
                  />
                  <AnswerGroup
                    testId="impact-group"
                    kicker={`Impact · ${highest.name}`}
                    question="How much did it cost today?"
                    sub="Your read, not the number"
                    options={[
                      ["nothing", "Nothing"],
                      ["some", "Some"],
                      ["a_lot", "A lot"],
                      ["unsure", "Unsure"],
                    ]}
                    value={impact}
                    onChange={setImpact}
                  />
                </>
              ) : null}

              <label style={{ display: "block", marginTop: 18 }}>
                <span className="label-muted">Notes · optional</span>
                <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything worth remembering about today" style={{ marginTop: 6 }} />
              </label>
            </>
          )}

          {error ? (
            <div role="alert" className="error-bar" style={{ marginTop: 14 }}>
              <span>{error.text}</span>
              {error.closed ? (
                <button type="button" className="link-quiet" style={{ color: "inherit", fontWeight: 600 }} onClick={() => router.refresh()}>
                  Reload
                </button>
              ) : (
                <button type="submit" className="link-quiet" style={{ color: "inherit", fontWeight: 600 }}>
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
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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

function GroupHead({ kicker, question, sub, id }: { kicker: string; question: string; sub?: string | null; id: string }) {
  return (
    <>
      <div className="label-accent" style={{ textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {kicker}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginTop: 2 }}>
        <span id={id} style={{ fontSize: 13, fontWeight: 600 }}>
          {question}
        </span>
        {sub ? <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{sub}</span> : null}
      </div>
    </>
  );
}

/** A multi-pick question: item pills plus None and Unsure. */
function PickGroup({
  testId,
  kicker,
  question,
  sub,
  items,
  emptyLine,
  group,
  onChange,
}: {
  testId: string;
  kicker: string;
  question: string;
  sub?: string | null;
  items: { id: string; label: string; tag: string | null }[];
  emptyLine: string;
  group: Group;
  onChange: (next: Group) => void;
}) {
  const labelId = `${testId}-label`;
  return (
    <div style={{ marginTop: 16 }} data-testid={testId} data-mode={group.mode}>
      <GroupHead kicker={kicker} question={question} sub={sub} id={labelId} />
      {items.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>{emptyLine}</div>
      ) : (
        <div className="pill-row" role="group" aria-labelledby={labelId}>
          {items.map((item) => {
            const on = group.mode === "picked" && group.picked.includes(item.id);
            return (
              <button key={item.id} type="button" className={`chip ${on ? "chip-on" : ""}`} aria-pressed={on} onClick={() => onChange(pick(group, item.id))}>
                {item.label}
                {item.tag ? (
                  <span className="option-tag" data-testid="focus-tag" style={on ? { color: "#fff", borderColor: "rgba(255,255,255,0.6)" } : undefined}>
                    {item.tag}
                  </span>
                ) : null}
              </button>
            );
          })}
          <button type="button" className={`chip ${group.mode === "none" ? "chip-on" : ""}`} aria-pressed={group.mode === "none"} onClick={() => onChange({ mode: "none", picked: [] })} data-testid={`${testId.replace("-group", "")}-none`}>
            None
          </button>
          <button type="button" className={`chip ${group.mode === "unsure" ? "chip-on" : ""}`} aria-pressed={group.mode === "unsure"} onClick={() => onChange({ mode: "unsure", picked: [] })}>
            Unsure
          </button>
        </div>
      )}
    </div>
  );
}

/** A single-answer question on a fixed scale. */
function AnswerGroup<T extends string>({
  testId,
  kicker,
  question,
  sub,
  options,
  value,
  onChange,
}: {
  testId: string;
  kicker: string;
  question: string;
  sub?: string | null;
  options: [T, string][];
  value: T | null;
  onChange: (next: T) => void;
}) {
  const labelId = `${testId}-label`;
  return (
    <div style={{ marginTop: 16 }} data-testid={testId}>
      <GroupHead kicker={kicker} question={question} sub={sub} id={labelId} />
      <div className="pill-row" role="radiogroup" aria-labelledby={labelId}>
        {options.map(([key, label]) => (
          <button key={key} type="button" role="radio" className={`chip ${value === key ? "chip-on" : ""}`} aria-checked={value === key} onClick={() => onChange(key)}>
            {label}
          </button>
        ))}
      </div>
    </div>
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
      <div className="dialog-body" style={{ paddingTop: 26 }}>
        {/* Focus lands on the whole summary, so the actual and its verdict are read together. */}
        <div id="result-title" ref={summary} tabIndex={-1} style={{ outline: "none" }}>
          <span className="label-muted">{backfill ? `Day ${day.day_index} backfilled` : `Day ${day.day_index} closed`}</span>
          <div
            className="heading"
            data-testid="result-actual"
            data-state={atOrAbove ? "at-or-above" : "under"}
            style={{ fontSize: 78, letterSpacing: "-0.04em", lineHeight: 1, marginTop: 8, color: atOrAbove ? "var(--success)" : "var(--under)" }}
          >
            {formatNumber(measured, actual)}
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--muted)", marginTop: 4 }}>
            {unitLabel(measured)} · target {formatNumber(measured, target)}
            {atOrAbove ? "" : " · under target"}
          </div>
        </div>

        <div style={{ display: "flex", gap: 4, marginTop: 22 }} role="img" aria-label={`${days.filter((d) => d.closed_at !== null).length} of 14 days closed`}>
          {days.map((d) => {
            const c = d.closed_at !== null;
            const h = c && Number(d.actual) >= Number(d.target);
            return <span key={d.id} style={{ flex: 1, height: 6, borderRadius: 3, background: c ? (h ? "var(--success)" : "var(--under)") : "var(--faint)" }} />;
          })}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--divider)", fontSize: 13.5 }}>
          <span style={{ color: "var(--muted)" }}>Streak</span>
          <strong style={{ fontWeight: 600 }} data-testid="result-streak">
            {streak} {streak === 1 ? "day" : "days"}
            {backfill ? " · unchanged by a backfill" : ""}
          </strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 9, fontSize: 13.5 }}>
          <span style={{ color: "var(--muted)" }}>Cumulative</span>
          <strong style={{ fontWeight: 600 }}>
            {formatAmount(measured, cumulative)} · {Math.round((cumulative / goal) * 100)}% of goal
          </strong>
        </div>
        {next ? (
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 9, fontSize: 13.5 }}>
            <span style={{ color: "var(--muted)" }}>{backfill ? `Day ${next.day_index} target` : "Tomorrow's target"}</span>
            <strong style={{ fontWeight: 600 }}>{formatAmount(measured, Number(next.target))}</strong>
          </div>
        ) : (
          <div style={{ marginTop: 9, fontSize: 13.5, color: "var(--muted)" }}>That was the last day of the sprint.</div>
        )}
      </div>
      <div className="dialog-foot" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-primary" onClick={onBack}>
          Back to today
        </button>
      </div>
    </Modal>
  );
}
