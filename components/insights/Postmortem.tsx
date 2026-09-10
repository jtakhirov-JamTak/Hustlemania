"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { finishReview } from "@/app/(app)/actions/review";
import { ErrorBar } from "@/components/ErrorBar";
import { InsightCard } from "@/components/insights/InsightCard";
import { areaName, type AreaKey } from "@/lib/areas";
import { callAction } from "@/lib/callAction";
import { COMPLETION_LABEL, type Postmortem as PostmortemData, type ReviewDecision, type ReviewStats } from "@/lib/data";
import { formatIsoDate, stampDate } from "@/lib/dates";
import { coverageLine, cueRows, effectiveClosedDays, followThroughRows, impactRows, recoveryRows } from "@/lib/insightCards";
import { kitFrom } from "@/lib/kit";
import { formatAmount, formatNumber, type Measured } from "@/lib/format";

const VERDICTS = [
  { key: "worked", label: "Worked" },
  { key: "partly", label: "Partly worked" },
  { key: "didnt", label: "Didn't work" },
] as const;

const IMP_DECISIONS = [
  { key: "keep", label: "Keep" },
  { key: "highest", label: "Promote to highest" },
  { key: "drop", label: "Drop" },
];
const CUE_DECISIONS = [
  { key: "keep", label: "Keep" },
  { key: "test_more", label: "Keep · test more" },
  { key: "drop", label: "Drop" },
];

/**
 * The single-sprint postmortem (v8 README §Reviews). Editable until it is finished,
 * then read-only: PRD §11 says master edits must not disconnect historical evidence,
 * and a review that can be rewritten is not a record.
 *
 * Everything the reader decides lives in this component's state and is submitted once,
 * so a failed save keeps the lesson, the verdict and every row exactly as typed.
 */
