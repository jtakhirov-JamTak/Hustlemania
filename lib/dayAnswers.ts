import type { CloseDayInput } from "@/app/(app)/actions/day";
import type { OfferedItems } from "@/lib/data";

/**
 * The F15 question set's state — "What happened on Day n?" — kept out of the component
 * so it is unit-testable without React. One owner for the Today card's inline reviewing
 * state and the backfill modal (F8), so the two cannot drift.
 *
 * Per impediment: did it show up (yes / no / unsure); when yes, which of its situations,
 * at least one; per ticked situation, did you recover (yes / no, or left blank). Per cue:
 * did you use it; when yes, which situations it applied to. An item never touched sends
 * nothing, and the DB stores it as unanswered.
 */
export type Answer = "yes" | "no" | "unsure";
export type Recovered = "yes" | "no";
export type ItemKindKey = "impediments" | "cues";

export type ItemAnswer = {
  answer: Answer;
  /** Ticked situations by id; `recovered` is null while the radio is untouched (cues never set it). */
  situations: Record<string, { recovered: Recovered | null }>;
};

export type DayAnswers = { impediments: Record<string, ItemAnswer>; cues: Record<string, ItemAnswer> };

export const EMPTY_ANSWERS: DayAnswers = { impediments: {}, cues: {} };

/** Sets an item's answer; leaving `yes` drops its ticks, so a No never carries a situation. */
export function setAnswer(answers: DayAnswers, kind: ItemKindKey, id: string, answer: Answer): DayAnswers {
  const current = answers[kind][id];
  const situations = answer === "yes" ? (current?.answer === "yes" ? current.situations : {}) : {};
  return { ...answers, [kind]: { ...answers[kind], [id]: { answer, situations } } };
}

/** Ticks or unticks one situation under an item answered yes; a no-op otherwise. */
export function toggleSituation(answers: DayAnswers, kind: ItemKindKey, id: string, situationId: string): DayAnswers {
  const current = answers[kind][id];
  if (!current || current.answer !== "yes") return answers;
  const situations = { ...current.situations };
  if (situationId in situations) delete situations[situationId];
  else situations[situationId] = { recovered: null };
  return { ...answers, [kind]: { ...answers[kind], [id]: { ...current, situations } } };
}

/** The recovery answer for one ticked situation of an impediment; null clears it. */
export function setRecovered(answers: DayAnswers, id: string, situationId: string, recovered: Recovered | null): DayAnswers {
  const current = answers.impediments[id];
  if (!current || !(situationId in current.situations)) return answers;
  return { ...answers, impediments: { ...answers.impediments, [id]: { ...current, situations: { ...current.situations, [situationId]: { recovered } } } } };
}

/** The ticked situation ids of an item, in the order the day offers them. */
export function tickedOf(item: ItemAnswer | undefined, offeredSituations: { id: string }[]): string[] {
  if (!item || item.answer !== "yes") return [];
  return offeredSituations.filter((s) => s.id in item.situations).map((s) => s.id);
}

/**
 * The accent hint beside the primary while an answer is incomplete; null when the day
 * can close. The only incompleteness is a yes with nothing ticked: recovery may stay
 * blank (F15, the user's call), and an untouched item is a truthful unanswered.
 */
export function answersHint(answers: DayAnswers, offered: OfferedItems): string | null {
  for (const i of offered.impediments) {
    const a = answers.impediments[i.id];
    if (a?.answer === "yes" && tickedOf(a, i.situations).length === 0) return `Tick at least one situation for ${i.name}.`;
  }
  for (const c of offered.cues) {
    const a = answers.cues[c.id];
    if (a?.answer === "yes" && tickedOf(a, c.situations).length === 0) return `Tick at least one situation for ${c.name}.`;
  }
  return null;
}

/** What closeDayAction takes, from the answers as given: touched items only, situations only under a yes. */
export function closeInput(answers: DayAnswers, offered: OfferedItems, actual: number, notes: string): CloseDayInput {
  return {
    actual,
    notes,
    impediments: offered.impediments.flatMap((i) => {
      const a = answers.impediments[i.id];
      if (!a) return [];
      return [{ id: i.id, answer: a.answer, situations: tickedOf(a, i.situations).map((situationId) => ({ situationId, recovered: a.situations[situationId]?.recovered ?? null })) }];
    }),
    cues: offered.cues.flatMap((c) => {
      const a = answers.cues[c.id];
      if (!a) return [];
      return [{ id: c.id, answer: a.answer, situations: tickedOf(a, c.situations) }];
    }),
  };
}
