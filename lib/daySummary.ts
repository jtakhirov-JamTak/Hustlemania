/**
 * The words a closed day gets from its F7 / F15 answers (v8 README "Day summary line"),
 * and the one-name tail a closed timeline row shows. Both read the observation rows and
 * their situation rows; a day closed before 0010 has no rows and gets nothing.
 */

export type SituationObservation = { id: string; name: string; occurred: boolean; recovered: string | null };
export type CueSituationObservation = { id: string; name: string; applied: boolean };
export type ImpedimentObservation = { id: string; name: string; occurred: string; was_highest: boolean; situations: SituationObservation[] };
export type CueObservation = { id: string; name: string; used: string; was_focus: boolean; situations: CueSituationObservation[] };

export type DayObservations = { impediments: ImpedimentObservation[]; cues: CueObservation[] };

export const NO_OBSERVATIONS: DayObservations = { impediments: [], cues: [] };

/** The impediments that showed up, highest first, then in the order the rows came (rank). */
export function occurredNames(obs: DayObservations): string[] {
  return occurredRows(obs).map((i) => i.name);
}

function occurredRows(obs: DayObservations): ImpedimentObservation[] {
  return obs.impediments.filter((i) => i.occurred === "yes").sort((a, b) => Number(b.was_highest) - Number(a.was_highest));
}

function groupPhrase(rows: { name: string; answer: string }[], words: { some: string; none: string; unsure: string }): string | null {
  if (rows.length === 0 || rows.every((r) => r.answer === "unanswered")) return null;
  const yes = rows.filter((r) => r.answer === "yes").map((r) => r.name);
  if (yes.length > 0) return `${words.some}${yes.join(", ")}`;
  if (rows.every((r) => r.answer === "unsure")) return words.unsure;
  return words.none;
}

/** `{name} (a, b; recovered 1 of 2)` — an occurred impediment with its ticked situations and the recoveries it answered. */
function impedimentPhrase(i: ImpedimentObservation): string {
  const ticked = i.situations.filter((s) => s.occurred);
  if (ticked.length === 0) return i.name;
  const answered = ticked.filter((s) => s.recovered === "yes" || s.recovered === "no");
  const recovered = answered.filter((s) => s.recovered === "yes").length;
  const tail = answered.length ? `; recovered ${recovered} of ${answered.length}` : "";
  return `${i.name} (${ticked.map((s) => s.name).join(", ")}${tail})`;
}

/** `{name} (a, b)` — a used cue with the situations it applied to. */
function cuePhrase(c: CueObservation): string {
  const applied = c.situations.filter((s) => s.applied);
  return applied.length ? `${c.name} (${applied.map((s) => s.name).join(", ")})` : c.name;
}

/**
 * `Showed up: a (x; recovered 1 of 1), b (y)` | `No obstacles` | `Obstacles: unsure` ·
 * `Cues used: a (x)` | `No cue used` | `Cues: unsure`. A group nobody answered is left
 * out; an empty string means the day carries no observations at all.
 */
export function daySummaryLine(obs: DayObservations): string {
  const parts: string[] = [];
  const occurred = occurredRows(obs);
  const obstacles = groupPhrase(
    obs.impediments.map((i) => ({ name: i.name, answer: i.occurred })),
    { some: "Showed up: ", none: "No obstacles", unsure: "Obstacles: unsure" },
  );
  if (obstacles) parts.push(occurred.length > 0 ? `Showed up: ${occurred.map(impedimentPhrase).join(", ")}` : obstacles);
  const used = obs.cues.filter((c) => c.used === "yes");
  const cues = groupPhrase(
    obs.cues.map((c) => ({ name: c.name, answer: c.used })),
    { some: "Cues used: ", none: "No cue used", unsure: "Cues: unsure" },
  );
  if (cues) parts.push(used.length > 0 ? `Cues used: ${used.map(cuePhrase).join(", ")}` : cues);
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