export function Postmortem({ data, stats }: { data: PostmortemData; stats: ReviewStats }) {
  const { sprint, summary, items, review, verdictApplies } = data;
  const area = sprint.area as AreaKey;
  const measured: Measured = { measurement: sprint.measurement as Measured["measurement"], currency: sprint.currency, unit: sprint.unit };
  const editable = review === null;

  const [lesson, setLesson] = useState(review?.lesson ?? "");
  const [moved, setMoved] = useState<boolean | null>(review?.moved_vision ?? null);
  const [verdict, setVerdict] = useState<string | null>(review?.verdict ?? null);
  const [decisions, setDecisions] = useState<Record<string, string>>(() =>
    Object.fromEntries((review?.decisions ?? []).map((d) => [d.item_id, d.decision])),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // A member the user removed mid-sprint (and never added back) defaults to Drop, the
  // same default finish_review applies, so the next kit does not resurrect it (#22).
  const removedOf = (id: string) => [...items.impediments, ...items.cues].find((i) => i.id === id)?.removed === true;
  const decisionOf = (id: string) => decisions[id] ?? (removedOf(id) ? "drop" : "keep");
  const kit = useMemo(() => kitFrom(decisions, items), [decisions, items]);

  // Finishing swaps this card for its read-only copy in place; the pressed button is
  // gone, so the reviewed line takes focus and is announced (#8, SC 4.1.3).
  const reviewed = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!editable && document.activeElement === document.body) reviewed.current?.focus();
  }, [editable]);

  const blocked = !lesson.trim() || moved === null || (verdictApplies && !verdict);
  const hint = blocked
    ? verdictApplies
      ? "One lesson, the vision answer and a proof-point verdict are required."
      : "One lesson and the vision answer are required."
    : `Unlocks the next ${areaName(area)} sprint · the kit on the right becomes its default.`;

  function pick(id: string, kind: "cue" | "impediment", value: string) {
    if (!editable) return;
    setDecisions((prev) => {
      const next = { ...prev, [id]: value };
      // Only one impediment can be the highest; promoting a second demotes the first.
      if (kind === "impediment" && value === "highest") {
        for (const i of items.impediments) if (i.id !== id && next[i.id] === "highest") next[i.id] = "keep";
      }
      return next;
    });
  }

  function submit() {
    if (blocked || pending || !editable) return;
    setError(null);
    const rows: ReviewDecision[] = [
      ...items.impediments.map((i) => ({ kind: "impediment" as const, item_id: i.id, decision: decisionOf(i.id) })),
      ...items.cues.map((c) => ({ kind: "cue" as const, item_id: c.id, decision: decisionOf(c.id) })),
    ];
    start(async () => {
      const res = await callAction(() =>
        finishReview(sprint.id, {
          lesson,
          movedVision: moved,
          verdict: verdictApplies ? (verdict as "worked" | "partly" | "didnt") : null,
          decisions: rows,
        }),
      );
      if (res.error) setError(res.error);
    });
  }

  const highest = data.followThrough[0] ?? null;
  const highestItem = items.impediments.find((i) => i.is_highest) ?? null;
  const closed = summary?.closed_days ?? 0;
  // The coverage lines count only the days that could be logged, as the Across page does.
  const loggable = effectiveClosedDays(data.days);
  const impact = data.impact;
  const impactLogged = Math.max(0, ...impact.map((r) => r.logged_days));
  const impactUnsure = Math.max(0, ...impact.map((r) => r.unsure_days));
  const cueLogged = Math.max(0, ...data.cues.map((r) => r.logged_days));
  const cueUnsure = Math.max(0, ...data.cues.map((r) => r.unsure_days));
  const recovery = data.recovery[0] ?? null;

  return (
    <div className="pm" data-testid="postmortem">
      <div className="pm-main">
        <div className="pm-head">
          <h1 className="heading pm-title">{sprint.outcome}</h1>
          <span className="pm-kicker">
            Postmortem · {areaName(area)} · {formatIsoDate(sprint.start_date, { month: "short", day: "numeric" })} →{" "}
            {formatIsoDate(sprint.end_date, { month: "short", day: "numeric" })} · {COMPLETION_LABEL[sprint.status] ?? sprint.status}
          </span>
        </div>

        {summary ? (
          <section className="card pm-card pm-result" data-testid="result-card">
            <div className="pm-result-row">
              <span className="heading pm-big" data-state={summary.met ? "met" : "under"} data-testid="result-total">
                {formatNumber(measured, Number(summary.total))} <small>of {formatAmount(measured, Number(summary.goal))}</small>
              </span>
              <span className="pm-meta" data-testid="result-meta">
                {summary.pct}% · {summary.met ? "met" : "under"} · {summary.closed_days} days closed
                {summary.missed_days ? ` · ${summary.missed_days} not closed` : ""}
                {summary.cancelled_days ? ` · ${summary.cancelled_days} cancelled` : ""} · best streak {summary.best_streak}
              </span>
            </div>
            <div className="pm-strip" role="img" aria-label={`${summary.closed_days} of 14 days closed`}>
              {data.days.map((d) => (
                <span
                  key={d.day_index}
                  data-day={d.day_index}
                  data-state={d.cancelled ? "cancelled" : !d.closed ? "missed" : (d.actual ?? 0) >= d.target ? "met" : "under"}
                />
              ))}
            </div>
          </section>
        ) : null}

        <div className="pm-cards">
          <InsightCard
            testId="card-impact"
            tone="impediment"
            title="Impediment impact"
            coverage={coverageLine(impactLogged, loggable, impactUnsure)}
            question="Median daily attainment on days an obstacle was present vs absent."
            empty={impact.length === 0 ? "No impediments were logged on a closed day." : null}
            rows={impactRows(impact)}
          />
          <InsightCard
            testId="card-followthrough"
            tone="response"
            title="Response follow-through"
            coverage={highest ? `${highest.occurrences} occurrences · ${highest.answered} answered` : "0 occurrences"}
            question="When the highest impediment showed up, did the WHEN → THEN response run?"
            empty={verdictApplies ? null : "The highest impediment never showed up on a logged day."}
            rows={followThroughRows(data.followThrough)}
          />
          <InsightCard
            testId="card-recovery"
            tone="response"
            title="Response recovery"
            coverage={recovery ? `${recovery.answered} answered · ${recovery.with_response} with the response` : "0 responses"}
            question="Was the recovery criterion met, with the response vs without it?"
            empty={verdictApplies ? null : "No recovery question was ever asked."}
            rows={recoveryRows(data.recovery)}
          />
          <InsightCard
            testId="card-cues"
            tone="cue"
            title="Cue usefulness"
            coverage={coverageLine(cueLogged, loggable, cueUnsure)}
            question="Median daily attainment on days a cue was used vs not used."
            empty={data.cues.length === 0 ? "No cues were logged on a closed day." : null}
            rows={cueRows(data.cues)}
          />
        </div>

        <section className="card pm-card" data-testid="proof-card">
          <div className="pm-proof-head">
            <h2 className="t-kicker">Proof point on the highest impediment</h2>
            <span className="pm-proof-name">{highestItem?.name ?? "not set"}</span>
          </div>
          <div className="pm-rule">
            <strong>WHEN</strong> {highestItem?.proof_when ?? "not set"} → <strong>THEN</strong> {highestItem?.proof_then ?? "not set"}
          </div>
          <div className="pm-rule-sub">
            <strong>RECOVERED WHEN</strong> {highestItem?.proof_recover ?? "not set"}
          </div>
          <div className="pm-obs" data-testid="proof-observation">
            {verdictApplies && highest
              ? `Showed up on ${highest.occurrences} logged day${highest.occurrences === 1 ? "" : "s"} · response ran ${highest.ran} of ${
                  highest.answered
                } answered${recovery ? ` · recovered ${recovery.with_recovered + recovery.without_recovered} of ${recovery.answered} answered` : ""}.`
              : "It never showed up on a logged day. No verdict is asked."}
          </div>
          {verdictApplies ? (
            <div className="pm-chips" role="group" aria-label="Proof-point verdict">
              {VERDICTS.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  className={`chip ${verdict === v.key ? "chip-on" : ""}`}
                  aria-pressed={verdict === v.key}
                  disabled={!editable}
                  onClick={() => setVerdict(v.key)}
                >
                  {v.label}
                </button>
              ))}
            </div>
          ) : null}
        </section>

        <section className="card pm-card" data-testid="lesson-card">
          <h2 className="t-kicker">One key lesson</h2>
          {editable ? (
            <textarea
              className="input pm-lesson"
              rows={3}
              aria-label="Key lesson"
              placeholder="The one thing this sprint proved."
              value={lesson}
              onChange={(e) => setLesson(e.target.value)}
            />
          ) : (
            <div className="pm-lesson-quote">“{lesson}”</div>
          )}
          <div className="pm-moved" role="group" aria-label="Did it move the vision?">
            <span>Did it move the vision?</span>
            {[
              { value: true, label: "Yes, it advanced it" },
              { value: false, label: "No, it did not" },
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                className={`chip ${moved === o.value ? "chip-on" : ""}`}
                aria-pressed={moved === o.value}
                disabled={!editable}
                onClick={() => setMoved(o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </section>

        <section className="card pm-card" data-testid="carry-card">
          <h2 className="t-kicker">{editable ? `Carry forward · decide for the next ${areaName(area)} sprint` : "Carried forward"}</h2>
          <div className="mt-6">
            {items.impediments.map((i) => {
              const row = impact.find((r) => r.item_id === i.id);
              return (
                <DecisionRow
                  key={i.id}
                  name={i.name}
                  sub={`impediment · ${i.removed ? "removed mid-sprint · " : ""}${row && row.present_days ? `present ${row.present_days} day${row.present_days === 1 ? "" : "s"}` : "never showed up"}`}
                  options={IMP_DECISIONS}
                  value={decisionOf(i.id)}
                  editable={editable}
                  onPick={(v) => pick(i.id, "impediment", v)}
                />
              );
            })}
            {items.cues.map((c) => {
              const row = data.cues.find((r) => r.item_id === c.id);
              return (
                <DecisionRow
                  key={c.id}
                  name={c.name}
                  sub={`cue · ${c.removed ? "removed mid-sprint · " : ""}${row && row.used_days ? `used ${row.used_days} day${row.used_days === 1 ? "" : "s"}` : "never used"}`}
                  options={CUE_DECISIONS}
                  value={decisionOf(c.id)}
                  editable={editable}
                  onPick={(v) => pick(c.id, "cue", v)}
                />
              );
            })}
          </div>
          {error ? (
            <ErrorBar className="mt-16" action={{ label: "Retry", onClick: submit }}>
              {error}
            </ErrorBar>
          ) : null}
          {editable ? (
            <div className="pm-finish">
              <button type="button" className="btn btn-primary" aria-disabled={blocked || pending} aria-describedby="pm-hint" onClick={submit} data-testid="finish-review">
                {pending ? "Finishing…" : "Finish review"}
              </button>
              <span className="pm-hint" id="pm-hint" data-accent={blocked ? "true" : "false"} aria-live="polite">
                {hint}
              </span>
            </div>
          ) : (
            <div className="pm-reviewed focus-quiet" data-testid="reviewed-line" ref={reviewed} tabIndex={-1}>
              {/* `completed_at` is a UTC timestamp, so it converts at the edge like every
                  other stamp (stampDate). Slicing the ISO string would print the UTC
                  calendar date, which is a day off for most of the evening. */}
              Reviewed {stampDate(review.completed_at)}
            </div>
          )}
        </section>

        <details className="card pm-card pm-days" data-testid="day-by-day">
          <summary>Day by day · {closed} closed days</summary>
          <div className="mt-10">
            {data.days.map((d) => (
              <div key={d.day_index} className="pm-day">
                <div className="pm-day-label">
                  Day {d.day_index}
                  <br />
                  {formatIsoDate(d.date, { weekday: "short", month: "short", day: "numeric" })}
                </div>
                <div>
                  {d.cancelled ? (
                    <span className="pm-day-label">Cancelled · not missed</span>
                  ) : !d.closed ? (
                    <span className="pm-day-actual" data-state="missed">
                      Missed <span className="pm-day-label">· target {formatNumber(measured, d.target)}</span>
                    </span>
                  ) : (
                    <span className="pm-day-actual" data-state={(d.actual ?? 0) >= d.target ? "met" : "under"}>
                      {formatNumber(measured, d.actual ?? 0)} <span className="pm-day-label">of {formatNumber(measured, d.target)}</span>
                    </span>
                  )}
                  {d.tasks.length ? (
                    <ul className="pm-day-tasks">
                      {d.tasks.map((t, i) => (
                        <li key={`${d.day_index}-${i}`} data-done={t.done ? "true" : "false"}>
                          {t.text}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </details>
      </div>

      <aside className="pm-rail" data-testid="kit-card" aria-label="Next sprint kit">
        <div className="kit">
          <div className="kit-kicker">Next {areaName(area)} sprint starts with</div>
          <div className="kit-label">Highest impediment</div>
          <div className="kit-highest">{kit.highest ?? "None chosen"}</div>
          <div className="kit-note">{kit.highest ? "Carries its WHEN → THEN unless you change it" : "Pick one when the sprint is created"}</div>
          <div className="kit-label">Also watching</div>
          <div className="kit-list">{kit.watching.length ? kit.watching.join("\n") : "—"}</div>
          <div className="kit-label">Cues</div>
          <div className="kit-list">{kit.cues.length ? kit.cues.join("\n") : "—"}</div>
          <div className="kit-lesson">
            {lesson.trim() ? `Lesson pinned to Day 1: “${lesson.trim()}”` : "The lesson you write here is pinned to Day 1 of the next sprint."}
          </div>
        </div>
        <div className="r-card" data-testid="across-card">
          <h2 className="t-kicker">
            Across {stats.sprints} finished sprint{stats.sprints === 1 ? "" : "s"}
          </h2>
          <div className="across">
            <div>
              <div className="heading across-n">{stats.daysOnTargetPct === null ? "—" : `${stats.daysOnTargetPct}%`}</div>
              <div className="across-l">days on target</div>
            </div>
            <div>
              <div className="heading across-n">
                {stats.goalsMet} of {stats.sprints}
              </div>
              <div className="across-l">goals met</div>
            </div>
            <div>
              <div className="heading across-n">{stats.lessons}</div>
              <div className="across-l">lessons kept</div>
            </div>
          </div>
          <div className="across-note">
            Reviews are the only place a lesson is written. Each one shows up on Day 1 of the next sprint in that area.
          </div>
          <div className="across-note">
            A comparison needs at least three days on each side, and a rate at least three answered. Everything here is an association between what
            you logged and what you produced, never a cause.
          </div>
        </div>
      </aside>
    </div>
  );
}

function DecisionRow({
  name,
  sub,
  options,
  value,
  editable,
  onPick,
}: {
  name: string;
  sub: string;
  options: { key: string; label: string }[];
  value: string;
  editable: boolean;
  onPick: (value: string) => void;
}) {
  return (
    <div className="pm-dec" data-testid="carry-row">
      <span>
        <span className="pm-dec-name">{name}</span> <span className="pm-dec-sub">{sub}</span>
      </span>
      <span className="pm-dec-opts" role="group" aria-label={`Carry forward ${name}`}>
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            className={`chip chip-mini ${o.key === "drop" ? "chip-drop" : ""} ${value === o.key ? "chip-on" : ""}`}
            aria-pressed={value === o.key}
            disabled={!editable}
            onClick={() => onPick(o.key)}
          >
            {o.label}
          </button>
        ))}
      </span>
    </div>
  );
}
