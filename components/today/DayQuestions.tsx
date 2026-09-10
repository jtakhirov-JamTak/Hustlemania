"use client";

import type { Answer, CloseDayInput, ImpactAnswer, ResponseAnswer } from "@/app/(app)/actions/day";
import { onRadioArrowKeys } from "@/components/radioKeys";
import type { OfferedItems } from "@/lib/data";

/**
 * The F7 question set — "What happened on Day n?" — and the state behind it. One owner
 * for the Today card's inline reviewing state and the backfill modal (F8), so the two
 * cannot drift. Pill semantics: tapping an item marks it yes and the rest of the group
 * no; None marks every item no; Unsure marks every item unsure; a group never touched
 * sends nothing, and the DB stores every offered item as unanswered.
 */
export type Group = { mode: "untouched" | "picked" | "none" | "unsure"; picked: string[] };
export const UNTOUCHED: Group = { mode: "untouched", picked: [] };

export type DayAnswers = {
  cues: Group;
  imps: Group;
  response: ResponseAnswer | null;
  recovered: Answer | null;
  impact: ImpactAnswer | null;
};

export const EMPTY_ANSWERS: DayAnswers = { cues: UNTOUCHED, imps: UNTOUCHED, response: null, recovered: null, impact: null };

export type OfferedHighest = OfferedItems["impediments"][number];

function answersOf(group: Group, ids: string[]): { id: string; answer: Answer }[] {
  switch (group.mode) {
    case "untouched":
      return [];
    case "none":
      return ids.map((id) => ({ id, answer: "no" }));
    case "unsure":
      return ids.map((id) => ({ id, answer: "unsure" }));
    case "picked":
      return ids.map((id) => ({ id, answer: group.picked.includes(id) ? "yes" : "no" }));
  }
}

function pick(group: Group, id: string): Group {
  if (group.mode !== "picked") return { mode: "picked", picked: [id] };
  const picked = group.picked.includes(id) ? group.picked.filter((x) => x !== id) : [...group.picked, id];
  return picked.length === 0 ? UNTOUCHED : { mode: "picked", picked };
}

/** The highest impediment as this day offers it; its occurrence opens the response questions. */
export function highestOf(offered: OfferedItems, highestId: string | null): OfferedHighest | null {
  return offered.impediments.find((i) => i.id === highestId) ?? null;
}

export function highestOccurred(answers: DayAnswers, highest: OfferedHighest | null): boolean {
  return highest !== null && answers.imps.mode === "picked" && answers.imps.picked.includes(highest.id);
}

/** The accent hint beside the primary while the response questions wait; null when the answers are complete. */
export function answersHint(answers: DayAnswers, highest: OfferedHighest | null): string | null {
  if (!highestOccurred(answers, highest)) return null;
  if (!answers.response) return "Did the response run?";
  if (!answers.recovered) return "Did you recover?";
  return null;
}

/** A change to the obstacles group; the three Highest answers apply only while the highest is picked. */
export function withImpediments(answers: DayAnswers, next: Group, highest: OfferedHighest | null): DayAnswers {
  const stillOccurs = highest !== null && next.mode === "picked" && next.picked.includes(highest.id);
  return stillOccurs ? { ...answers, imps: next } : { ...answers, imps: next, response: null, recovered: null, impact: null };
}

/** What closeDayAction takes, from the answers as given. */
export function closeInput(answers: DayAnswers, offered: OfferedItems, highest: OfferedHighest | null, actual: number, notes: string): CloseDayInput {
  const occurred = highestOccurred(answers, highest);
  return {
    actual,
    notes,
    impediments: answersOf(answers.imps, offered.impediments.map((i) => i.id)),
    cues: answersOf(answers.cues, offered.cues.map((c) => c.id)),
    response: occurred ? answers.response : null,
    recovered: occurred ? answers.recovered : null,
    impact: occurred ? answers.impact : null,
    highestId: highest?.id ?? null,
  };
}

