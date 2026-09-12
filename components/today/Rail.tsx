"use client";

import { ErrorBar } from "@/components/ErrorBar";
import { useEffect, useRef, useState, useTransition } from "react";
import { removeSprintItem, saveProofPoint, setFocusCue, setHighestImpediment } from "@/app/(app)/actions/library";
import { completeSprint, endSprintEarly } from "@/app/(app)/actions/review";
import { saveMantra } from "@/app/(app)/actions/sprint";
import { ItemPicker } from "@/components/ItemPicker";
import { ProofInputs } from "@/components/ProofInputs";
import { AddItemPicker, candidatesFor } from "@/components/today/AddItemPicker";
import { TwoTap } from "@/components/TwoTap";
import { callAction } from "@/lib/callAction";
import { appliesTo, proofComplete, proofSummary, type ItemKind, type LibraryItem, type SituationItem, type SprintItems } from "@/lib/data";
import { formatAmount, type Measured } from "@/lib/format";
import { celebrationState } from "@/lib/sprintDay";

const PROOF_HINT = "THEN and the recovery criterion are both required.";

export type Situations = { cues: SituationItem[]; impediments: SituationItem[] };

type UsageRow = { label: string; amount: number };

/**
 * The journal's right rail (F8, v8 README): mantra + streak, the highest impediment with
 * the other impediments under it, the cues, the celebration, the usage of funds. F10 adds
 * the pinned lesson, Complete sprint once the goal is reached, and End sprint early.
 */
export function Rail({
  sprintId,
  mantra,
  streakText,
  items,
  library,
  situations,
  locked,
  celebration,
  measured,
  usage,
  goalReached,
  cumulative,
  goal,
  lastLesson,
  areaLabel,
  openDays,
}: {
  sprintId: string;
  mantra: string;
  streakText: string;
  items: SprintItems;
  library: { cues: LibraryItem[]; impediments: LibraryItem[] };
  /** F15: the live situations per kind, for the inline creates. */
  situations: Situations;
  /** The sprint window has passed: the rail reads, nothing edits. */
  locked: boolean;
  celebration: string;
  measured: Measured;
  usage: UsageRow[];
  /** The closed days total the goal: Complete sprint is available (PRD §10). */
  goalReached: boolean;
  cumulative: number;
  goal: number;
  /** F10: this Area's last postmortem lesson, shown on Day 1 only. */
  lastLesson: string | null;
  areaLabel: string;
  /** What a closure cancels: today's entry if still open, and earlier days never backfilled. */
  openDays: { today: boolean; earlier: number };
}) {
  return (
    <aside className="rail" data-testid="rail" aria-label="Sprint">
      <MantraCard sprintId={sprintId} initial={mantra} streakText={streakText} />
      {lastLesson ? (
        <section className="r-card" data-testid="last-lesson">
          <h2 className="t-kicker">Lesson from the last {areaLabel} sprint</h2>
          <div className="r-lesson">“{lastLesson}”</div>
        </section>
      ) : null}
      <HighestCard sprintId={sprintId} impediments={items.impediments} library={library} situations={situations.impediments} locked={locked} />
      <CuesCard sprintId={sprintId} cues={items.cues} library={library} situations={situations.cues} locked={locked} />
      {goalReached && !locked ? <CompleteCard sprintId={sprintId} measured={measured} cumulative={cumulative} goal={goal} openDays={openDays} /> : null}
      <Celebration text={celebration} cumulative={cumulative} goal={goal} />
      {measured.measurement === "money" && usage.length > 0 ? (
        <div className="r-card" data-testid="usage-card">
          <h2 className="t-kicker">Usage of funds</h2>
          <div className="r-text">{usage.map((u) => `${formatAmount(measured, u.amount).replace(` ${measured.currency ?? ""}`, "")} ${u.label}`).join(" · ")}</div>
        </div>
      ) : null}
      {!locked ? <EndEarly sprintId={sprintId} openDays={openDays} /> : null}
    </aside>
  );
}

/**
 * What ending the sprint now gives up (full review 2026-09-09, #20): `close_sprint_rows`
 * cancels every open day from today on, and `close_day` then refuses the sprint, so an
 * unclosed today and every earlier day not yet backfilled are lost for good.
 */
export function closureWarning(openDays: { today: boolean; earlier: number }): string {
  const parts = [
    openDays.today ? "today's entry is still open and will be cancelled" : "",
    openDays.earlier > 0 ? `${openDays.earlier} earlier day${openDays.earlier === 1 ? "" : "s"} can no longer be added` : "",
  ].filter(Boolean);
  return parts.length ? ` — ${parts.join("; ")}` : "";
}

/**
 * "Celebration becomes subtly more visible as success approaches and prominent on
 * successful completion" (PRD §10): 600 weight and the share reached from 80%, green
 * with the `Goal reached ·` prefix once the closed days cover the goal.
 */
