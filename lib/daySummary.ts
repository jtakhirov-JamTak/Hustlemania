/**
 * The words a closed day gets from its F7 answers (v8 README "Day summary line"), and
 * the one-name tail a closed timeline row shows. Both read the observation rows and the
 * day row's three Highest answers; a day closed before 0010 has no rows and gets nothing.
 */

export type ImpedimentObservation = { id: string; name: string; occurred: string; was_highest: boolean };
export type CueObservation = { id: string; name: string; used: string; was_focus: boolean };

export type DayObservations = { impediments: ImpedimentObservation[]; cues: CueObservation[] };

export const NO_OBSERVATIONS: DayObservations = { impediments: [], cues: [] };

type HighestAnswers = { response: string | null; recovered: string | null; impact: string | null };

const RESPONSE: Record<string, string> = {
  yes: "Response ran",
  no: "Response didn't run",
  partially: "Response partially ran",
  unsure: "Response unsure",
};
const RECOVERED: Record<string, string> = { yes: "recovered", no: "didn't recover", unsure: "recovery unsure" };
const IMPACT: Record<string, string> = { nothing: "Cost: nothing", some: "Cost: some", a_lot: "Cost: a lot", unsure: "Cost: unsure" };

/** The impediments that showed up, highest first, then in the order the rows came (rank). */
export function occurredNames(obs: DayObservations): string[] {
  return obs.impediments
    .filter((i) => i.occurred === "yes")
    .sort((a, b) => Number(b.was_highest) - Number(a.was_highest))
    .map((i) => i.name);
}

function groupPhrase(rows: { name: string; answer: string }[], words: { some: string; none: string; unsure: string }): string | null {
  if (rows.length === 0 || rows.every((r) => r.answer === "unanswered")) return null;
  const yes = rows.filter((r) => r.answer === "yes").map((r) => r.name);
  if (yes.length > 0) return `${words.some}${yes.join(", ")}`;
  if (rows.every((r) => r.answer === "unsure")) return words.unsure;
  return words.none;
}

/**
 * `Showed up: a, b` | `No obstacles` | `Obstacles: unsure` · `Response ran` + `recovered` ·
 * `Cost: some` · `Cues used: a` | `No cue used` | `Cues: unsure`. A group nobody answered
 * is left out; an empty string means the day carries no observations at all.
 */
export function daySummaryLine(day: HighestAnswers, obs: DayObservations): string {
  const parts: string[] = [];
  const occurred = occurredNames(obs);
  const obstacles = groupPhrase(
    obs.impediments.map((i) => ({ name: i.name, answer: i.occurred })),
    { some: "Showed up: ", none: "No obstacles", unsure: "Obstacles: unsure" },
  );
  if (obstacles) parts.push(occurred.length > 0 ? `Showed up: ${occurred.join(", ")}` : obstacles);
  if (day.response) {
    const recovered = day.recovered ? RECOVERED[day.recovered] : null;
    parts.push(recovered ? `${RESPONSE[day.response]} · ${recovered}` : RESPONSE[day.response]);
  }
  if (day.impact) parts.push(IMPACT[day.impact]);
  const cues = groupPhrase(
    obs.cues.map((c) => ({ name: c.name, answer: c.used })),
    { some: "Cues used: ", none: "No cue used", unsure: "Cues: unsure" },
  );
  if (cues) parts.push(cues);
  return parts.join(" · ");
}

/** ` · showed up: {name}` for a closed timeline row, or an empty string. */
export function showedUpTail(obs: DayObservations): string {
  const [first] = occurredNames(obs);
  return first ? ` · showed up: ${first}` : "";
}

/**
 * What "Set up tomorrow" offers to prune: items answered No or left untouched today.
 * The highest and the focus cue are never offered (the DB refuses to remove them).
 */
export function quietItems(obs: DayObservations): { impediments: { id: string; name: string }[]; cues: { id: string; name: string }[] } {
  const quiet = (answer: string) => answer === "no" || answer === "unanswered";
  const pick = ({ id, name }: { id: string; name: string }) => ({ id, name });
  return {
    impediments: obs.impediments.filter((i) => !i.was_highest && quiet(i.occurred)).map(pick),
    cues: obs.cues.filter((c) => !c.was_focus && quiet(c.used)).map(pick),
  };
}
