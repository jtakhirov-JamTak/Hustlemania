"use client";

import { ErrorBar } from "@/components/ErrorBar";
import { useEffect, useRef, useState, useTransition } from "react";
import { removeSprintItem, saveProofPoint, setFocusCue, setHighestImpediment } from "@/app/(app)/actions/library";
import { completeSprint, endSprintEarly } from "@/app/(app)/actions/review";
import { saveMantra } from "@/app/(app)/actions/sprint";
import { CaptureBox, focusMissingPart, type CapturePhase } from "@/components/CaptureBox";
import { ItemPicker } from "@/components/ItemPicker";
import { Menu } from "@/components/Menu";
import { Modal } from "@/components/Modal";
import { AddItemPicker, candidatesFor } from "@/components/today/AddItemPicker";
import { TwoTap } from "@/components/TwoTap";
import { callAction } from "@/lib/callAction";
import { missingPart, partText, type Parts } from "@/lib/capture";
import { appliesTo, proofComplete, proofSummary, type ItemKind, type LibraryItem, type SituationItem, type SprintItems } from "@/lib/data";
import { formatAmount, type Measured } from "@/lib/format";
import { celebrationState } from "@/lib/sprintDay";

const PROOF_HINT = "THEN and the recovery criterion are both required.";

/** F17: one situations library; both cards offer the same list to their inline creates. */
export type Situations = SituationItem[];

type UsageRow = { label: string; amount: number };

/**
 * The journal's right rail (F8, v8 README): mantra + streak, the highest impediment with
 * the other impediments under it, the cues, the celebration, the usage of funds. F10 adds
 * the pinned lesson, Complete sprint once the goal is reached, and End sprint early. F18:
 * the Highest and Cues cards each carry one Edit menu; the card bodies only read.
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
  /** F15 / F17: the live situations, for the inline creates. */
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
      <HighestCard sprintId={sprintId} impediments={items.impediments} library={library} situations={situations} locked={locked} />
      <CuesCard sprintId={sprintId} cues={items.cues} library={library} situations={situations} locked={locked} />
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

type MemberRow = { id: string; name: string; tag: string | null; removable: boolean; note: string | null };

/**
 * F18: "Add or remove" — the sprint's members of one kind in a dialog: a tag on the
 * Highest or the Focus, Remove on every row that may go, and one Add button that swaps
 * this dialog for the picker (never two dialogs at once).
 */
