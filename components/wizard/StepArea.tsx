"use client";

import Link from "next/link";
import { BLOCKED_LINE } from "@/components/wizard/draft";
import type { AreaKey } from "@/lib/areas";

export type AreaOption = { key: AreaKey; name: string; hasSprint: boolean };

/** Step 1: the vision (or the blocked line), the Area chips, the outcome. */
export function StepArea({
  vision,
  areas,
  area,
  outcome,
  onArea,
  onOutcome,
}: {
  vision: string | null;
  areas: AreaOption[];
  area: AreaKey | null;
  outcome: string;
  onArea: (key: AreaKey) => void;
  onOutcome: (v: string) => void;
}) {
  return (
    <>
      {vision ? (
        <div className="wz-vision" data-testid="wizard-vision">
          <span className="label-accent">The vision</span>
          <div className="wz-vision-text">{vision}</div>
        </div>
      ) : (
        <p className="wz-blocked" data-testid="wizard-blocked">
          {BLOCKED_LINE}{" "}
          <Link href="/vision" className="wz-strong">
            Write the vision
          </Link>
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
              className={`chip ${area === a.key ? "chip-on" : ""}`}
              aria-pressed={area === a.key}
              disabled={disabled}
              onClick={() => onArea(a.key)}
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
      <input id="outcome" className="input mt-6" value={outcome} onChange={(e) => onOutcome(e.target.value)} placeholder="Save $8,000 toward the emergency fund" />
    </>
  );
}
