"use client";

import { ProofInputs } from "@/components/ProofInputs";
import { ErrorBar } from "@/components/ErrorBar";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createItem } from "@/app/(app)/actions/library";
import { startSprintAction, type StartSprintInput } from "@/app/(app)/actions/sprint";
import { OptionRow } from "@/components/OptionRow";
import { effectivePlan, PlanGrid, type PlanCell } from "@/components/PlanGrid";
import type { AreaKey } from "@/lib/areas";
import { callAction } from "@/lib/callAction";
import { cueSummary, eligibleFor, proofComplete, proofSummary, type LibraryItem } from "@/lib/data";
import { formatIsoDate } from "@/lib/dates";
import { toBaseUnits, unitLabel, type Measurement, type Measured } from "@/lib/format";
import { addDays, localDateIn } from "@/lib/sprintDay";
import { formatTargetInput, hasRoundingDifference, measurementStep, parseTargetInput, planDelta, sameDailyTargets } from "@/lib/targets";

type AreaOption = { key: AreaKey; name: string; hasSprint: boolean };

type Draft = {
  area: AreaKey | null;
  outcome: string;
  measurement: Measurement;
  goalWhole: string;
  goalHours: string;
  goalMinutes: string;
  currency: string;
  unit: string;
  usage: { label: string; amount: string }[];
  startsTomorrow: boolean;
  confidence: number | null;
  why: string;
  celebration: string;
  mantra: string;
  /** Daily Intentions by day, index 0 = day 1 (PRD §6: setup may pre-fill any day). */
  intentions: string[];
  mode: "same" | "custom";
  /** Raw custom-target inputs by day; parsed with parseTargetInput. */
  custom: string[];
  impedimentIds: string[];
  highestId: string | null;
  proofWhen: string;
  proofThen: string;
  proofRecover: string;
  cueIds: string[];
  /** F7: one of cueIds; follows the picks so it is never stale. */
  focusId: string | null;
  aligned: boolean;
};

type Library = { cues: LibraryItem[]; impediments: LibraryItem[] };

const STEPS = ["Area & outcome", "Measure & goal", "Confidence & mantra", "Plan & start"];