export function DayQuestions({
  offered,
  highest,
  answers,
  onChange,
}: {
  offered: OfferedItems;
  highest: OfferedHighest | null;
  answers: DayAnswers;
  onChange: (next: DayAnswers) => void;
}) {
  const occurred = highestOccurred(answers, highest);
  return (
    <>
      <PickGroup
        testId="use-group"
        kicker="Use"
        question="Which cues did you use?"
        items={offered.cues.map((c) => ({ id: c.id, label: c.name, tag: c.is_focus ? "FOCUS" : null }))}
        emptyLine="No cues were in the sprint on this day."
        group={answers.cues}
        onChange={(cues) => onChange({ ...answers, cues })}
      />

      <PickGroup
        testId="occurrence-group"
        kicker="Occurrence"
        question="Which obstacles showed up?"
        sub={highest ? `Highest: ${highest.name}` : null}
        items={offered.impediments.map((i) => ({ id: i.id, label: i.name, tag: null }))}
        emptyLine="No impediments were in the sprint on this day."
        group={answers.imps}
        onChange={(imps) => onChange(withImpediments(answers, imps, highest))}
      />

      {occurred && highest ? (
        <>
          <AnswerGroup
            testId="response-group"
            kicker={`Response · ${highest.name}`}
            question="Did you run the response?"
            sub={`${highest.proof_then ? `THEN ${highest.proof_then} · ` : ""}judge the first time it showed up today`}
            options={[
              ["yes", "Yes"],
              ["no", "No"],
              ["partially", "Partially"],
              ["unsure", "Unsure"],
            ]}
            value={answers.response}
            onChange={(response) => onChange({ ...answers, response })}
          />
          <AnswerGroup
            testId="recovery-group"
            kicker="Recovery"
            question="Did you recover?"
            sub={highest.proof_recover ? `Recovered when ${highest.proof_recover}` : "No recovery criterion recorded for this day"}
            options={[
              ["yes", "Yes"],
              ["no", "No"],
              ["unsure", "Unsure"],
            ]}
            value={answers.recovered}
            onChange={(recovered) => onChange({ ...answers, recovered })}
          />
          <AnswerGroup
            testId="impact-group"
            kicker={`Impact · ${highest.name}`}
            question="How much did it cost today?"
            sub="Your read, not the number"
            options={[
              ["nothing", "Nothing"],
              ["some", "Some"],
              ["a_lot", "A lot"],
              ["unsure", "Unsure"],
            ]}
            value={answers.impact}
            onChange={(impact) => onChange({ ...answers, impact })}
          />
        </>
      ) : null}
    </>
  );
}

function GroupHead({ kicker, question, sub, id }: { kicker: string; question: string; sub?: string | null; id: string }) {
  return (
    <>
      <div className="q-kicker">{kicker}</div>
      <div className="q-head">
        <span id={id} className="q-label">
          {question}
        </span>
        {sub ? <span className="q-sub">{sub}</span> : null}
      </div>
    </>
  );
}

/** A multi-pick question: item pills plus None and Unsure. */
function PickGroup({
  testId,
  kicker,
  question,
  sub,
  items,
  emptyLine,
  group,
  onChange,
}: {
  testId: string;
  kicker: string;
  question: string;
  sub?: string | null;
  items: { id: string; label: string; tag: string | null }[];
  emptyLine: string;
  group: Group;
  onChange: (next: Group) => void;
}) {
  const labelId = `${testId}-label`;
  return (
    <div className="q-group" data-testid={testId} data-mode={group.mode}>
      <GroupHead kicker={kicker} question={question} sub={sub} id={labelId} />
      {items.length === 0 ? (
        <div className="q-empty">{emptyLine}</div>
      ) : (
        <div className="pill-row" role="group" aria-labelledby={labelId}>
          {items.map((item) => {
            const on = group.mode === "picked" && group.picked.includes(item.id);
            return (
              <button key={item.id} type="button" className={`chip ${on ? "chip-on" : ""}`} aria-pressed={on} onClick={() => onChange(pick(group, item.id))}>
                {item.label}
                {item.tag ? (
                  <span className="option-tag" data-testid="focus-tag">
                    {item.tag}
                  </span>
                ) : null}
              </button>
            );
          })}
          <button type="button" className={`chip ${group.mode === "none" ? "chip-on" : ""}`} aria-pressed={group.mode === "none"} onClick={() => onChange({ mode: "none", picked: [] })} data-testid={`${testId.replace("-group", "")}-none`}>
            None
          </button>
          <button type="button" className={`chip ${group.mode === "unsure" ? "chip-on" : ""}`} aria-pressed={group.mode === "unsure"} onClick={() => onChange({ mode: "unsure", picked: [] })}>
            Unsure
          </button>
        </div>
      )}
    </div>
  );
}

/** A single-answer question on a fixed scale. */
function AnswerGroup<T extends string>({
  testId,
  kicker,
  question,
  sub,
  options,
  value,
  onChange,
}: {
  testId: string;
  kicker: string;
  question: string;
  sub?: string | null;
  options: [T, string][];
  value: T | null;
  onChange: (next: T) => void;
}) {
  const labelId = `${testId}-label`;
  return (
    <div className="q-group" data-testid={testId}>
      <GroupHead kicker={kicker} question={question} sub={sub} id={labelId} />
      <div className="pill-row" role="radiogroup" aria-labelledby={labelId}>
        {options.map(([key, label]) => (
          <button key={key} type="button" role="radio" className={`chip ${value === key ? "chip-on" : ""}`} aria-checked={value === key} onClick={() => onChange(key)} onKeyDown={onRadioArrowKeys}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
