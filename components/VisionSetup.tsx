"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { saveVisionGoal, saveVisionPicture, setVisionObstacle } from "@/app/(app)/actions/vision";
import { Dictate } from "@/components/Dictate";
import { ErrorBar } from "@/components/ErrorBar";
import { OptionRow } from "@/components/OptionRow";
import { callAction } from "@/lib/callAction";
import type { ActiveVision, LibraryItem } from "@/lib/data";

export type SetupStep = 1 | 2 | 3;

const STEP_NAMES = ["Picture", "Goal", "Obstacle"];
const TITLES: Record<SetupStep, string> = { 1: "Visualize one year from today", 2: "Define your one-year goal", 3: "Plan for your main obstacle" };
const CONFIDENCE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
/** The reason box shows at this confidence or below, and is required there. */
const LOW_CONFIDENCE = 6;

/**
 * F16: the three annual steps — Picture · Goal · Obstacle. Each step saves on continue
 * through its own function and moves to the next URL; a failed save shows the error bar
 * with Retry and keeps every input. Every text box has a Dictate button. Steps 2 and 3
 * can be cancelled back to the overview; a first step 1 cannot.
 */
export function VisionSetup({ step, active, impediments }: { step: SetupStep; active: ActiveVision | null; impediments: LibraryItem[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const heading = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(false);
  useEffect(() => {
    // A step change is a new screen. So is arriving here after "Replace" swapped the
    // overview out from under the pressed button: focus is then on <body>, and the
    // heading takes it so the change is announced (full review 2026-09-09, #8).
    if (mounted.current || document.activeElement === document.body) heading.current?.focus();
    mounted.current = true;
  }, [step]);

  const v = active?.vision ?? null;

  // Step 1
  const [picture, setPicture] = useState(v?.picture ?? "");

  // Step 2
  const [body, setBody] = useState(v?.body ?? "");
  const [proof, setProof] = useState(v?.proof ?? "");
  const [confidence, setConfidence] = useState<number | null>(v?.confidence ?? null);
  const [reason, setReason] = useState(v?.confidence_reason ?? "");
  const lowConfidence = confidence !== null && confidence <= LOW_CONFIDENCE;

  // Step 3 (F15: WHEN is the obstacle's name; THEN and RECOVERED WHEN are its proof parts)
  const obstacle = active?.obstacle ?? null;
  const [pickedId, setPickedId] = useState<string | null>(obstacle?.id ?? null);
  const [when, setWhen] = useState(obstacle?.name ?? "");
  const [then, setThen] = useState(obstacle?.proof_then ?? "");
  const [recover, setRecover] = useState(obstacle?.proof_recover ?? "");

  const hint: string | null =
    step === 1
      ? !picture.trim()
        ? "Picture the day before moving on."
        : null
      : step === 2
        ? !body.trim()
          ? "Write the goal."
          : !proof.trim()
            ? "Name the observable proof."
            : confidence === null
              ? "Pick a confidence from 0 to 10."
              : lowConfidence && !reason.trim()
                ? "Say the main reason your confidence is low."
                : null
        : !when.trim() || !then.trim() || !recover.trim()
          ? "WHEN, THEN and the recovery criterion are all required."
          : null;
  const blocked = hint !== null || pending;

  function submit() {
    if (blocked) return;
    setError(null);
    start(async () => {
      const res =
        step === 1
          ? await callAction(() => saveVisionPicture(picture))
          : step === 2
            ? await callAction(() => saveVisionGoal({ body, proof, confidence, reason }))
            : await callAction(() => setVisionObstacle({ impedimentId: pickedId, when, then, recover }));
      if (res.error) {
        setError(res.error);
        return;
      }
      router.push(step === 3 ? "/vision" : `/vision?step=${step + 1}`);
    });
  }

  function pick(i: LibraryItem) {
    setPickedId(i.id);
    setWhen(i.name);
    setThen(i.proof_then ?? "");
    setRecover(i.proof_recover ?? "");
  }

  function nameNew() {
    setPickedId(null);
    setWhen("");
    setThen("");
    setRecover("");
  }

  const back = step === 1 ? (v ? { label: "Cancel", href: "/vision" } : null) : { label: "Back", href: `/vision?step=${step - 1}` };
  const pickedName = pickedId ? (impediments.find((i) => i.id === pickedId)?.name ?? obstacle?.name ?? null) : null;

  return (
    <div data-testid="vision-setup" data-step={step}>
      <div className="v-head">
        <div className="label-accent">Annual setup · Step {step} of 3</div>
        <span className="v-head-meta">Revisit once a year. Sprints are planned separately.</span>
      </div>
      <h1 ref={heading} tabIndex={-1} className="heading v-title">
        {TITLES[step]}
      </h1>
      <div className="v-progress" aria-label={`Step ${step} of 3`}>
        {[1, 2, 3].map((i) => (
          <span key={i} className={`v-seg ${i <= step ? "v-seg-on" : ""}`} />
        ))}
      </div>
      <div className="v-steps">
        {STEP_NAMES.map((s, i) => (
          <span key={s} className={i + 1 === step ? "v-step-on" : ""}>
            {s}
          </span>
        ))}
      </div>

      <form
        className="card v-card"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {step === 1 ? (
          <>
            <div className="v-prompt">Close your eyes. Picture a realistic day one year from today.</div>
            <ul className="v-prompts">
              <li>
                <strong>Morning:</strong> What did you do this morning that took effort, and what made it easier?
              </li>
              <li>
                <strong>Midday:</strong> What hard moment happened today, and how did you handle it differently?
              </li>
              <li>
                <strong>Evening:</strong> What did you follow through on today that the old you would have avoided?
              </li>
            </ul>
            <div className="v-prompt v-field-label">Picture specific actions.</div>
            <textarea id="vision-picture" className="input v-textarea" rows={6} value={picture} onChange={(e) => setPicture(e.target.value)} placeholder="Morning… Midday… Evening…" aria-label="Picture" />
            <Dictate label="the picture" value={picture} onChange={setPicture} disabled={pending} />
          </>
        ) : null}

        {step === 2 ? (
          <>
            <label className="v-field-label" htmlFor="vision-goal">
              In 12 months, I ___.
            </label>
            <textarea id="vision-goal" className="input v-textarea" rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="…" aria-label="Goal" />
            <Dictate label="the goal" value={body} onChange={setBody} disabled={pending} />
            <label className="v-field-label" htmlFor="vision-proof">
              The observable proof will be ___.
            </label>
            <input id="vision-proof" className="input v-input" value={proof} onChange={(e) => setProof(e.target.value)} placeholder="Something you could point to: a number, a habit held for a quarter, a signed contract" aria-label="Proof" />
            <Dictate label="the proof" value={proof} onChange={setProof} disabled={pending} />
            <div className="v-field-label" id="vision-confidence-label">
              Given your time, resources, and current approach, how likely are you to achieve this? 0–10
            </div>
            <div className="v-chips" role="group" aria-labelledby="vision-confidence-label">
              {CONFIDENCE.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`chip v-chip-n ${confidence === n ? "chip-on" : ""}`}
                  aria-label={`Confidence ${n}`}
                  aria-pressed={confidence === n}
                  onClick={() => setConfidence(n)}
                >
                  {n}
                </button>
              ))}
            </div>
            {lowConfidence ? (
              <>
                <label className="v-field-label" htmlFor="vision-reason">
                  If confidence is low, what is the main reason? Adjust your approach, support, or goal scope to address it.
                </label>
                <textarea id="vision-reason" className="input v-textarea" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="The main reason" aria-label="Main reason" />
                <Dictate label="the reason" value={reason} onChange={setReason} disabled={pending} />
              </>
            ) : null}
          </>
        ) : null}

        {step === 3 ? (
          <>
            <div className="v-prompt">What most often pulls you off that course?</div>
            <div className="v-note">Choose an existing global impediment or name one. In either case, identify the specific moment you will recognize it.</div>
            <div className="v-options" role="radiogroup" aria-label="Global impediments">
              {impediments.map((i) => (
                <OptionRow key={i.id} single on={pickedId === i.id} label={i.name} tag={i.proof_then && i.proof_recover ? "has THEN → RECOVERED" : null} onPick={() => pick(i)} />
              ))}
              {impediments.length === 0 ? <div className="v-empty-line">No global impediments yet. Name the first one below.</div> : null}
            </div>
            <div className="v-field-label v-obstacle-head">
              {pickedName ? (
                <>
                  Editing <strong>{pickedName}</strong>
                  <button type="button" className="btn btn-ghost btn-link v-name-new" onClick={nameNew}>
                    Name a new one
                  </button>
                </>
              ) : impediments.length ? (
                "Or name a new one"
              ) : (
                "Name the obstacle"
              )}
            </div>
            <label className="label-accent v-field-label" htmlFor="obstacle-when">
              WHEN
            </label>
            <div className="v-note v-note-tight">What cue will I notice?</div>
            <input id="obstacle-when" className="input v-input v-strong" value={when} onChange={(e) => setWhen(e.target.value)} placeholder="I catch myself researching more instead of starting the draft" />
            <Dictate label="WHEN" value={when} onChange={setWhen} disabled={pending} />
            <label className="label-accent v-field-label" htmlFor="obstacle-then">
              THEN
            </label>
            <div className="v-note v-note-tight">What specific action will I take?</div>
            <input id="obstacle-then" className="input v-input" value={then} onChange={(e) => setThen(e.target.value)} placeholder="I close the research tabs and write the first rough paragraph" />
            <Dictate label="THEN" value={then} onChange={setThen} disabled={pending} />
            <label className="label-accent v-field-label" htmlFor="obstacle-recover">
              RECOVERED WHEN
            </label>
            <div className="v-note v-note-tight">What observable sign shows I am back on course?</div>
            <input id="obstacle-recover" className="input v-input" value={recover} onChange={(e) => setRecover(e.target.value)} placeholder="The paragraph is saved" />
            <Dictate label="RECOVERED WHEN" value={recover} onChange={setRecover} disabled={pending} />
            <div className="v-example">
              <strong>Example</strong>
              <br />
              WHEN: I catch myself researching more instead of starting the draft.
              <br />
              THEN: I close the research tabs and write the first rough paragraph.
              <br />
              RECOVERED WHEN: The paragraph is saved.
            </div>
            <div className="label-accent v-field-label">Rehearse once</div>
            <div className="v-note v-note-tight">Picture the next time this happens. Notice your WHEN cue, then mentally perform your THEN response.</div>
            <div className="v-note">Saved as a global impediment so every sprint can watch it; the situations it applies to are ticked on the Impediments page before a sprint can watch it.</div>
          </>
        ) : null}

        {error ? (
          <ErrorBar className="mt-14" action={{ label: "Retry", submit: true }}>
            {error}
          </ErrorBar>
        ) : null}

        <div className="v-foot">
          {back ? (
            <Link href={back.href} className="btn btn-ghost btn-link">
              {back.label}
            </Link>
          ) : (
            <span />
          )}
          <div className="v-foot-actions">
            <span className="hint" id="vision-hint" aria-live="polite">
              {hint ?? ""}
            </span>
            <button type="submit" className="btn btn-primary" aria-disabled={blocked} aria-describedby={hint ? "vision-hint" : undefined}>
              {pending ? "Saving…" : step === 3 ? "Save" : "Save & continue"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