/** F9: `vision` is the account's one vision (its text) or null; without it no Area can start. */
export function NewSprintWizard({ areas, initialArea, library: initialLibrary, vision }: { areas: AreaOption[]; initialArea: AreaKey | null; library: Library; vision: string | null }) {
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [library, setLibrary] = useState<Library>(initialLibrary);
  const [newImp, setNewImp] = useState("");
  const [newCue, setNewCue] = useState("");
  const [newCueWhen, setNewCueWhen] = useState("");
  const [creating, setCreating] = useState<"cue" | "impediment" | null>(null);
  const [pending, start] = useTransition();
  const [d, setD] = useState<Draft>({
    area: initialArea,
    outcome: "",
    measurement: "money",
    goalWhole: "",
    goalHours: "",
    goalMinutes: "",
    currency: "USD",
    unit: "",
    usage: [{ label: "", amount: "" }],
    startsTomorrow: false,
    confidence: null,
    why: "",
    celebration: "",
    mantra: "",
    intentions: Array(14).fill(""),
    mode: "same",
    custom: Array(14).fill(""),
    impedimentIds: [],
    highestId: null,
    proofWhen: "",
    proofThen: "",
    proofRecover: "",
    cueIds: [],
    focusId: null,
    aligned: false,
  });
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  // F7: the focus cue is one of the picked cues; it defaults to the first pick and moves when that pick goes.
  const setCues = (next: string[]) => setD((p) => ({ ...p, cueIds: next, focusId: p.focusId && next.includes(p.focusId) ? p.focusId : (next[0] ?? null) }));
  const heading = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) heading.current?.focus();
    mounted.current = true;
  }, [step]);

  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const today = useMemo(() => localDateIn(tz, new Date()), [tz]);
  const startDate = d.startsTomorrow ? addDays(today, 1) : today;

  const measured: Measured = { measurement: d.measurement, currency: d.currency.toUpperCase() || null, unit: d.unit || null };
  const amount =
    d.measurement === "hours"
      ? d.goalHours === "" && d.goalMinutes === ""
        ? null
        : toBaseUnits("hours", { hours: Number(d.goalHours || 0), minutes: Number(d.goalMinutes || 0) })
      : d.goalWhole === ""
        ? null
        : toBaseUnits(d.measurement, { whole: Number(d.goalWhole) });
  const amountValid = amount !== null && Number.isInteger(amount) && amount > 0 && (d.measurement !== "hours" || Number(d.goalMinutes || 0) < 60);
  const sameTargets = amountValid ? sameDailyTargets(amount!, measurementStep(d.measurement)) : null;
  const [showIntentions, setShowIntentions] = useState(false);

  // F3: before the sprint starts every day is editable, today included (it locks at start).
  const planCells: PlanCell[] = (sameTargets ?? Array<number>(14).fill(0)).map((t, i) => ({
    dayIndex: i + 1,
    date: addDays(startDate, i),
    locked: false,
    target: t,
    actual: null,
  }));
  const customParsed = d.custom.map((raw) => parseTargetInput(d.measurement, raw));
  const customPlan = d.mode === "custom" ? effectivePlan(planCells, true, customParsed) : null;
  const targets = d.mode === "custom" ? customPlan : sameTargets;
  const planDeltaValue = targets && amount !== null ? planDelta(targets, amount) : null;
  const planHint =
    d.mode !== "custom"
      ? null
      : customPlan === null
        ? "Every day needs a whole-number target."
        : planDeltaValue !== 0
          ? "The 14 targets must add up to the goal."
          : null;

  function pickMode(mode: "same" | "custom") {
    if (mode === "custom" && sameTargets && d.custom.every((v) => v.trim() === "")) {
      setD((p) => ({ ...p, mode, custom: sameTargets.map((t) => formatTargetInput(p.measurement, t)) }));
      return;
    }
    set("mode", mode);
  }

  // Rules 3–6 at setup: eligible = global or the chosen area; 1–5 impediments, one
  // highest with a complete WHEN → THEN → RECOVERED WHEN, 1–3 cues.
  const eligible = d.area ? eligibleFor(d.area) : () => false;
  const impOptions = library.impediments.filter(eligible);
  const cueOptions = library.cues.filter(eligible);
  const highest = impOptions.find((i) => i.id === d.highestId) ?? null;
  const highestNeedsProof = Boolean(highest && !proofComplete(highest));
  const proofOk = Boolean(highest) && (!highestNeedsProof || Boolean(d.proofWhen.trim() && d.proofThen.trim() && d.proofRecover.trim()));

  const usageRows = d.usage.filter((u) => u.label.trim() || u.amount !== "");
  const usageValid = d.measurement !== "money" || usageRows.every((u) => u.label.trim() && Number(u.amount) > 0);

  const stepHint: (string | null)[] = [
    !vision ? "Write the vision first." : !d.area ? "Choose an area without an active sprint." : !d.outcome.trim() ? "Describe the outcome." : null,
    !amountValid
      ? "Enter a whole-number goal above zero."
      : d.measurement === "money" && !/^[A-Za-z]{3}$/.test(d.currency)
        ? "Currency is a 3-letter code."
        : d.measurement === "quantity" && !d.unit.trim()
          ? "Name the unit."
          : !usageValid
            ? "Each usage row needs a label and an amount."
            : null,
    d.confidence === null ? "Pick a confidence from 1 to 10." : !d.why.trim() ? "Say why this matters." : !d.celebration.trim() ? "Name a celebration." : !d.mantra.trim() ? "A mantra is required." : null,
    planHint
      ? planHint
      : d.impedimentIds.length === 0
      ? "Select 1–5 impediments."
      : !d.highestId
        ? "Designate the highest impediment."
        : !proofOk
          ? "The highest impediment needs WHEN → THEN and a recovery criterion."
          : d.cueIds.length === 0
            ? "Select 1–3 execution cues."
            : !d.focusId || !d.cueIds.includes(d.focusId)
              ? "Pick the focus cue."
            : !d.aligned
              ? "Confirm the outcome advances the vision."
              : null,
  ];
  const canNext = stepHint[step] === null;

  function submit() {
    if (!canNext || pending || !d.area || !amountValid || amount === null || !targets) return;
    const input: StartSprintInput = {
      area: d.area,
      outcome: d.outcome,
      measurement: d.measurement,
      currency: d.measurement === "money" ? d.currency.toUpperCase() : null,
      unit: d.measurement === "quantity" ? d.unit : null,
      amount,
      confidence: d.confidence ?? 0,
      why: d.why,
      celebration: d.celebration,
      mantra: d.mantra,
      usageOfFunds: d.measurement === "money" ? usageRows.map((u) => ({ label: u.label.trim(), amount: toBaseUnits("money", { whole: Number(u.amount) }) })) : [],
      tz,
      startDate,
      intentions: d.intentions.some((t) => t.trim()) ? d.intentions : null,
      targets: d.mode === "custom" ? targets : null,
      cueIds: d.cueIds,
      focusCueId: d.focusId,
      impedimentIds: d.impedimentIds,
      highestImpedimentId: d.highestId,
      proofWhen: highestNeedsProof ? d.proofWhen : null,
      proofThen: highestNeedsProof ? d.proofThen : null,
      proofRecover: highestNeedsProof ? d.proofRecover : null,
    };
    setError(null);
    start(async () => {
      const res = await callAction(() => startSprintAction(input));
      if (res?.error) setError(res.error);
    });
  }

  const newCueReady = Boolean(newCue.trim() && newCueWhen.trim());

  async function createInline(kind: "cue" | "impediment") {
    const name = (kind === "cue" ? newCue : newImp).trim();
    const cueWhen = newCueWhen.trim();
    if (!name || (kind === "cue" && !cueWhen)) return;
    setCreating(kind);
    setError(null);
    const res = await callAction(() => createItem(kind, { name, explanation: "", scope: "global", cueWhen: kind === "cue" ? cueWhen : undefined }));
    setCreating(null);
    if (res.error || !res.id) {
      setError(res.error ?? "That did not save. Your input is still here — try again.");
      return;
    }
    const item: LibraryItem = {
      id: res.id,
      kind,
      name,
      explanation: null,
      scope: "global",
      rank: 0,
      archived_at: null,
      cue_when: kind === "cue" ? cueWhen : null,
      proof_when: null,
      proof_then: null,
      proof_recover: null,
      used: false,
      active: false,
    };
    if (kind === "cue") {
      setLibrary((l) => ({ ...l, cues: [...l.cues, item] }));
      setNewCue("");
      setNewCueWhen("");
      if (d.cueIds.length < 3) setCues([...d.cueIds, item.id]);
    } else {
      setLibrary((l) => ({ ...l, impediments: [...l.impediments, item] }));
      setNewImp("");
      if (d.impedimentIds.length < 5) set("impedimentIds", [...d.impedimentIds, item.id]);
    }
  }

  function toggleImpediment(id: string) {
    const on = d.impedimentIds.includes(id);
    const next = on ? d.impedimentIds.filter((x) => x !== id) : [...d.impedimentIds, id];
    setD((p) => ({ ...p, impedimentIds: next, highestId: on && p.highestId === id ? null : p.highestId }));
  }

  return (
    <div>
      <span className="tag tag-accent">New sprint</span>
      <h1 ref={heading} tabIndex={-1} className="heading page-title page-title-lg mt-12 wz-title">
        {STEPS[step]}
      </h1>
      <div className="wz-progress" aria-label={`Step ${step + 1} of 4`}>
        {STEPS.map((s, i) => (
          <span key={s} className={`v-seg ${i <= step ? "v-seg-on" : ""}`} />
        ))}
      </div>

      <div className="card wz-card">
        {step === 0 ? (
          <>
            {vision ? (
              <div className="wz-vision" data-testid="wizard-vision">
                <span className="label-accent">The vision</span>
                <div className="wz-vision-text">{vision}</div>
              </div>
            ) : (
              <p className="wz-blocked" data-testid="wizard-blocked">
                A sprint has to advance the vision, and none is written yet.{" "}
                <Link href="/vision" className="wz-strong">
                  Write the vision
                </Link>{" "}
                first; it takes three short steps.
              </p>
            )}
            <div className="label-accent" id="area-label">
              Area
            </div>
            <div className="pill-row" role="group" aria-labelledby="area-label">
              {areas.map((a) => {
                const disabled = !vision || a.hasSprint;
                return (
                  <button
                    key={a.key}
                    type="button"
                    className={`chip ${d.area === a.key ? "chip-on" : ""}`}
                    aria-pressed={d.area === a.key}
                    disabled={disabled}
                    onClick={() => setD((p) => ({ ...p, area: a.key, impedimentIds: [], highestId: null, cueIds: [], focusId: null }))}
                    title={a.hasSprint ? "A sprint is already active here" : undefined}
                  >
                    {a.name}
                    {a.hasSprint ? " · active" : ""}
                  </button>
                );
              })}
            </div>
            {vision && areas.every((a) => a.hasSprint) ? <p className="hint mt-10">Every area already has a sprint running.</p> : null}
            <label className="label-accent block mt-22" htmlFor="outcome">
              Sprint outcome
            </label>
            <input id="outcome" className="input mt-6" value={d.outcome} onChange={(e) => set("outcome", e.target.value)} placeholder="Save $8,000 toward the emergency fund" />
          </>
        ) : null}

        {step === 1 ? (
          <>
            <div className="label-accent" id="measurement-label">
              Measurement
            </div>
            <div className="pill-row" role="group" aria-labelledby="measurement-label">
              {(["money", "hours", "quantity"] as Measurement[]).map((m) => (
                <button key={m} type="button" className={`chip ${d.measurement === m ? "chip-on" : ""}`} aria-pressed={d.measurement === m} onClick={() => set("measurement", m)}>
                  {m[0].toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>

            <div className="wz-cols">
              {d.measurement === "hours" ? (
                <div className="wz-pair">
                  <label className="grow">
                    <span className="label-accent">Goal · hours</span>
                    <input className="input mt-6" type="number" min={0} step={1} inputMode="numeric" value={d.goalHours} onChange={(e) => set("goalHours", e.target.value)} />
                  </label>
                  <label className="grow">
                    <span className="label-accent">minutes</span>
                    <input className="input mt-6" type="number" min={0} max={59} step={1} inputMode="numeric" value={d.goalMinutes} onChange={(e) => set("goalMinutes", e.target.value)} />
                  </label>
                </div>
              ) : (
                <label>
                  <span className="label-accent">Sprint goal · whole {d.measurement === "money" ? "currency units" : "numbers"}</span>
                  <input id="goal" className="input mt-6" type="number" min={1} step={1} inputMode="numeric" value={d.goalWhole} onChange={(e) => set("goalWhole", e.target.value)} placeholder={d.measurement === "money" ? "8000" : "12"} />
                </label>
              )}
              {d.measurement === "money" ? (
                <label>
                  <span className="label-accent">Currency</span>
                  <input className="input mt-6 wz-upper" value={d.currency} maxLength={3} onChange={(e) => set("currency", e.target.value.toUpperCase())} />
                </label>
              ) : d.measurement === "quantity" ? (
                <label>
                  <span className="label-accent">Unit name</span>
                  <input className="input mt-6" value={d.unit} onChange={(e) => set("unit", e.target.value)} placeholder="workouts" />
                </label>
              ) : (
                <div />
              )}
            </div>

            {d.measurement === "money" ? (
              <div className="mt-22">
                <div className="label-accent">Usage of funds · if I earn this, what is it for?</div>
                <div className="wz-row mt-8" aria-hidden="true">
                  <span className="label-muted wz-two">Label</span>
                  <span className="label-muted grow">Amount</span>
                  <span className="wz-spacer" />
                </div>
                {d.usage.map((u, i) => (
                  <div key={i} className="wz-row mt-8">
                    <input className="input wz-two" placeholder="Rent" aria-label={`Usage ${i + 1} label`} value={u.label} onChange={(e) => set("usage", d.usage.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                    <input className="input grow" type="number" min={1} step={1} inputMode="numeric" placeholder="2800" aria-label={`Usage ${i + 1} amount`} value={u.amount} onChange={(e) => set("usage", d.usage.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
                    <button type="button" className="btn btn-ghost" aria-label={`Remove usage ${i + 1}`} onClick={() => set("usage", d.usage.filter((_, j) => j !== i))}>
                      ×
                    </button>
                  </div>
                ))}
                <button type="button" className="btn btn-ghost mt-8" onClick={() => set("usage", [...d.usage, { label: "", amount: "" }])}>
                  Add a use
                </button>
              </div>
            ) : null}

            <div className="mt-22">
              <div className="label-accent" id="start-label">
                Start
              </div>
              <div className="pill-row" role="group" aria-labelledby="start-label">
                <button type="button" className={`chip ${!d.startsTomorrow ? "chip-on" : ""}`} aria-pressed={!d.startsTomorrow} onClick={() => set("startsTomorrow", false)}>
                  Today · {formatIsoDate(today, { weekday: "short", month: "short", day: "numeric" })}
                </button>
                <button type="button" className={`chip ${d.startsTomorrow ? "chip-on" : ""}`} aria-pressed={d.startsTomorrow} onClick={() => set("startsTomorrow", true)}>
                  Tomorrow · {formatIsoDate(addDays(today, 1), { weekday: "short", month: "short", day: "numeric" })}
                </button>
              </div>
              <div className="wz-note mt-8">Days turn at midnight in {tz.replace("_", " ")}; the zone locks with the sprint.</div>
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <div className="label-accent" id="confidence-label">
              Confidence · 6–8 is the ideal stretch
            </div>
            <div className="wz-chips" role="group" aria-labelledby="confidence-label">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`chip wz-conf ${d.confidence === n ? "chip-on" : n >= 6 && n <= 8 ? "wz-conf-ideal" : ""}`}
                  aria-label={`Confidence ${n}`}
                  aria-pressed={d.confidence === n}
                  onClick={() => set("confidence", n)}
                >
                  {n}
                </button>
              ))}
            </div>
            <label className="label-accent block mt-22" htmlFor="why">
              Why this sprint matters
            </label>
            <textarea id="why" className="input mt-6" rows={3} value={d.why} onChange={(e) => set("why", e.target.value)} />
            <label className="label-accent block mt-18" htmlFor="celebration">
              Celebration when the goal lands
            </label>
            <input id="celebration" className="input mt-6" value={d.celebration} onChange={(e) => set("celebration", e.target.value)} />
            <label className="label-accent block mt-18" htmlFor="mantra">
              Mantra · shown on Today every day
            </label>
            <input id="mantra" className="input mt-6" value={d.mantra} onChange={(e) => set("mantra", e.target.value)} placeholder="An inspirational phrase" />
          </>
        ) : null}

        {step === 3 && sameTargets ? (
          <>
            <div className="wz-between">
              <div className="label-accent">14 daily targets · {d.mode === "same" ? "same each day" : "custom"}</div>
              <div className="wz-modes" role="group" aria-label="Target mode">
                <button type="button" className={`chip ${d.mode === "same" ? "chip-on" : ""}`} aria-pressed={d.mode === "same"} onClick={() => pickMode("same")}>
                  Same
                </button>
                <button type="button" className={`chip ${d.mode === "custom" ? "chip-on" : ""}`} aria-pressed={d.mode === "custom"} onClick={() => pickMode("custom")}>
                  Custom
                </button>
              </div>
            </div>
            <div className="mt-12">
              <PlanGrid
                measured={measured}
                goal={amount!}
                cells={planCells}
                editing={d.mode === "custom"}
                values={d.custom}
                parsed={customParsed}
                onChange={(i, raw) => set("custom", d.custom.map((x, j) => (j === i ? raw : x)))}
              />
            </div>
            <div className="wz-note wz-narrow mt-10">
              {d.mode === "custom"
                ? `Each day stands alone — zero is fine for a day off. Start is available once the plan totals the goal.${d.measurement === "hours" ? " Enter hours as h:mm." : ""}`
                : hasRoundingDifference(sameTargets)
                  ? `The goal does not split evenly, so the first days carry one extra ${unitLabel(measured)}.`
                  : "Goal ÷ 14, the same every day. Choose Custom to set days individually."}
            </div>

            <div className="wz-section" data-testid="wizard-impediments">
              <div className="wz-between">
                <span className="wz-group-title">
                  Impediments <span className={`wz-count ${d.impedimentIds.length > 0 ? "wz-count-on" : ""}`}>{d.impedimentIds.length} of 5</span>
                </span>
                <span className="wz-note">What is most likely to get in the way?</span>
              </div>
              <div role="group" aria-label="Impediments" className="mt-6">
                {impOptions.map((i) => (
                  <OptionRow
                    key={i.id}
                    on={d.impedimentIds.includes(i.id)}
                    disabled={!d.impedimentIds.includes(i.id) && d.impedimentIds.length >= 5}
                    label={i.name}
                    sub={proofSummary(i) ?? i.explanation}
                    tag={i.scope === "global" ? "Global" : null}
                    onPick={() => toggleImpediment(i.id)}
                  />
                ))}
              </div>
              <label htmlFor="new-impediment" className="label-accent block mt-12">
                Create a new impediment
              </label>
              <div className="wz-row mt-6">
                <input id="new-impediment" className="input grow" value={newImp} onChange={(e) => setNewImp(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); createInline("impediment"); } }} />
                <button type="button" className="btn btn-ghost wz-create" disabled={!newImp.trim() || creating !== null} onClick={() => createInline("impediment")}>
                  {creating === "impediment" ? "Creating…" : "Create"}
                </button>
              </div>
            </div>

            {d.impedimentIds.length > 0 ? (
              <div className="wz-highest" data-testid="wizard-highest">
                <div className="wz-group-title">Highest impediment</div>
                <div className="wz-blurb">
                  The obstacle most likely to cause this sprint to fail. It must carry a WHEN → THEN proof point and a recovery criterion.
                </div>
                <div role="radiogroup" aria-label="Highest impediment">
                  {impOptions
                    .filter((i) => d.impedimentIds.includes(i.id))
                    .map((i) => (
                      <OptionRow
                        key={i.id}
                        single
                        on={d.highestId === i.id}
                        label={i.name}
                        sub={proofComplete(i) ? null : proofSummary(i) ? "Proof point incomplete — complete it below" : "No proof point yet — write one below"}
                        onPick={() => setD((p) => ({ ...p, highestId: i.id, proofWhen: i.proof_when ?? "", proofThen: i.proof_then ?? "", proofRecover: i.proof_recover ?? "" }))}
                      />
                    ))}
                </div>
                {highestNeedsProof ? (
                  <ProofInputs
                    idPrefix="proof"
                    when={d.proofWhen}
                    then={d.proofThen}
                    recover={d.proofRecover}
                    onWhen={(v) => set("proofWhen", v)}
                    onThen={(v) => set("proofThen", v)}
                    onRecover={(v) => set("proofRecover", v)}
                    placeholderWhen="I notice myself delaying my first work block"
                    placeholderThen="I start a 10-minute timer on the smallest executable task"
                    placeholderRecover="The timer is running within 10 minutes"
                    className="mt-14"
                  />
                ) : null}
              </div>
            ) : null}

            <div className="mt-22" data-testid="wizard-cues">
              <div className="wz-between">
                <span className="wz-group-title">
                  Execution cues <span className={`wz-count ${d.cueIds.length > 0 ? "wz-count-on" : ""}`}>{d.cueIds.length} of 3</span>
                </span>
                <span className="wz-note">What should I remember to help me succeed?</span>
              </div>
              <div role="group" aria-label="Execution cues" className="mt-6">
                {cueOptions.map((c) => (
                  <OptionRow
                    key={c.id}
                    on={d.cueIds.includes(c.id)}
                    disabled={!d.cueIds.includes(c.id) && d.cueIds.length >= 3}
                    label={c.name}
                    sub={cueSummary(c) ?? c.explanation}
                    tag={c.scope === "global" ? "Global" : null}
                    onPick={() => setCues(d.cueIds.includes(c.id) ? d.cueIds.filter((x) => x !== c.id) : [...d.cueIds, c.id])}
                  />
                ))}
              </div>
              {d.cueIds.length > 0 ? (
                <div className="mt-12" data-testid="wizard-focus">
                  <div className="wz-between">
                    <span id="focus-label" className="wz-group-title">
                      Focus cue
                    </span>
                    <span className="wz-note">Its use is asked first at every Day Close.</span>
                  </div>
                  <div role="radiogroup" aria-labelledby="focus-label" className="mt-6">
                    {cueOptions
                      .filter((c) => d.cueIds.includes(c.id))
                      .map((c) => (
                        <OptionRow key={c.id} single on={d.focusId === c.id} label={c.name} onPick={() => set("focusId", c.id)} />
                      ))}
                  </div>
                </div>
              ) : null}
              <div className="label-accent mt-12" id="new-cue-label">
                Create a new execution cue
              </div>
              <div className="proof-grid mt-6" role="group" aria-labelledby="new-cue-label">
                <label htmlFor="new-cue-when" className="label-accent proof-label">
                  WHEN
                </label>
                <input
                  id="new-cue-when"
                  className="input input-compact"
                  value={newCueWhen}
                  onChange={(e) => setNewCueWhen(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); createInline("cue"); } }}
                  placeholder="I schedule anything"
                />
                <label htmlFor="new-cue" className="label-accent proof-label">
                  REMIND
                </label>
                <div className="wz-row">
                  <input
                    id="new-cue"
                    className="input input-compact grow"
                    value={newCue}
                    onChange={(e) => setNewCue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); createInline("cue"); } }}
                    placeholder='ask "How much does this pay?"'
                  />
                  <button type="button" className="btn btn-ghost wz-create" disabled={!newCueReady || creating !== null} onClick={() => createInline("cue")}>
                    {creating === "cue" ? "Creating…" : "Create"}
                  </button>
                </div>
              </div>
            </div>

            <label className="label-accent block mt-22" htmlFor="intention-1">
              Day 1 intention · optional
            </label>
            <textarea id="intention-1" className="input mt-6" rows={2} value={d.intentions[0]} onChange={(e) => set("intentions", d.intentions.map((x, j) => (j === 0 ? e.target.value : x)))} placeholder="Today I will…" />
            <button type="button" className="disclosure mt-10" aria-expanded={showIntentions} onClick={() => setShowIntentions((v) => !v)} data-testid="intentions-toggle">
              <span aria-hidden="true">{showIntentions ? "▾" : "▸"}</span> Pre-plan intentions for days 2–14
            </button>
            {showIntentions ? (
              <div className="wz-intentions" data-testid="intentions">
                {planCells.slice(1).map((c) => (
                  <Fragment key={c.dayIndex}>
                    <label htmlFor={`intention-${c.dayIndex}`} className="wz-note nowrap">
                      <strong className="wz-day">D{c.dayIndex}</strong> {formatIsoDate(c.date, { weekday: "short", day: "numeric" })}
                    </label>
                    <input id={`intention-${c.dayIndex}`} className="input wz-input-tight" value={d.intentions[c.dayIndex - 1]} onChange={(e) => set("intentions", d.intentions.map((x, j) => (j === c.dayIndex - 1 ? e.target.value : x)))} placeholder="On this day I will…" />
                  </Fragment>
                ))}
              </div>
            ) : null}

            <label className="wz-align">
              <input type="checkbox" className="check" aria-label="Vision alignment" checked={d.aligned} onChange={(e) => set("aligned", e.target.checked)} />
              <span className="wz-align-text">This outcome meaningfully advances my vision.</span>
            </label>
          </>
        ) : null}

        {error ? (
          <ErrorBar className="mt-18" action={{ label: "Retry", onClick: submit }}>{error}</ErrorBar>
        ) : null}

        <div className="wz-foot">
          {step > 0 ? (
            <button type="button" className="btn btn-ghost" onClick={() => setStep(step - 1)}>
              Back
            </button>
          ) : (
            <Link href="/sprints" className="btn btn-ghost btn-link">
              Cancel
            </Link>
          )}
          <div className="wz-foot-actions">
            <span className="hint" id="wizard-hint" aria-live="polite">
              {stepHint[step] ?? ""}
            </span>
            {step < 3 ? (
              <button
                type="button"
                className="btn btn-primary"
                aria-disabled={!canNext}
                aria-describedby={canNext ? undefined : "wizard-hint"}
                onClick={() => {
                  if (canNext) setStep(step + 1);
                }}
              >
                Continue
              </button>
            ) : (
              <button type="button" className="btn btn-primary" aria-disabled={!canNext || pending} aria-describedby={canNext ? undefined : "wizard-hint"} onClick={submit}>
                {pending ? "Starting…" : "Start sprint"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
