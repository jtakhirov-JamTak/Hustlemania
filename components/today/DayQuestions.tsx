"use client";

import { onRadioArrowKeys } from "@/components/radioKeys";
import type { OfferedItems } from "@/lib/data";
import { setAnswer, setRecovered, tickedOf, toggleSituation, type Answer, type DayAnswers, type ItemKindKey, type Recovered } from "@/lib/dayAnswers";

/**
 * The F15 question set — "What happened on Day n?" — rendered from `lib/dayAnswers`.
 * Per impediment: showed up? → which situations → recovered? per ticked one. Per cue:
 * used? → which situations. The Highest and the focus cue are tagged, nothing more is
 * asked of them. One owner for the Today card's inline reviewing state and the backfill
 * modal (F8), so the two cannot drift.
 */
export function DayQuestions({
  offered,
  highestId,
  answers,
  onChange,
}: {
  offered: OfferedItems;
  highestId: string | null;
  answers: DayAnswers;
  onChange: (next: DayAnswers) => void;
}) {
  return (
    <>
      <div className="q-group" data-testid="occurrence-group">
        <GroupHead kicker="Occurrence" question="Which obstacles showed up?" id="occurrence-group-label" />
        {offered.impediments.length === 0 ? (
          <div className="q-empty">No impediments were in the sprint on this day.</div>
        ) : (
          offered.impediments.map((i) => {
            const a = answers.impediments[i.id];
            const ticked = tickedOf(a, i.situations);
            return (
              <ItemQuestion
                key={i.id}
                testId="impediment-item"
                id={i.id}
                name={i.name}
                tag={i.id === highestId ? "HIGHEST" : null}
                sub={i.proof_then ? `THEN ${i.proof_then}` : null}
                askLabel={`Showed up: ${i.name}`}
                answer={a?.answer ?? null}
                onAnswer={(answer) => onChange(setAnswer(answers, "impediments", i.id, answer))}
                situations={i.situations}
                ticked={ticked}
                onToggle={(sid) => onChange(toggleSituation(answers, "impediments", i.id, sid))}
                situationsTestId="impediment-situations"
              >
                {ticked.map((sid) => {
                  const s = i.situations.find((x) => x.id === sid);
                  const value = a?.situations[sid]?.recovered ?? null;
                  return s ? (
                    <div key={sid} className="q-recover" data-testid="situation-recovery" data-situation-id={sid}>
                      <span className="q-recover-label" id={`recover-${i.id}-${sid}`}>
                        {s.name} · Recovered?
                        {i.proof_recover ? <span className="q-sub"> when {i.proof_recover}</span> : null}
                      </span>
                      <div className="pill-row" role="radiogroup" aria-labelledby={`recover-${i.id}-${sid}`}>
                        {(["yes", "no"] as Recovered[]).map((key) => (
                          <button
                            key={key}
                            type="button"
                            role="radio"
                            className={`chip ${value === key ? "chip-on" : ""}`}
                            aria-checked={value === key}
                            onClick={() => onChange(setRecovered(answers, i.id, sid, value === key ? null : key))}
                            onKeyDown={onRadioArrowKeys}
                          >
                            {key === "yes" ? "Yes" : "No"}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null;
                })}
              </ItemQuestion>
            );
          })
        )}
      </div>

      <div className="q-group" data-testid="use-group">
        <GroupHead kicker="Use" question="Which cues did you use?" id="use-group-label" />
        {offered.cues.length === 0 ? (
          <div className="q-empty">No cues were in the sprint on this day.</div>
        ) : (
          offered.cues.map((c) => {
            const a = answers.cues[c.id];
            return (
              <ItemQuestion
                key={c.id}
                testId="cue-item"
                id={c.id}
                name={c.name}
                tag={c.is_focus ? "FOCUS" : null}
                sub={c.cue_when ? `WHEN ${c.cue_when}` : null}
                askLabel={`Used: ${c.name}`}
                answer={a?.answer ?? null}
                onAnswer={(answer) => onChange(setAnswer(answers, "cues", c.id, answer))}
                situations={c.situations}
                ticked={tickedOf(a, c.situations)}
                onToggle={(sid) => onChange(toggleSituation(answers, "cues", c.id, sid))}
                situationsTestId="cue-situations"
              />
            );
          })
        )}
      </div>
    </>
  );
}

function GroupHead({ kicker, question, id }: { kicker: string; question: string; id: string }) {
  return (
    <>
      <div className="q-kicker">{kicker}</div>
      <div className="q-head">
        <span id={id} className="q-label">
          {question}
        </span>
      </div>
    </>
  );
}

const ANSWERS: [Answer, string][] = [
  ["yes", "Yes"],
  ["no", "No"],
  ["unsure", "Unsure"],
];

/** One item's question: its name and tag, a Yes / No / Unsure radiogroup, and the situation ticks once it is a Yes. */
function ItemQuestion({
  testId,
  id,
  name,
  tag,
  sub,
  askLabel,
  answer,
  onAnswer,
  situations,
  ticked,
  onToggle,
  situationsTestId,
  children,
}: {
  testId: string;
  id: string;
  name: string;
  tag: string | null;
  sub: string | null;
  askLabel: string;
  answer: Answer | null;
  onAnswer: (answer: Answer) => void;
  situations: { id: string; name: string }[];
  ticked: string[];
  onToggle: (situationId: string) => void;
  situationsTestId: string;
  children?: React.ReactNode;
}) {
  const kind: ItemKindKey = testId === "cue-item" ? "cues" : "impediments";
  return (
    <div className="q-item" data-testid={testId} data-item-id={id} data-answer={answer ?? "untouched"} data-kind={kind}>
      <div className="q-item-head">
        <span className="q-item-name">{name}</span>
        {tag ? (
          <span className="option-tag" data-testid={tag === "FOCUS" ? "focus-tag" : "highest-tag"}>
            {tag}
          </span>
        ) : null}
      </div>
      {sub ? <div className="q-sub">{sub}</div> : null}
      <div className="pill-row" role="radiogroup" aria-label={askLabel}>
        {ANSWERS.map(([key, label]) => (
          <button key={key} type="button" role="radio" className={`chip ${answer === key ? "chip-on" : ""}`} aria-checked={answer === key} onClick={() => onAnswer(key)} onKeyDown={onRadioArrowKeys}>
            {label}
          </button>
        ))}
      </div>
      {answer === "yes" ? (
        <div className="q-situations" role="group" aria-label={`Situations: ${name}`} data-testid={situationsTestId}>
          <div className="q-sub">In which situations? Tick at least one.</div>
          <div className="pill-row">
            {situations.map((s) => {
              const on = ticked.includes(s.id);
              return (
                <button key={s.id} type="button" role="checkbox" className={`chip ${on ? "chip-on" : ""}`} aria-checked={on} data-situation-id={s.id} onClick={() => onToggle(s.id)}>
                  {s.name}
                </button>
              );
            })}
          </div>
          {children}
        </div>
      ) : null}
    </div>
  );
}
