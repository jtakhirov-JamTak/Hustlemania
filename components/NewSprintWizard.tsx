"use client";

import { ErrorBar } from "@/components/ErrorBar";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { createSituations } from "@/app/(app)/actions/library";
import { startSprintAction, type StartSprintInput } from "@/app/(app)/actions/sprint";
import { effectivePlan, type PlanCell } from "@/components/PlanGrid";
import type { SituationOption } from "@/components/SituationPicker";
import { useDeviceToday } from "@/components/useDeviceToday";
import { type Draft, planHint, STEPS, stepHints } from "@/components/wizard/draft";
import { StepArea, type AreaOption } from "@/components/wizard/StepArea";
import { StepConfidence } from "@/components/wizard/StepConfidence";
import { StepItems, type CreateSituations } from "@/components/wizard/StepItems";
import { StepMeasure } from "@/components/wizard/StepMeasure";
import { StepTargets } from "@/components/wizard/StepTargets";
import { areaName, type AreaKey } from "@/lib/areas";
import { callAction } from "@/lib/callAction";
import { eligibleFor, joinBlocker, proofComplete, type AreaKit, type LibraryItem, type SituationItem } from "@/lib/data";
import { prefillFromKit } from "@/lib/kit";
import { toBaseUnits, type Measured } from "@/lib/format";
import { addDays, localDateIn } from "@/lib/sprintDay";
import { formatTargetInput, measurementStep, parseTargetInput, planDelta, sameDailyTargets } from "@/lib/targets";

type Library = { cues: LibraryItem[]; impediments: LibraryItem[] };

const LAST = STEPS.length - 1;

/**
 * F18: five steps — Area & outcome · Measure & goal · Confidence & mantra · Daily targets ·
 * Impediments & cues. This component keeps the draft, derives the hints (`stepHints`),
 * submits and renders the header, the progress bar and the footer; each step's fields
 * live in `components/wizard/Step*.tsx`.
 *
 * F9: `vision` is the account's one vision (its text) or null; without it no Area can
 * start. F10: `kits` carries each Area's last postmortem decisions, which pre-check step
 * 5 — picking an Area re-reads its own kit, so switching Areas never carries the previous
 * one's items across. F15 / F17: `situations` feeds the inline creates' APPLIES TO.
 */
