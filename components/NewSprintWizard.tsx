"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { startSprintAction, type StartSprintInput } from "@/app/(app)/actions";
import type { AreaKey } from "@/lib/areas";
import { formatIsoDate, SHORT_DOW, dayOfWeek, dayOfMonth } from "@/lib/dates";
import { formatAmount, formatNumber, toBaseUnits, unitLabel, type Measurement, type Measured } from "@/lib/format";
import { addDays, localDateIn } from "@/lib/sprintDay";
import { hasRoundingDifference, measurementStep, sameDailyTargets } from "@/lib/targets";

type AreaOption = { key: AreaKey; name: string; hasVision: boolean; hasSprint: boolean };

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
  intention: string;
  aligned: boolean;
};

const STEPS = ["Area & outcome", "Measure & goal", "Confidence & mantra", "Plan & start"];

export function NewSprintWizard({ areas, initialArea }: { areas: AreaOption[]; initialArea: AreaKey | null }) {
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
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
    intention: "",
    aligned: false,
  });
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

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
  const targets = amountValid ? sameDailyTargets(amount!, measurementStep(d.measurement)) : null;

  const usageRows = d.usage.filter((u) => u.label.trim() || u.amount !== "");
  const usageValid = d.measurement !== "money" || usageRows.every((u) => u.label.trim() && Number(u.amount) > 0);

  const stepHint: (string | null)[] = [
    !d.area ? "Choose an area with a vision and no active sprint." : !d.outcome.trim() ? "Describe the outcome." : null,
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
    !d.aligned ? "Confirm the outcome advances the vision." : null,
  ];
  const canNext = stepHint[step] === null;

  function submit() {
    if (!d.area || !amountValid || amount === null) return;
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
      intention: d.intention || null,
    };
    setError(null);
    start(async () => {
      const res = await startSprintAction(input);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div>
      <span className="tag tag-accent">New sprint</span>
      <h1 className="heading" style={{ fontSize: 38, margin: "12px 0 0", letterSpacing: "-0.03em" }}>
        {STEPS[step]}
      </h1>
      <div style={{ display: "flex", gap: 4, marginTop: 16, maxWidth: 420 }} aria-label={`Step ${step + 1} of 4`}>
        {STEPS.map((s, i) => (
          <span key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= step ? "var(--accent)" : "var(--faint)" }} />
        ))}
      </div>

      <div className="card" style={{ marginTop: 22, padding: "24px 26px" }}>
        {step === 0 ? (
          <>
            <div className="label-accent">Area</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              {areas.map((a) => {
                const disabled = !a.hasVision || a.hasSprint;
                return (
                  <button
                    key={a.key}
                    type="button"
                    className={`chip ${d.area === a.key ? "chip-on" : ""}`}
                    disabled={disabled}
                    onClick={() => set("area", a.key)}
                    title={!a.hasVision ? "No 1-year vision yet" : a.hasSprint ? "A sprint is already active here" : undefined}
                  >
                    {a.name}
                    {!a.hasVision ? " · no vision" : a.hasSprint ? " · active" : ""}
                  </button>
                );
              })}
            </div>
            {areas.every((a) => !a.hasVision || a.hasSprint) ? (
              <p className="hint" style={{ marginTop: 10 }}>
                Every area is either locked or already sprinting.{" "}
                <Link href="/vision" style={{ fontWeight: 600 }}>
                  Write a vision
                </Link>
                .
              </p>
            ) : null}
            <label className="label-accent" htmlFor="outcome" style={{ display: "block", marginTop: 22 }}>
              Sprint outcome
            </label>
            <input id="outcome" className="input" value={d.outcome} onChange={(e) => set("outcome", e.target.value)} placeholder="Save $8,000 toward the emergency fund" style={{ marginTop: 6 }} />
          </>
        ) : null}

        {step === 1 ? (
          <>
            <div className="label-accent">Measurement</div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              {(["money", "hours", "quantity"] as Measurement[]).map((m) => (
                <button key={m} type="button" className={`chip ${d.measurement === m ? "chip-on" : ""}`} onClick={() => set("measurement", m)}>
                  {m[0].toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, marginTop: 22 }} data-cols>
              {d.measurement === "hours" ? (
                <div style={{ display: "flex", gap: 10 }}>
                  <label style={{ flex: 1 }}>
                    <span className="label-accent">Goal · hours</span>
                    <input className="input" type="number" min={0} step={1} inputMode="numeric" value={d.goalHours} onChange={(e) => set("goalHours", e.target.value)} style={{ marginTop: 6 }} />
                  </label>
                  <label style={{ flex: 1 }}>
                    <span className="label-accent">minutes</span>
                    <input className="input" type="number" min={0} max={59} step={1} inputMode="numeric" value={d.goalMinutes} onChange={(e) => set("goalMinutes", e.target.value)} style={{ marginTop: 6 }} />
                  </label>
                </div>
              ) : (
                <label>
                  <span className="label-accent">Sprint goal · whole {d.measurement === "money" ? "currency units" : "numbers"}</span>
                  <input id="goal" className="input" type="number" min={1} step={1} inputMode="numeric" value={d.goalWhole} onChange={(e) => set("goalWhole", e.target.value)} placeholder={d.measurement === "money" ? "8000" : "12"} style={{ marginTop: 6 }} />
                </label>
              )}
              {d.measurement === "money" ? (
                <label>
                  <span className="label-accent">Currency</span>
                  <input className="input" value={d.currency} maxLength={3} onChange={(e) => set("currency", e.target.value.toUpperCase())} style={{ marginTop: 6, textTransform: "uppercase" }} />
                </label>
              ) : d.measurement === "quantity" ? (
                <label>
                  <span className="label-accent">Unit name</span>
                  <input className="input" value={d.unit} onChange={(e) => set("unit", e.target.value)} placeholder="workouts" style={{ marginTop: 6 }} />
                </label>
              ) : (
                <div />
              )}
            </div>

            {d.measurement === "money" ? (
              <div style={{ marginTop: 22 }}>
                <div className="label-accent">Usage of funds · if I earn this, what is it for?</div>
                {d.usage.map((u, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <input className="input" placeholder="Rent" aria-label={`Usage ${i + 1} label`} value={u.label} onChange={(e) => set("usage", d.usage.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} style={{ flex: 2 }} />
                    <input className="input" type="number" min={1} step={1} inputMode="numeric" placeholder="2800" aria-label={`Usage ${i + 1} amount`} value={u.amount} onChange={(e) => set("usage", d.usage.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} style={{ flex: 1 }} />
                    <button type="button" className="btn btn-ghost" aria-label="Remove row" onClick={() => set("usage", d.usage.filter((_, j) => j !== i))}>
                      ×
                    </button>
                  </div>
                ))}
                <button type="button" className="btn btn-ghost" style={{ marginTop: 8 }} onClick={() => set("usage", [...d.usage, { label: "", amount: "" }])}>
                  Add a use
                </button>
              </div>
            ) : null}

            <div style={{ marginTop: 22 }}>
              <div className="label-accent">Start</div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button type="button" className={`chip ${!d.startsTomorrow ? "chip-on" : ""}`} onClick={() => set("startsTomorrow", false)}>
                  Today · {formatIsoDate(today, { weekday: "short", month: "short", day: "numeric" })}
                </button>
                <button type="button" className={`chip ${d.startsTomorrow ? "chip-on" : ""}`} onClick={() => set("startsTomorrow", true)}>
                  Tomorrow · {formatIsoDate(addDays(today, 1), { weekday: "short", month: "short", day: "numeric" })}
                </button>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 8 }}>
                Days turn at midnight in {tz.replace("_", " ")}; the zone locks with the sprint.
              </div>
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <div className="label-accent">Confidence · 6–8 is the ideal stretch</div>
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`chip ${d.confidence === n ? "chip-on" : ""}`}
                  aria-label={`Confidence ${n}`}
                  onClick={() => set("confidence", n)}
                  style={{ minWidth: 40, justifyContent: "center", borderColor: n >= 6 && n <= 8 && d.confidence !== n ? "var(--accent)" : undefined }}
                >
                  {n}
                </button>
              ))}
            </div>
            <label className="label-accent" htmlFor="why" style={{ display: "block", marginTop: 22 }}>
              Why this sprint matters
            </label>
            <textarea id="why" className="input" rows={3} value={d.why} onChange={(e) => set("why", e.target.value)} style={{ marginTop: 6 }} />
            <label className="label-accent" htmlFor="celebration" style={{ display: "block", marginTop: 18 }}>
              Celebration when the goal lands
            </label>
            <input id="celebration" className="input" value={d.celebration} onChange={(e) => set("celebration", e.target.value)} style={{ marginTop: 6 }} />
            <label className="label-accent" htmlFor="mantra" style={{ display: "block", marginTop: 18 }}>
              Mantra · shown on Today every day
            </label>
            <input id="mantra" className="input" value={d.mantra} onChange={(e) => set("mantra", e.target.value)} placeholder="An inspirational phrase" style={{ marginTop: 6 }} />
          </>
        ) : null}

        {step === 3 && targets ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <div className="label-accent">14 daily targets · same each day</div>
              <div style={{ display: "flex", gap: 6 }}>
                <span className="chip chip-on">Same</span>
                <span className="chip" title="Custom targets arrive with a later feature" style={{ opacity: 0.5 }}>
                  Custom · soon
                </span>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 6, marginTop: 12 }} data-strip>
              {targets.map((t, i) => {
                const date = addDays(startDate, i);
                return (
                  <div key={i} style={{ border: "1px solid var(--divider)", borderRadius: 10, padding: "8px 6px", textAlign: "center", minWidth: 0 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "var(--accent)" }}>D{i + 1}</div>
                    <div style={{ fontSize: 9.5, color: "var(--muted)" }}>
                      {SHORT_DOW[dayOfWeek(date)]} {dayOfMonth(date)}
                    </div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 2 }}>{formatNumber(measured, t)}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--muted)", marginTop: 10, flexWrap: "wrap", gap: 8 }}>
              <span>
                Planned {formatAmount(measured, targets.reduce((a, b) => a + b, 0))} · Goal {formatAmount(measured, amount!)} · balanced
              </span>
              {hasRoundingDifference(targets) ? <span>The goal does not split evenly, so the first days carry one extra {unitLabel(measured)}.</span> : null}
            </div>

            <label className="label-accent" htmlFor="intention" style={{ display: "block", marginTop: 22 }}>
              Day 1 intention · optional
            </label>
            <textarea id="intention" className="input" rows={2} value={d.intention} onChange={(e) => set("intention", e.target.value)} placeholder="Today I will…" style={{ marginTop: 6 }} />

            <label style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 22, cursor: "pointer" }}>
              <span
                role="checkbox"
                aria-checked={d.aligned}
                tabIndex={0}
                onKeyDown={(e) => (e.key === " " || e.key === "Enter") && set("aligned", !d.aligned)}
                onClick={() => set("aligned", !d.aligned)}
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 6,
                  border: `1.5px solid ${d.aligned ? "var(--accent)" : "var(--divider)"}`,
                  background: d.aligned ? "var(--accent)" : "var(--panel)",
                  color: "#fff",
                  fontSize: 12,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flex: "none",
                }}
              >
                {d.aligned ? "✓" : ""}
              </span>
              <span style={{ fontSize: 14 }}>This outcome meaningfully advances my {areas.find((a) => a.key === d.area)?.name} vision.</span>
            </label>
          </>
        ) : null}

        {error ? (
          <div role="alert" className="error-bar" style={{ marginTop: 18 }}>
            <span>{error}</span>
            <button type="button" className="link-quiet" style={{ color: "inherit", fontWeight: 600 }} onClick={submit}>
              Retry
            </button>
          </div>
        ) : null}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 26, flexWrap: "wrap" }}>
          {step > 0 ? (
            <button type="button" className="btn btn-ghost" onClick={() => setStep(step - 1)}>
              Back
            </button>
          ) : (
            <Link href="/sprints" className="btn btn-ghost" style={{ textDecoration: "none" }}>
              Cancel
            </Link>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {!canNext ? <span className="hint">{stepHint[step]}</span> : null}
            {step < 3 ? (
              <button type="button" className="btn btn-primary" disabled={!canNext} onClick={() => setStep(step + 1)}>
                Continue
              </button>
            ) : (
              <button type="button" className="btn btn-primary" disabled={!canNext || pending} onClick={submit}>
                {pending ? "Starting…" : "Start sprint"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
