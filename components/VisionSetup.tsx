"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { saveVision, setVisionObstacle, setVisionRule } from "@/app/(app)/actions/vision";
import { ErrorBar } from "@/components/ErrorBar";
import { OptionRow } from "@/components/OptionRow";
import { ProofInputs } from "@/components/ProofInputs";
import { callAction } from "@/lib/callAction";
import type { ActiveVision, LibraryItem } from "@/lib/data";
import { addDays, localDateIn } from "@/lib/sprintDay";

export type SetupStep = 1 | 2 | 3;

const STEP_NAMES = ["Vision", "Obstacle", "Rule"];
const TITLES: Record<SetupStep, string> = { 1: "Define your vision", 2: "Identify the main obstacle", 3: "Choose a WHEN → THEN guiding rule" };

/**
 * F9: the three annual steps. Each step saves on continue through its own function and
 * moves to the next URL; a failed save shows the error bar with Retry and keeps every
 * input. Steps 2 and 3 can be cancelled back to the overview; a first step 1 cannot.
 */
export function VisionSetup({ step, active, impediments }: { step: SetupStep; active: ActiveVision | null; impediments: LibraryItem[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const heading = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) heading.current?.focus();
    mounted.current = true;
  }, [step]);

  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  // save_vision compares with the database's date (UTC): offer nothing earlier than the
  // later of local tomorrow and UTC tomorrow, so the first date shown is never refused.
  const minDeadline = useMemo(() => {
    const now = new Date();
    const local = addDays(localDateIn(tz, now), 1);
    const utc = addDays(localDateIn("UTC", now), 1);
    return local > utc ? local : utc;
  }, [tz]);

  // Step 1
  const v = active?.vision ?? null;
  const [body, setBody] = useState(v?.body ?? "");
  const [deadline, setDeadline] = useState(v?.deadline ?? "");
  const [proof, setProof] = useState(v?.proof ?? "");
  const [meaning, setMeaning] = useState(v?.meaning ?? "");
  const [baseline, setBaseline] = useState(v?.baseline ?? "");
  const deadlineOk = /^\d{4}-\d{2}-\d{2}$/.test(deadline) && deadline >= minDeadline;

  // Step 2
  const obstacle = active?.obstacle ?? null;
  const [pickedId, setPickedId] = useState<string | null>(obstacle?.id ?? null);
  const [newName, setNewName] = useState("");
  const [newExplanation, setNewExplanation] = useState("");

  // Step 3
  const [when, setWhen] = useState(obstacle?.proof_when ?? "");
  const [then, setThen] = useState(obstacle?.proof_then ?? "");
  const [recover, setRecover] = useState(obstacle?.proof_recover ?? "");

  const hint: string | null =
    step === 1
      ? !body.trim()
        ? "The vision unlocks every sprint."
        : !deadlineOk
          ? "The deadline must be in the future."
          : !proof.trim()
            ? "Name what would prove it happened."
            : null
      : step === 2
        ? !pickedId && !newName.trim()
          ? "Pick or name one obstacle."
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
          ? await callAction(() => saveVision({ body, deadline, proof, meaning, baseline }))
          : step === 2
            ? await callAction(() => setVisionObstacle({ impedimentId: pickedId, name: pickedId ? "" : newName, explanation: pickedId ? "" : newExplanation }))
            : await callAction(() => setVisionRule({ when, then, recover }));
      if (res.error) {
        setError(res.error);
        return;
      }
      router.push(step === 3 ? "/vision" : `/vision?step=${step + 1}`);
    });
  }

  const back = step === 1 ? (v ? { label: "Cancel", href: "/vision" } : null) : { label: "Back", href: `/vision?step=${step - 1}` };
  const obstacleName = pickedId ? (impediments.find((i) => i.id === pickedId)?.name ?? obstacle?.name) : obstacle?.name;

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
            <div className="v-prompt">Where does your life stand one to two years from now? One or two sentences.</div>
            <textarea className="input v-textarea" rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Where you stand one to two years from now." aria-label="Vision" />
            <label className="v-field-label" htmlFor="vision-deadline">
              By when?
            </label>
            <input
              id="vision-deadline"
              className="input v-input v-date"
              type="date"
              min={minDeadline}
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              aria-label="Deadline"
              aria-invalid={deadline && !deadlineOk ? "true" : undefined}
            />
            <label className="v-field-label" htmlFor="vision-proof">
              What would prove it happened?
            </label>
            <input
              id="vision-proof"
              className="input v-input"
              value={proof}
              onChange={(e) => setProof(e.target.value)}
              placeholder="Something you could point to: a number, a habit held for a quarter, a signed contract"
              aria-label="Proof"
            />
            <label className="v-field-label v-field-label-opt" htmlFor="vision-meaning">
              What it means to you <em>· optional</em>
            </label>
            <input id="vision-meaning" className="input v-input" value={meaning} onChange={(e) => setMeaning(e.target.value)} placeholder="Why this, and not something else" />
            <label className="v-field-label v-field-label-opt" htmlFor="vision-baseline">
              Where you stand today <em>· optional</em>
            </label>
            <input id="vision-baseline" className="input v-input" value={baseline} onChange={(e) => setBaseline(e.target.value)} placeholder="The honest baseline, in one line" />
          </>
        ) : null}

        {step === 2 ? (
          <>
            <div className="v-prompt">What most often pulls you off that course? Pick a global impediment or name a new one.</div>
            <div className="v-options" role="radiogroup" aria-label="Global impediments">
              {impediments.map((i) => (
                <OptionRow
                  key={i.id}
                  single
                  on={pickedId === i.id}
                  label={i.name}
                  tag={i.proof_when && i.proof_then ? "has WHEN → THEN" : null}
                  onPick={() => {
                    setPickedId(i.id);
                    setNewName("");
                    setNewExplanation("");
                  }}
                />
              ))}
              {impediments.length === 0 ? <div className="v-empty-line">No global impediments yet. Name the first one below.</div> : null}
            </div>
            <div className="v-field-label">{impediments.length ? "Or create a new impediment" : "Create the impediment"}</div>
            <div className="proof-grid v-grid">
              <label htmlFor="obstacle-name" className="label-accent proof-label">
                SITUATION
              </label>
              <input
                id="obstacle-name"
                className="input input-compact v-strong"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  if (e.target.value) setPickedId(null);
                }}
                placeholder="e.g. Saying yes to one-off projects"
                aria-label="Situation"
              />
              <label htmlFor="obstacle-explanation" className="label-accent proof-label">
                INTERFERES
              </label>
              <input
                id="obstacle-explanation"
                className="input input-compact"
                value={newExplanation}
                onChange={(e) => {
                  setNewExplanation(e.target.value);
                  if (e.target.value) setPickedId(null);
                }}
                placeholder="What it does to your day, e.g. retainer outreach slips a week, every week"
                aria-label="Interferes"
              />
            </div>
            <div className="v-note">Same card as any impediment in the library, saved with global scope so every sprint can watch it. The WHEN → THEN comes next.</div>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <div className="v-prompt">The one move you make the moment {obstacleName} shows up.</div>
            <ProofInputs
              idPrefix="rule"
              when={when}
              then={then}
              recover={recover}
              onWhen={setWhen}
              onThen={setThen}
              onRecover={setRecover}
              placeholderWhen="a one-off request lands in my inbox"
              placeholderThen="I reply with the retainer offer or a no, within the hour"
              placeholderRecover="Observable sign you're back on track, e.g. I'm on the task within 15 minutes"
              className="v-grid"
            />
            <div className="v-note">Saved on {obstacleName} as its WHEN → THEN. Any sprint that watches it uses this same response.</div>
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