function Celebration({ text, cumulative, goal }: { text: string; cumulative: number; goal: number }) {
  const share = goal > 0 ? cumulative / goal : 0;
  const state = celebrationState(cumulative, goal);
  return (
    <div className="r-card" data-testid="celebration-card">
      <h2 className="t-kicker">Celebration</h2>
      <div className={state === "met" ? "r-celebration-met" : state === "near" ? "r-celebration-near" : "r-text"} data-state={state} data-testid="celebration-text">
        {state === "met" ? "Goal reached · " : state === "near" ? `${Math.round(share * 100)}% there · ` : ""}
        {text}
      </div>
    </div>
  );
}

/**
 * Reaching the goal unlocks Complete sprint; it never fires on its own (PRD §10). The
 * remaining days are cancelled, not missed, and the copy says so before the press.
 */
function CompleteCard({
  sprintId,
  measured,
  cumulative,
  goal,
  openDays,
}: {
  sprintId: string;
  measured: Measured;
  cumulative: number;
  goal: number;
  openDays: { today: boolean; earlier: number };
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <section className="r-goal" data-testid="complete-sprint">
      <div className="r-goal-line">
        Goal reached · {formatAmount(measured, cumulative)} of {formatAmount(measured, goal)}. Remaining days are cancelled, not missed
        {closureWarning(openDays)}.
      </div>
      {error ? <ErrorBar className="mt-10">{error}</ErrorBar> : null}
      <button
        type="button"
        className="btn btn-primary mt-10"
        aria-disabled={pending}
        onClick={() => {
          if (pending) return;
          setError(null);
          start(async () => {
            const res = await callAction(() => completeSprint(sprintId));
            if (res.error) setError(res.error);
          });
        }}
      >
        {pending ? "Completing…" : "Complete sprint"}
      </button>
    </section>
  );
}

/** End sprint early: destructive, so it is the two-tap (reconciliation B16). */
function EndEarly({ sprintId, openDays }: { sprintId: string; openDays: { today: boolean; earlier: number } }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="r-foot">
      {error ? <ErrorBar className="mb-6">{error}</ErrorBar> : null}
      <TwoTap
        className="r-foot-link"
        testId="end-sprint-early"
        label="End sprint early"
        armedLabel={`Tap again to end this sprint now${closureWarning(openDays)}`}
        disabled={pending}
        onFire={() => {
          setError(null);
          start(async () => {
            const res = await callAction(() => endSprintEarly(sprintId));
            if (res.error) setError(res.error);
          });
        }}
      />
    </div>
  );
}

function MantraCard({ sprintId, initial, streakText }: { sprintId: string; initial: string; streakText: string }) {
  const [mantra, setMantra] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const editButton = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  useEffect(() => {
    if (wasEditing.current && !editing) editButton.current?.focus();
    wasEditing.current = editing;
  }, [editing]);
  const blocked = pending || !draft.trim();

  return (
    <section className="r-card" data-testid="mantra-card">
      {editing ? (
        <form
          className="r-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (blocked) return;
            start(async () => {
              const res = await callAction(() => saveMantra(sprintId, draft));
              if (res.error) {
                setError(res.error);
                return;
              }
              setMantra(draft.trim());
              setError(null);
              setEditing(false);
            });
          }}
        >
          <label htmlFor="mantra" className="label-accent">
            Mantra
          </label>
          <input id="mantra" className="input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="An inspirational phrase" />
          <div className="j-plan-actions">
            <span className="hint" id="mantra-hint" aria-live="polite">
              {draft.trim() ? "" : "A mantra is required."}
            </span>
            <button type="button" className="btn btn-ghost" onClick={() => { setDraft(mantra); setEditing(false); setError(null); }}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" aria-disabled={blocked} aria-describedby={draft.trim() ? undefined : "mantra-hint"}>
              Save
            </button>
          </div>
          {error ? <ErrorBar>{error}</ErrorBar> : null}
        </form>
      ) : (
        <>
          <button ref={editButton} type="button" className="r-mantra" onClick={() => setEditing(true)} title="Edit mantra" data-testid="mantra">
            “{mantra}”
          </button>
          <div className="r-streak" data-testid="streak-label">
            {streakText}
          </div>
        </>
      )}
    </section>
  );
}

/**
 * The highest impediment: its WHEN (the name), then THEN / RECOVERED WHEN / APPLIES TO
 * each on its own row (U1, F15), Change (picker over the sprint's impediments, with the
 * response inputs when the pick is incomplete), Edit response, then "Also watching" —
 * the other impediments, with Remove and Add.
 */
