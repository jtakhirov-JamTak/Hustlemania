"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { closeDayAction } from "@/app/(app)/actions";
import { OptionRow } from "@/components/OptionRow";
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
  backfill,
  onCancel,
  onDone,
}: {
  sprintId: string;
  measured: Measured;
  goal: number;
  day: SprintDay;
  offered: OfferedItems;
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
  return <CloseDialog sprintId={sprintId} measured={measured} day={day} offered={offered} backfill={backfill} onCancel={onCancel} onClosed={setOutcome} />;
}

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

function CloseDialog(props: {
  sprintId: string;
  measured: Measured;
  day: SprintDay;
  offered: OfferedItems;
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
  const [hurt, setHurt] = useState<string[]>([]);
  const [hurtNone, setHurtNone] = useState(false);
  const [mostDamaging, setMostDamaging] = useState<string | null>(null);
  const [helped, setHelped] = useState<string[]>([]);
  const [helpedNone, setHelpedNone] = useState(false);
  const [mostUseful, setMostUseful] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  // `closed` means the day did close and only the refresh failed: no retry, reload instead.
  const [error, setError] = useState<{ text: string; closed: boolean } | null>(null);
  const [pending, start] = useTransition();
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), []);

  const value =
    measured.measurement === "hours"
      ? hours === "" && minutes === ""
        ? null
        : toBaseUnits("hours", { hours: Number(hours || 0), minutes: Number(minutes || 0) })
      : whole === ""
        ? null
        : toBaseUnits(measured.measurement, { whole: Number(whole) });
  const actualValid = value !== null && Number.isInteger(value) && value >= 0 && (measured.measurement !== "hours" || Number(minutes || 0) < 60);

  // Step 1 is complete when the actual is valid and the hurt question is answered:
  // either "None today", or at least one impediment plus the most damaging one.
  const hurtAnswered = hurtNone || hurt.length > 0;
  const damagingOk = hurt.length === 0 || (mostDamaging !== null && hurt.includes(mostDamaging));
  const step1Hint = !actualValid
    ? "Enter the actual, zero included."
    : !hurtAnswered
      ? "Say which impediments hurt, or none."
      : !damagingOk
        ? "Pick the one that hurt most."
        : null;
  const helpedAnswered = helpedNone || helped.length > 0;
  const usefulOk = helped.length === 0 || (mostUseful !== null && helped.includes(mostUseful));
  const step2Hint = !helpedAnswered ? "Say which cues helped, or none." : !usefulOk ? "Pick the one that helped most." : null;

  function submit() {
    if (step1Hint || step2Hint || value === null || pending) return;
    start(async () => {
      const res = await closeDayAction(day.id, props.sprintId, {
        actual: value,
        notes,
        hurt,
        mostDamaging: hurt.length > 0 ? mostDamaging : null,
        helped,
        mostUseful: helped.length > 0 ? mostUseful : null,
      });
      if (res.error !== undefined) {
        setError({ text: res.error, closed: res.closed === true });
        return;
      }
      props.onClosed(res);
    });
  }

  const hurtItems = offered.impediments;
  const helpedItems = offered.cues;
  const hurtPicked = hurtItems.filter((i) => hurt.includes(i.id));
  const helpedPicked = helpedItems.filter((c) => helped.includes(c.id));

  return (
    <div className="dialog-scrim" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && props.onCancel()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="close-title" style={{ maxWidth: 620 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="label-muted" data-testid="close-step">
            {backfill ? "Backfill" : "Close"} day {day.day_index} · step {step} of 2
          </span>
          <button type="button" className="link-quiet" aria-label="Cancel" onClick={props.onCancel} style={{ fontSize: 18, lineHeight: 1 }}>
            ×
          </button>
        </div>

        <form
          style={{ marginTop: 10 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (step === 1) {
              if (!step1Hint) setStep(2);
            } else submit();
          }}
        >
          {step === 1 ? (
            <>
              <h2 id="close-title" className="heading" style={{ fontSize: 26, margin: 0 }}>
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

              <div style={{ marginTop: 22 }} data-testid="hurt-section">
                <div style={{ fontSize: 15, fontWeight: 600 }}>Which impediments hurt today?</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>None is a truthful answer.</div>
                <div role="group" aria-label="Impediments that hurt" style={{ marginTop: 6 }}>
                  {hurtItems.map((i) => (
                    <OptionRow
                      key={i.id}
                      on={hurt.includes(i.id)}
                      label={i.name}
                      sub={i.proof_when && i.proof_then ? `WHEN ${i.proof_when}` : null}
                      onPick={() => {
                        const next = toggle(hurt, i.id);
                        setHurt(next);
                        setHurtNone(false);
                        if (mostDamaging && !next.includes(mostDamaging)) setMostDamaging(null);
                        if (next.length === 1) setMostDamaging(next[0]);
                      }}
                    />
                  ))}
                  <OptionRow
                    on={hurtNone}
                    label="None today"
                    onPick={() => {
                      setHurtNone(true);
                      setHurt([]);
                      setMostDamaging(null);
                    }}
                    testId="hurt-none"
                  />
                </div>
                {hurt.length > 1 ? (
                  <div style={{ marginTop: 14 }} role="radiogroup" aria-label="Which hurt most?">
                    <div style={{ fontSize: 13, fontWeight: 600 }}>Which hurt most?</div>
                    {hurtPicked.map((i) => (
                      <OptionRow key={i.id} single on={mostDamaging === i.id} label={i.name} onPick={() => setMostDamaging(i.id)} />
                    ))}
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <h2 id="close-title" className="heading" style={{ fontSize: 26, margin: 0 }}>
                Which execution cues helped?
              </h2>
              <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 6 }}>None is a truthful answer.</div>
              <div role="group" aria-label="Cues that helped" style={{ marginTop: 12 }} data-testid="helped-section">
                {helpedItems.map((c) => (
                  <OptionRow
                    key={c.id}
                    on={helped.includes(c.id)}
                    label={c.name}
                    sub={c.explanation}
                    onPick={() => {
                      const next = toggle(helped, c.id);
                      setHelped(next);
                      setHelpedNone(false);
                      if (mostUseful && !next.includes(mostUseful)) setMostUseful(null);
                      if (next.length === 1) setMostUseful(next[0]);
                    }}
                  />
                ))}
                <OptionRow
                  on={helpedNone}
                  label="None today"
                  onPick={() => {
                    setHelpedNone(true);
                    setHelped([]);
                    setMostUseful(null);
                  }}
                  testId="helped-none"
                />
              </div>
              {helped.length > 1 ? (
                <div style={{ marginTop: 14 }} role="radiogroup" aria-label="Which helped most?">
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Which helped most?</div>
                  {helpedPicked.map((c) => (
                    <OptionRow key={c.id} single on={mostUseful === c.id} label={c.name} onPick={() => setMostUseful(c.id)} />
                  ))}
                </div>
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

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 22, flexWrap: "wrap" }}>
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
              {step === 1 && step1Hint ? <span className="hint">{step1Hint}</span> : null}
              {step === 2 && step2Hint ? <span className="hint">{step2Hint}</span> : null}
              {step === 1 ? (
                <button type="submit" className="btn btn-primary" disabled={Boolean(step1Hint)}>
                  Continue
                </button>
              ) : (
                <button type="submit" className="btn btn-primary" disabled={Boolean(step2Hint) || pending || error?.closed === true}>
                  {pending ? "Closing…" : "Close the day"}
                </button>
              )}
            </div>
          </div>
        </form>
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

  return (
    <div className="dialog-scrim" role="presentation">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="result-title" style={{ maxWidth: 620, animation: "popIn 220ms ease-out" }}>
        <span className="label-muted">{backfill ? `Day ${day.day_index} backfilled` : `Day ${day.day_index} closed`}</span>
        <div
          id="result-title"
          className="heading"
          data-testid="result-actual"
          data-state={atOrAbove ? "at-or-above" : "under"}
          style={{ fontSize: 78, letterSpacing: "-0.04em", lineHeight: 1, marginTop: 8, color: atOrAbove ? "var(--success)" : "var(--under)" }}
        >
          {formatNumber(measured, actual)}
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--muted)", marginTop: 4 }}>
          {unitLabel(measured)} · target {formatNumber(measured, target)}
        </div>

        <div style={{ display: "flex", gap: 4, marginTop: 22 }} aria-label="14-day progress">
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

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
          <button type="button" className="btn btn-primary" onClick={onBack}>
            Back to today
          </button>
        </div>
      </div>
    </div>
  );
}
