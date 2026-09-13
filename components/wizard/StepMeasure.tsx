"use client";

import { useRef } from "react";
import type { Draft } from "@/components/wizard/draft";
import { formatIsoDate } from "@/lib/dates";
import type { Measurement } from "@/lib/format";
import { addDays } from "@/lib/sprintDay";

/** Step 2: the measurement, the goal, the currency or unit, usage of funds, the start day. */
export function StepMeasure({ d, set, today, tz }: { d: Draft; set: <K extends keyof Draft>(k: K, v: Draft[K]) => void; today: string | null; tz: string }) {
  const addUsage = useRef<HTMLButtonElement>(null);
  return (
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
              <button
                type="button"
                className="btn btn-ghost"
                aria-label={`Remove usage ${i + 1}`}
                onClick={() => {
                  set("usage", d.usage.filter((_, j) => j !== i));
                  addUsage.current?.focus();
                }}
              >
                ×
              </button>
            </div>
          ))}
          <button ref={addUsage} type="button" className="btn btn-ghost mt-8" onClick={() => set("usage", [...d.usage, { label: "", amount: "" }])}>
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
            Today{today ? ` · ${formatIsoDate(today, { weekday: "short", month: "short", day: "numeric" })}` : ""}
          </button>
          <button type="button" className={`chip ${d.startsTomorrow ? "chip-on" : ""}`} aria-pressed={d.startsTomorrow} onClick={() => set("startsTomorrow", true)}>
            Tomorrow{today ? ` · ${formatIsoDate(addDays(today, 1), { weekday: "short", month: "short", day: "numeric" })}` : ""}
          </button>
        </div>
        <div className="wz-note mt-8">Days turn at midnight in {tz.replace("_", " ")}; the zone locks with the sprint.</div>
      </div>
    </>
  );
}