function HighestCard({
  sprintId,
  impediments,
  library,
  situations,
  locked,
}: {
  sprintId: string;
  impediments: SprintItems["impediments"];
  library: { cues: LibraryItem[]; impediments: LibraryItem[] };
  situations: SituationItem[];
  locked: boolean;
}) {
  const highest = impediments.find((i) => i.is_highest) ?? null;
  const others = impediments.filter((i) => !i.is_highest);
  const [changing, setChanging] = useState(false);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [then, setThen] = useState("");
  const [recover, setRecover] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const editButton = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  useEffect(() => {
    if (wasEditing.current && !editing) editButton.current?.focus();
    wasEditing.current = editing;
  }, [editing]);
  const filled = Boolean(then.trim() && recover.trim());
  const proofHint = filled ? null : PROOF_HINT;

  const picked = impediments.find((i) => i.id === pick) ?? null;
  const needsProof = Boolean(picked && !proofComplete(picked));
  const pickHint = !pick ? "Pick one impediment." : needsProof && !filled ? PROOF_HINT : null;

  /** The picker's inputs start from what the pick already has, so only the missing part needs typing. */
  function prefill(i: { proof_then: string | null; proof_recover: string | null } | null) {
    setThen(i?.proof_then ?? "");
    setRecover(i?.proof_recover ?? "");
  }

  function openChange() {
    setPick(highest?.id ?? null);
    prefill(highest);
    setError(null);
    setChanging(true);
  }

  function openEdit() {
    prefill(highest);
    setError(null);
    setEditing(true);
  }

  function confirmChange() {
    if (!pick || pickHint) return;
    start(async () => {
      const res = await callAction(() => setHighestImpediment(sprintId, pick, needsProof ? { then, recover } : undefined));
      if (res.error) {
        setError(res.error);
        return;
      }
      setChanging(false);
    });
  }

  function saveProof() {
    if (!highest || proofHint || pending) return;
    start(async () => {
      const res = await callAction(() => saveProofPoint(highest.id, { then, recover }));
      if (res.error) {
        setError(res.error);
        return;
      }
      setEditing(false);
    });
  }

  function remove(id: string) {
    setListError(null);
    // The pressed Remove unmounts with its row; the list's heading takes focus (SC 2.4.3).
    document.getElementById("also-watching")?.focus();
    start(async () => {
      const res = await callAction(() => removeSprintItem(sprintId, "impediment", id));
      if (res.error) setListError(res.error);
    });
  }

  return (
    <section className="r-card" data-testid="highest-impediment">
      <div className="r-head">
        <h2 className="t-kicker">Highest impediment</h2>
        {highest && !locked ? (
          <button type="button" className="j-link" onClick={openChange}>
            Change
          </button>
        ) : null}
      </div>
      {highest ? (
        <>
          <div className="r-name" data-testid="highest-name">
            <span className="r-part">WHEN</span> {highest.name}
          </div>
          {!editing ? (
            <>
              <div className="r-proof">
                <span className="r-part">THEN</span> <span data-testid="proof-then">{highest.proof_then}</span>
              </div>
              <div className="r-proof-recover">
                <span className="r-part">RECOVERED WHEN</span>{" "}
                {highest.proof_recover ? (
                  <span data-testid="proof-recover">{highest.proof_recover}</span>
                ) : (
                  <span className="r-missing" data-testid="proof-recover-missing">
                    not set — add it under Edit response
                  </span>
                )}
              </div>
              <div className="r-proof">
                <span className="r-part">APPLIES TO</span> <span data-testid="highest-situations">{appliesTo(highest) ?? "no situation yet"}</span>
              </div>
              {!locked ? (
                <button ref={editButton} type="button" className="j-link mt-10" onClick={openEdit}>
                  Edit response
                </button>
              ) : null}
            </>
          ) : (
            <form
              className="r-rule"
              onSubmit={(e) => {
                e.preventDefault();
                saveProof();
              }}
            >
              <ProofInputs idPrefix="hi" then={then} recover={recover} onThen={setThen} onRecover={setRecover} placeholderThen="" placeholderRecover="" />
              {error ? <ErrorBar className="mt-12">{error}</ErrorBar> : null}
              <div className="j-plan-actions">
                <span className="hint" id="hi-hint" aria-live="polite">
                  {proofHint ?? ""}
                </span>
                <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" aria-disabled={pending || Boolean(proofHint)} aria-describedby={proofHint ? "hi-hint" : undefined}>
                  {pending ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          )}
        </>
      ) : (
        <div className="r-text">No highest impediment is set for this sprint.</div>
      )}

      <div className="r-rule focus-quiet" data-testid="also-watching" id="also-watching" tabIndex={-1}>
        <div className="r-head">
          <span className="t-prompt">Also watching</span>
          <span className="r-count">{impediments.length} of 3</span>
        </div>
        {listError ? (
          <ErrorBar className="mt-6" action={{ label: "Dismiss", onClick: () => setListError(null) }}>{listError}</ErrorBar>
        ) : null}
        {others.length === 0 ? <div className="t-prompt mt-6">Only the highest impediment is in this sprint.</div> : null}
        {others.map((i) => (
          <div key={i.id} className="r-item" data-testid="sprint-item" data-item-id={i.id}>
            <span>{i.name}</span>
            {!locked ? (
              <button type="button" className="j-link j-link-muted" disabled={pending} onClick={() => remove(i.id)} aria-label={`Remove ${i.name}`}>
                Remove
              </button>
            ) : null}
          </div>
        ))}
        {!locked && impediments.length < 3 ? (
          <button type="button" className="j-link mt-6" onClick={() => setAdding(true)}>
            Add impediment
          </button>
        ) : null}
      </div>

      {changing ? (
        <ItemPicker
          title="Change the highest impediment"
          blurb="The obstacle most likely to cause this sprint to fail. Its WHEN must carry a THEN and a recovery criterion."
          options={impediments.map((i) => ({ id: i.id, label: i.name, sub: proofSummary(i) ?? "No response yet", tag: i.is_highest ? "Current" : null }))}
          single
          selected={pick ? [pick] : []}
          onToggle={(id) => {
            setPick(id);
            prefill(impediments.find((i) => i.id === id) ?? null);
          }}
          proof={needsProof ? { then, recover, onThen: setThen, onRecover: setRecover } : null}
          hint={pickHint}
          error={error}
          doneLabel="Set as highest"
          pending={pending}
          onDone={confirmChange}
          onCancel={() => setChanging(false)}
        />
      ) : null}
      {adding ? (
        <AddItemPicker kind="impediment" sprintId={sprintId} candidates={candidatesFor("impediment", library, impediments)} situations={situations} onClose={() => setAdding(false)} />
      ) : null}
    </section>
  );
}

/** The sprint's cues: name + FOCUS tag or "Set as focus", `WHEN {cue_when}`, `APPLIES TO`, Remove (never on the focus while others remain), Add cue. */
function CuesCard({
  sprintId,
  cues,
  library,
  situations,
  locked,
}: {
  sprintId: string;
  cues: SprintItems["cues"];
  library: { cues: LibraryItem[]; impediments: LibraryItem[] };
  situations: SituationItem[];
  locked: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function act(op: () => Promise<{ error?: string }>) {
    setError(null);
    start(async () => {
      const res = await callAction(op);
      if (res.error) setError(res.error);
    });
  }

  return (
    <section className="r-card" data-testid="sprint-items">
      <div className="r-head">
        <h2 className="t-kicker">Execution cues</h2>
        <span className="r-count">{cues.length} of 3</span>
      </div>
      {error ? (
        <ErrorBar className="mt-10" action={{ label: "Dismiss", onClick: () => setError(null) }}>{error}</ErrorBar>
      ) : null}
      {cues.map((c) => (
        <div key={c.id} className="r-cue" data-testid="sprint-item" data-item-id={c.id}>
          <div className="r-cue-head">
            <span className="r-cue-name">
              {c.name}
              {c.is_focus ? (
                <span className="option-tag" data-testid="focus-tag">
                  FOCUS
                </span>
              ) : null}
            </span>
            {!locked && (!c.is_focus || cues.length === 1) ? (
              <span className="j-row-actions">
                {!c.is_focus ? (
                  <button type="button" className="j-link" disabled={pending} onClick={() => act(() => setFocusCue(sprintId, c.id))} aria-label={`Set as focus: ${c.name}`}>
                    Set as focus
                  </button>
                ) : null}
                {/* F15: a sprint may hold no cue, so the last one (focus or not) can go. */}
                <button type="button" className="j-link j-link-muted" disabled={pending} onClick={() => act(() => removeSprintItem(sprintId, "cue" as ItemKind, c.id))} aria-label={`Remove ${c.name}`}>
                  Remove
                </button>
              </span>
            ) : null}
          </div>
          <div className="r-cue-when">
            {c.cue_when ? (
              <>
                <span className="r-part">WHEN</span> {c.cue_when}
              </>
            ) : (
              <span className="r-missing">add the moment this should fire on the Cues page</span>
            )}
          </div>
          <div className="r-cue-when" data-testid="cue-situations-line">
            <span className="r-part">APPLIES TO</span> {appliesTo(c) ?? "no situation yet"}
          </div>
        </div>
      ))}
      {cues.length === 0 ? <div className="t-prompt mt-6">No execution cue in this sprint — optional.</div> : null}
      {!locked && cues.length < 3 ? (
        <button type="button" className="j-link mt-12" onClick={() => setAdding(true)}>
          Add cue
        </button>
      ) : null}
      {adding ? <AddItemPicker kind="cue" sprintId={sprintId} candidates={candidatesFor("cue", library, cues)} situations={situations} onClose={() => setAdding(false)} /> : null}
    </section>
  );
}
