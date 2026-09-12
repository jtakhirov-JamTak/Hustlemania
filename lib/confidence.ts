/**
 * F17: the band advice under a confidence pick (the sprint wizard's 1–10 and the
 * Vision goal's 0–10): below 6 may be unrealistic, 6–8 is the sweet spot, above 8 is
 * too easy. Copy is the owner's (DECISIONS 2026-09-12 F17).
 */
export type ConfidenceBand = "low" | "sweet" | "high";

export const CONFIDENCE_ADVICE: Record<ConfidenceBand, string> = {
  low: "This may be unrealistic. Consider a smaller goal or more support.",
  sweet: "Sweet spot: you are pushing yourself and it is still attainable.",
  high: "This looks easy. Stretch the goal.",
};

export function confidenceBand(n: number): ConfidenceBand {
  return n < 6 ? "low" : n > 8 ? "high" : "sweet";
}

/** The advice for a pick, or null while nothing is picked. */
export function confidenceAdvice(n: number | null | undefined): { band: ConfidenceBand; text: string } | null {
  if (n === null || n === undefined || Number.isNaN(n)) return null;
  const band = confidenceBand(n);
  return { band, text: CONFIDENCE_ADVICE[band] };
}