function MembersModal({
  testId,
  title,
  rows,
  max,
  addLabel,
  onAdd,
  onRemove,
  error,
  pending,
  onClose,
}: {
  testId: string;
  title: string;
  rows: MemberRow[];
  max: number;
  addLabel: string;
  onAdd: () => void;
  onRemove: (id: string) => void;
  error: string | null;
  pending: boolean;
  onClose: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  return (
    <Modal labelledBy="members-title" onDismiss={onClose} initialFocus={heading} maxWidth={520}>
      <div className="dialog-head dialog-head-rule">
        <h2 id="members-title" className="card-title focus-quiet" ref={heading} tabIndex={-1}>
          {title}
        </h2>
        <button type="button" className="link-quiet dialog-x" aria-label="Close the dialog" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="dialog-body dialog-body-rule" data-testid={testId}>
        <div className="r-count">
          {rows.length} of {max}
        </div>
        {error ? <ErrorBar className="mt-10">{error}</ErrorBar> : null}
        {rows.map((r) => (
          <div key={r.id} className="r-member" data-testid="member-row" data-item-id={r.id}>
            <span className="r-member-name">
              {r.name}
              {r.tag ? <span className="option-tag">{r.tag}</span> : null}
            </span>
            {r.removable ? (
              <button
                type="button"
                className="j-link j-link-muted"
                disabled={pending}
                // The pressed Remove unmounts with its row; the dialog's heading takes focus (SC 2.4.3).
                onClick={() => {
                  heading.current?.focus();
                  onRemove(r.id);
                }}
                aria-label={`Remove ${r.name}`}
              >
                Remove
              </button>
            ) : r.note ? (
              <span className="r-member-note">{r.note}</span>
            ) : null}
          </div>
        ))}
        {rows.length === 0 ? <div className="t-prompt mt-6">Nothing in this sprint yet.</div> : null}
      </div>
      <div className="dialog-foot dialog-foot-rule">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Close
        </button>
        {rows.length < max ? (
          <button type="button" className="btn btn-primary" disabled={pending} onClick={onAdd}>
            {addLabel}
          </button>
        ) : (
          <span className="hint">The sprint holds its {max} already.</span>
        )}
      </div>
    </Modal>
  );
}

/**
 * The highest impediment: its WHEN (the name), then THEN / RECOVERED WHEN / APPLIES TO
 * each on its own row (U1, F15) and the read-only "Also watching" list. One Edit menu
 * (F18): Change the Highest (the picker over the sprint's impediments, with the response
 * inputs when the pick is incomplete), Fix the response (the one-box capture, inline),
 * Add or remove (the members dialog).
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
  const [fixing, setFixing] = useState(false);
  const [members, setMembers] = useState(false);
  const [adding, setAdding] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [then, setThen] = useState("");
  const [recover, setRecover] = useState("");
  const [parts, setParts] = useState<Parts>({ then: "", recovered_when: "" });
  const [phase, setPhase] = useState<CapturePhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const filled = Boolean(then.trim() && recover.trim());

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

  function openFix() {
    setParts({ then: highest?.proof_then ?? "", recovered_when: highest?.proof_recover ?? "" });
    setPhase(highest?.proof_then ? "manual" : "idle");
    setError(null);
    setFixing(true);
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

  const fixHint = phase === "parsing" ? "Reading your words…" : (missingPart("response", parts)?.hint ?? null);

  function saveFix() {
    if (!highest || pending) return;
    if (fixHint) {
      focusMissingPart("fix", "response", parts);
      return;
    }
    start(async () => {
      const res = await callAction(() => saveProofPoint(highest.id, { then: partText(parts, "then"), recover: partText(parts, "recovered_when") }));
      if (res.error) {
        setError(res.error);
        return;
      }
      setFixing(false);
    });
  }

  function remove(id: string) {
    setListError(null);
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
          <Menu
            id="highest-menu"
            testId="highest-edit"
            items={[
              { label: "Change the Highest", onSelect: openChange },
              { label: "Fix the response", onSelect: openFix },
              { label: "Add or remove", onSelect: () => { setListError(null); setMembers(true); } },
            ]}
          />
        ) : null}
      </div>
      {highest ? (
        <>
          <div className="r-name" data-testid="highest-name">
            <span className="r-part">WHEN</span> {highest.name}
          </div>
          {!fixing ? (
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
                    not set — add it under Edit → Fix the response
                  </span>
                )}
              </div>
              <div className="r-proof">
                <span className="r-part">APPLIES TO</span> <span data-testid="highest-situations">{appliesTo(highest) ?? "no situation yet"}</span>
              </div>
            </>
          ) : (
            <form
              className="r-fix"
              data-testid="fix-response"
              onSubmit={(e) => {
                e.preventDefault();
                saveFix();
              }}
            >
              <CaptureBox kind="response" idPrefix="fix" mode={highest.proof_then ? "fields" : "capture"} parts={parts} onParts={setParts} onPhase={setPhase} disabled={pending} compact />
              {error ? <ErrorBar className="mt-12">{error}</ErrorBar> : null}
              <div className="j-plan-actions">
                <span className="hint" id="fix-hint" aria-live="polite">
                  {fixHint ?? ""}
                </span>
                <button type="button" className="btn btn-ghost" onClick={() => setFixing(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" aria-disabled={pending || Boolean(fixHint)} aria-describedby={fixHint ? "fix-hint" : undefined}>
                  {pending ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          )}
        </>
      ) : (
        <div className="r-text">No highest impediment is set for this sprint.</div>
      )}

      <div className="r-rule" data-testid="also-watching">
        <div className="r-head">
          <span className="t-prompt">Also watching</span>
          <span className="r-count">{impediments.length} of 3</span>
        </div>
        {listError && !members ? (
          <ErrorBar className="mt-6" action={{ label: "Dismiss", onClick: () => setListError(null) }}>{listError}</ErrorBar>
        ) : null}
        {others.length === 0 ? <div className="t-prompt mt-6">Only the highest impediment is in this sprint.</div> : null}
        {others.map((i) => (
          <div key={i.id} className="r-item" data-testid="sprint-item" data-item-id={i.id}>
            <span>{i.name}</span>
          </div>
        ))}
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
      {members ? (
        <MembersModal
          testId="highest-members"
          title="Impediments in this sprint"
          rows={impediments.map((i) => ({ id: i.id, name: i.name, tag: i.is_highest ? "HIGHEST" : null, removable: !i.is_highest, note: i.is_highest ? "change the Highest to remove it" : null }))}
          max={3}
          addLabel="Add impediment"
          onAdd={() => {
            setMembers(false);
            setAdding(true);
          }}
          onRemove={remove}
          error={listError}
          pending={pending}
          onClose={() => setMembers(false)}
        />
      ) : null}
      {adding ? (
        <AddItemPicker kind="impediment" sprintId={sprintId} candidates={candidatesFor("impediment", library, impediments)} situations={situations} onClose={() => setAdding(false)} />
      ) : null}
    </section>
  );
}

/**
 * The sprint's cues: name + FOCUS tag, `WHEN {cue_when}`, `APPLIES TO`. One Edit menu
 * (F18): Change the focus (a single picker, "Set as focus"), Add or remove (the members
 * dialog; the focus cannot go while another cue remains).
 */
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
  const [changing, setChanging] = useState(false);
  const [members, setMembers] = useState(false);
  const [adding, setAdding] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const focus = cues.find((c) => c.is_focus) ?? null;

  function act(op: () => Promise<{ error?: string }>, then?: () => void) {
    setError(null);
    start(async () => {
      const res = await callAction(op);
      if (res.error) {
        setError(res.error);
        return;
      }
      then?.();
    });
  }

  return (
    <section className="r-card" data-testid="sprint-items">
      <div className="r-head">
        <h2 className="t-kicker">Execution cues</h2>
        <span className="r-head-side">
          <span className="r-count">{cues.length} of 3</span>
          {!locked ? (
            <Menu
              id="cues-menu"
              testId="cues-edit"
              items={[
                { label: "Change the focus", disabled: cues.length === 0, onSelect: () => { setPick(focus?.id ?? null); setError(null); setChanging(true); } },
                { label: "Add or remove", onSelect: () => { setError(null); setMembers(true); } },
              ]}
            />
          ) : null}
        </span>
      </div>
      {error && !changing && !members ? (
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

      {changing ? (
        <ItemPicker
          title="Change the focus cue"
          blurb="Its use is asked first at every Day Close."
          options={cues.map((c) => ({ id: c.id, label: c.name, sub: c.cue_when ? `WHEN ${c.cue_when}` : null, tag: c.is_focus ? "Current" : null }))}
          single
          selected={pick ? [pick] : []}
          onToggle={setPick}
          hint={!pick ? "Pick one cue." : null}
          error={error}
          doneLabel="Set as focus"
          pending={pending}
          onDone={() => {
            if (pick) act(() => setFocusCue(sprintId, pick), () => setChanging(false));
          }}
          onCancel={() => setChanging(false)}
        />
      ) : null}
      {members ? (
        <MembersModal
          testId="cue-members"
          title="Execution cues in this sprint"
          // F15: a sprint may hold no cue, so the last one (focus or not) can go; the focus stays while others remain.
          rows={cues.map((c) => ({ id: c.id, name: c.name, tag: c.is_focus ? "FOCUS" : null, removable: !c.is_focus || cues.length === 1, note: c.is_focus ? "change the focus to remove it" : null }))}
          max={3}
          addLabel="Add cue"
          onAdd={() => {
            setMembers(false);
            setAdding(true);
          }}
          onRemove={(id) => act(() => removeSprintItem(sprintId, "cue" as ItemKind, id))}
          error={error}
          pending={pending}
          onClose={() => setMembers(false)}
        />
      ) : null}
      {adding ? <AddItemPicker kind="cue" sprintId={sprintId} candidates={candidatesFor("cue", library, cues)} situations={situations} onClose={() => setAdding(false)} /> : null}
    </section>
  );
}