export function NewSprintWizard({
  areas,
  initialArea,
  library: initialLibrary,
  situations: initialSituations,
  vision,
  kits,
}: {
  areas: AreaOption[];
  initialArea: AreaKey | null;
  library: Library;
  situations: SituationItem[];
  vision: string | null;
  kits: Partial<Record<AreaKey, AreaKit | null>>;
}) {
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [library, setLibrary] = useState<Library>(initialLibrary);
  const [sits, setSits] = useState<SituationOption[]>(initialSituations.map((s) => ({ id: s.id, name: s.name })));
  const [pending, start] = useTransition();
  /**
   * Step 5's starting picks for an Area: the kit from its last postmortem, filtered to
   * what that Area's library still offers — and, F15, to what can still join a sprint
   * (a situation on every item; a complete response on every impediment).
   */
  const prefillFor = (area: AreaKey) => {
    const joinable = (i: LibraryItem) => joinBlocker(i) === null;
    return prefillFromKit(kits[area], {
      cues: initialLibrary.cues.filter(eligibleFor(area)).filter(joinable),
      impediments: initialLibrary.impediments.filter(eligibleFor(area)).filter(joinable),
    });
  };

  /** F17: situations named inline (a spoken list) are saved to the one library (global scope); the step ticks them. */
  const createSituationsInline: CreateSituations = async (names) => {
    const res = await callAction(() => createSituations(names, "global"));
    if (res.error || !res.ids) return { error: res.error ?? "That did not save." };
    const ids = res.ids;
    setSits((s) => [...s, ...ids.map((id, i) => ({ id, name: names[i] ?? "" })).filter((n) => !s.some((x) => x.id === n.id))]);
    return { ids };
  };

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
    celebration: "",
    mantra: "",
    mode: "same",
    custom: Array(14).fill(""),
    proofThen: "",
    proofRecover: "",
    ...(initialArea ? prefillFor(initialArea) : { impedimentIds: [], highestId: null, cueIds: [], focusId: null }),
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

  // Read after mount and again when the tab returns, never during render: the server's
  // zone differs, and a date fixed at mount is yesterday's after midnight (#16).
  const device = useDeviceToday();
  const tz = device?.tz ?? "UTC";
  const today = device?.today ?? null;
  const startDate = today ? (d.startsTomorrow ? addDays(today, 1) : today) : null;

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

  // F3: before the sprint starts every day is editable, today included (it locks at start).
  // Step 4 is never the first render, so the cells always have the device date by the
  // time they are shown; the epoch placeholder only keeps the type honest before mount.
  const planCells: PlanCell[] = (sameTargets ?? Array<number>(14).fill(0)).map((t, i) => ({
    dayIndex: i + 1,
    date: addDays(startDate ?? "1970-01-01", i),
    locked: false,
    target: t,
    actual: null,
  }));
  const customParsed = d.custom.map((raw) => parseTargetInput(d.measurement, raw));
  const customPlan = d.mode === "custom" ? effectivePlan(planCells, true, customParsed) : null;
  const targets = d.mode === "custom" ? customPlan : sameTargets;
  const plan = planHint({ mode: d.mode, customPlan, delta: targets && amount !== null ? planDelta(targets, amount) : null });

  function pickMode(mode: "same" | "custom") {
    if (mode === "custom" && sameTargets && d.custom.every((v) => v.trim() === "")) {
      setD((p) => ({ ...p, mode, custom: sameTargets.map((t) => formatTargetInput(p.measurement, t)) }));
      return;
    }
    set("mode", mode);
  }

  // Rules 3–6 at setup (F15): eligible = global or the chosen area; 1–3 impediments, one
  // highest, a complete THEN → RECOVERED WHEN on every impediment (the highest's can be
  // written here), 0–3 cues, and a situation on every member.
  const eligible = d.area ? eligibleFor(d.area) : () => false;
  const impOptions = library.impediments.filter(eligible);
  const cueOptions = library.cues.filter(eligible);
  const highest = impOptions.find((i) => i.id === d.highestId) ?? null;
  const highestNeedsProof = Boolean(highest && !proofComplete(highest));
  const proofOk = Boolean(highest) && (!highestNeedsProof || Boolean(d.proofThen.trim() && d.proofRecover.trim()));
  const incomplete = impOptions.find((i) => d.impedimentIds.includes(i.id) && i.id !== d.highestId && !proofComplete(i)) ?? null;

  const usageRows = d.usage.filter((u) => u.label.trim() || u.amount !== "");
  const usageValid = d.measurement !== "money" || usageRows.every((u) => u.label.trim() && Number(u.amount) > 0);

  const hints = stepHints({
    vision: Boolean(vision),
    area: Boolean(d.area),
    outcome: d.outcome,
    amountValid,
    measurement: d.measurement,
    currency: d.currency,
    unit: d.unit,
    usageValid,
    confidence: d.confidence,
    celebration: d.celebration,
    mantra: d.mantra,
    plan,
    impediments: d.impedimentIds.length,
    highest: Boolean(d.highestId),
    proofOk,
    incomplete: incomplete?.name ?? null,
  });
  const hint = hints[step] ?? null;
  const canNext = hint === null;

  function submit() {
    if (!canNext || pending || !d.area || !amountValid || amount === null || !targets || !device) return;
    // The date is read at the moment of submitting, so a wizard left open across
    // midnight starts today, not yesterday (#16).
    const now = localDateIn(device.tz, new Date());
    const input: StartSprintInput = {
      area: d.area,
      outcome: d.outcome,
      measurement: d.measurement,
      currency: d.measurement === "money" ? d.currency.toUpperCase() : null,
      unit: d.measurement === "quantity" ? d.unit : null,
      amount,
      confidence: d.confidence ?? 0,
      celebration: d.celebration,
      mantra: d.mantra,
      usageOfFunds: d.measurement === "money" ? usageRows.map((u) => ({ label: u.label.trim(), amount: toBaseUnits("money", { whole: Number(u.amount) }) })) : [],
      tz: device.tz,
      startDate: d.startsTomorrow ? addDays(now, 1) : now,
      targets: d.mode === "custom" ? targets : null,
      cueIds: d.cueIds,
      focusCueId: d.cueIds.length > 0 ? d.focusId : null,
      impedimentIds: d.impedimentIds,
      highestImpedimentId: d.highestId,
      proofThen: highestNeedsProof ? d.proofThen : null,
      proofRecover: highestNeedsProof ? d.proofRecover : null,
    };
    setError(null);
    start(async () => {
      const res = await callAction(() => startSprintAction(input));
      if (res?.error) setError(res.error);
    });
  }

  /** A created item lands in the library list and joins the sprint at once (a new impediment as the highest when there is none). */
  function created(item: LibraryItem) {
    if (item.kind === "cue") {
      setLibrary((l) => ({ ...l, cues: [...l.cues, item] }));
      if (d.cueIds.length < 3) setCues([...d.cueIds, item.id]);
    } else {
      setLibrary((l) => ({ ...l, impediments: [...l.impediments, item] }));
      if (d.impedimentIds.length < 3)
        setD((p) => ({
          ...p,
          impedimentIds: [...p.impedimentIds, item.id],
          highestId: p.highestId ?? item.id,
          proofThen: p.highestId ? p.proofThen : (item.proof_then ?? ""),
          proofRecover: p.highestId ? p.proofRecover : (item.proof_recover ?? ""),
        }));
    }
  }

  function toggleImpediment(id: string) {
    const on = d.impedimentIds.includes(id);
    const next = on ? d.impedimentIds.filter((x) => x !== id) : [...d.impedimentIds, id];
    setD((p) => ({ ...p, impedimentIds: next, highestId: on && p.highestId === id ? null : p.highestId }));
  }

  return (
    <div>
      <span className="tag tag-accent">New sprint · Step {step + 1} of {STEPS.length}</span>
      <h1 ref={heading} tabIndex={-1} className="heading page-title page-title-lg mt-12 wz-title">
        {STEPS[step]}
      </h1>
      <div className="wz-progress" aria-hidden="true">
        {STEPS.map((s, i) => (
          <span key={s} className={`v-seg ${i <= step ? "v-seg-on" : ""}`} />
        ))}
      </div>
      <div className="v-steps wz-steps" aria-hidden="true">
        {STEPS.map((s, i) => (
          <span key={s} className={i === step ? "v-step-on" : ""}>
            {s}
          </span>
        ))}
      </div>

      <div className="card wz-card">
        {step === 0 ? (
          <StepArea
            vision={vision}
            areas={areas}
            area={d.area}
            outcome={d.outcome}
            // Only a CHANGE of Area re-seeds step 5; re-clicking the selected chip would
            // wipe the user's picks (full review 2026-09-09, #21).
            onArea={(key) => setD((p) => (p.area === key ? p : { ...p, area: key, ...prefillFor(key) }))}
            onOutcome={(v) => set("outcome", v)}
          />
        ) : null}

        {step === 1 ? <StepMeasure d={d} set={set} today={today} tz={tz} /> : null}

        {step === 2 ? (
          <StepConfidence
            confidence={d.confidence}
            celebration={d.celebration}
            mantra={d.mantra}
            onConfidence={(n) => set("confidence", n)}
            onCelebration={(v) => set("celebration", v)}
            onMantra={(v) => set("mantra", v)}
          />
        ) : null}

        {step === 3 && sameTargets && amount !== null ? (
          <StepTargets
            mode={d.mode}
            onMode={pickMode}
            measured={measured}
            amount={amount}
            cells={planCells}
            values={d.custom}
            parsed={customParsed}
            onValue={(i, raw) => set("custom", d.custom.map((x, j) => (j === i ? raw : x)))}
            sameTargets={sameTargets}
          />
        ) : null}

        {step === 4 ? (
          <StepItems
            kitNote={d.area && kits[d.area] ? `Pre-filled from your last ${areaName(d.area)} review. Change anything you like.` : null}
            impOptions={impOptions}
            cueOptions={cueOptions}
            impedimentIds={d.impedimentIds}
            highestId={d.highestId}
            proofThen={d.proofThen}
            proofRecover={d.proofRecover}
            highestNeedsProof={highestNeedsProof}
            cueIds={d.cueIds}
            focusId={d.focusId}
            sits={sits}
            onToggleImpediment={toggleImpediment}
            onPickHighest={(i) => setD((p) => ({ ...p, highestId: i.id, proofThen: i.proof_then ?? "", proofRecover: i.proof_recover ?? "" }))}
            onProofThen={(v) => set("proofThen", v)}
            onProofRecover={(v) => set("proofRecover", v)}
            onToggleCue={(id) => setCues(d.cueIds.includes(id) ? d.cueIds.filter((x) => x !== id) : [...d.cueIds, id])}
            onFocus={(id) => set("focusId", id)}
            onCreated={created}
            onCreateSituations={createSituationsInline}
          />
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
              {hint ?? ""}
            </span>
            {step < LAST ? (
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
