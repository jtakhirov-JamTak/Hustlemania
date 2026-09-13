"use client";

import { CONFIDENCE_QUESTION, MANTRA_HINT } from "@/components/wizard/draft";
import { confidenceAdvice } from "@/lib/confidence";

/** Step 3: the confidence question with the band advice under the chips, the celebration, the mantra that explains itself. */
export function StepConfidence({
  confidence,
  celebration,
  mantra,
  onConfidence,
  onCelebration,
  onMantra,
}: {
  confidence: number | null;
  celebration: string;
  mantra: string;
  onConfidence: (n: number) => void;
  onCelebration: (v: string) => void;
  onMantra: (v: string) => void;
}) {
  const advice = confidenceAdvice(confidence);
  return (
    <>
      <div className="label-accent wz-question" id="confidence-label">
        {CONFIDENCE_QUESTION}
      </div>
      <div className="wz-note mt-6">1 to 10 · 6–8 is the ideal stretch</div>
      <div className="wz-chips" role="group" aria-labelledby="confidence-label">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            className={`chip wz-conf ${confidence === n ? "chip-on" : n >= 6 && n <= 8 ? "wz-conf-ideal" : ""}`}
            aria-label={`Confidence ${n}`}
            aria-pressed={confidence === n}
            onClick={() => onConfidence(n)}
          >
            {n}
          </button>
        ))}
      </div>
      {advice ? (
        <div className="v-advice" data-testid="confidence-advice" data-band={advice.band} aria-live="polite">
          {advice.text}
        </div>
      ) : null}
      <label className="label-accent block mt-22" htmlFor="celebration">
        Celebration when the goal lands
      </label>
      <input id="celebration" className="input mt-6" value={celebration} onChange={(e) => onCelebration(e.target.value)} />
      <label className="label-accent block mt-18" htmlFor="mantra">
        Mantra · shown on Today every day
      </label>
      <input id="mantra" className="input mt-6" value={mantra} onChange={(e) => onMantra(e.target.value)} placeholder="An inspirational phrase" aria-describedby="mantra-hint" />
      <div className="wz-note mt-6" id="mantra-hint" data-testid="mantra-hint">
        {MANTRA_HINT}
      </div>
    </>
  );
}
