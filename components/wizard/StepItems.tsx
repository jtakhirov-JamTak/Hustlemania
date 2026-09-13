"use client";

import { useRef, useState } from "react";
import { createItem } from "@/app/(app)/actions/library";
import { CaptureBox, focusMissingPart, type CapturePhase } from "@/components/CaptureBox";
import { OptionRow } from "@/components/OptionRow";
import { ProofInputs } from "@/components/ProofInputs";
import { SituationPicker, type SituationOption } from "@/components/SituationPicker";
import { callAction } from "@/lib/callAction";
import { emptyParts, missingPart, partText, type Parts } from "@/lib/capture";
import { appliesTo, cueSummary, joinBlocker, proofComplete, proofSummary, type ItemKind, type LibraryItem } from "@/lib/data";

/** Creates situations in the one library; returns their ids in the names' order, or an error line. */
export type CreateSituations = (names: string[]) => Promise<{ ids: string[] } | { error: string }>;

/**
 * Step 5: the existing impediments and cues by WHEN, the Highest with its response
 * inputs, the Focus, and a collapsed "Create new" one-box capture under each list. A row
 * the sprint could not carry (no situation; an impediment with no response) is
 * `aria-disabled` and says which library page finishes it. A created item joins the
 * sprint at once, as the inline creates always have.
 */
export function StepItems({
  kitNote,
  impOptions,
  cueOptions,
  impedimentIds,
  highestId,
  proofThen,
  proofRecover,
  highestNeedsProof,
  cueIds,
  focusId,
  sits,
  onToggleImpediment,
  onPickHighest,
  onProofThen,
  onProofRecover,
  onToggleCue,
  onFocus,
  onCreated,
  onCreateSituations,
}: {
  kitNote: string | null;
  impOptions: LibraryItem[];
  cueOptions: LibraryItem[];
  impedimentIds: string[];
  highestId: string | null;
  proofThen: string;
  proofRecover: string;
  highestNeedsProof: boolean;
  cueIds: string[];
  focusId: string | null;
  sits: SituationOption[];
  onToggleImpediment: (id: string) => void;
  onPickHighest: (i: LibraryItem) => void;
  onProofThen: (v: string) => void;
  onProofRecover: (v: string) => void;
  onToggleCue: (id: string) => void;
  onFocus: (id: string) => void;
  onCreated: (item: LibraryItem) => void;
  onCreateSituations: CreateSituations;
}) {
  const impBlocker = (i: LibraryItem) => (joinBlocker(i) === "situation" ? "No situation yet — finish it on the Impediments page" : joinBlocker(i) === "response" ? "No THEN and RECOVERED WHEN yet — finish it on the Impediments page" : null);
  const cueBlocker = (c: LibraryItem) => (joinBlocker(c) === "situation" ? "No situation yet — finish it on the Cues page" : null);

  return (
    <>
      {kitNote ? (
        <div className="wz-kit" data-testid="wizard-kit">
          {kitNote}
        </div>
      ) : null}

      <div data-testid="wizard-impediments">
        <div className="wz-between">
          <span className="wz-group-title">
            Impediments <span className={`wz-count ${impedimentIds.length > 0 ? "wz-count-on" : ""}`}>{impedimentIds.length} of 3</span>
          </span>
          <span className="wz-note">What is most likely to get in the way?</span>
        </div>
        <div role="group" aria-label="Impediments" className="mt-6">
          {impOptions.map((i) => {
            const on = impedimentIds.includes(i.id);
            const blocker = on ? null : impBlocker(i);
            return (
              <OptionRow
                key={i.id}
                on={on}
                ariaDisabled={blocker !== null}
                disabled={!on && impedimentIds.length >= 3}
                label={`WHEN ${i.name}`}
                sub={blocker ?? ([proofSummary(i), appliesTo(i) && `applies to: ${appliesTo(i)}`].filter(Boolean).join(" · ") || null)}
                tag={i.scope === "global" ? "Global" : null}
                onPick={() => onToggleImpediment(i.id)}
              />
            );
          })}
          {impOptions.length === 0 ? <div className="wz-note mt-6">No impediment in the library for this area yet — create one below.</div> : null}
        </div>
        <CreateNew kind="impediment" sits={sits} onCreated={onCreated} onCreateSituations={onCreateSituations} />
      </div>

      {impedimentIds.length > 0 ? (
        <div className="wz-highest" data-testid="wizard-highest">
          <div className="wz-group-title">Highest impediment</div>
          <div className="wz-blurb">The obstacle most likely to cause this sprint to fail. Its WHEN must carry a THEN and a recovery criterion.</div>
          <div role="radiogroup" aria-label="Highest impediment">
            {impOptions
              .filter((i) => impedimentIds.includes(i.id))
              .map((i) => (
                <OptionRow
                  key={i.id}
                  single
                  on={highestId === i.id}
                  label={i.name}
                  sub={proofComplete(i) ? null : proofSummary(i) ? "Response incomplete — complete it below" : "No response yet — write one below"}
                  onPick={() => onPickHighest(i)}
                />
              ))}
          </div>
          {highestNeedsProof ? (
            <ProofInputs
              idPrefix="proof"
              then={proofThen}
              recover={proofRecover}
              onThen={onProofThen}
              onRecover={onProofRecover}
              placeholderThen="I start a 10-minute timer on the smallest executable task"
              placeholderRecover="The timer is running within 10 minutes"
              className="mt-14"
            />
          ) : null}
        </div>
      ) : null}

      <div className="wz-section" data-testid="wizard-cues">
        <div className="wz-between">
          <span className="wz-group-title">
            Execution cues <span className={`wz-count ${cueIds.length > 0 ? "wz-count-on" : ""}`}>{cueIds.length} of 3</span>
          </span>
          <span className="wz-note">Optional · what should I remember to help me succeed?</span>
        </div>
        <div role="group" aria-label="Execution cues" className="mt-6">
          {cueOptions.map((c) => {
            const on = cueIds.includes(c.id);
            const blocker = on ? null : cueBlocker(c);
            return (
              <OptionRow
                key={c.id}
                on={on}
                ariaDisabled={blocker !== null}
                disabled={!on && cueIds.length >= 3}
                label={c.cue_when ? `WHEN ${c.cue_when}` : c.name}
                sub={blocker ?? ([c.cue_when ? `REMIND ${c.name}` : cueSummary(c), appliesTo(c) && `applies to: ${appliesTo(c)}`].filter(Boolean).join(" · ") || null)}
                tag={c.scope === "global" ? "Global" : null}
                onPick={() => onToggleCue(c.id)}
              />
            );
          })}
          {cueOptions.length === 0 ? <div className="wz-note mt-6">No cue in the library for this area yet — create one below, or skip.</div> : null}
        </div>
        {cueIds.length > 0 ? (
          <div className="mt-12" data-testid="wizard-focus">
            <div className="wz-between">
              <span id="focus-label" className="wz-group-title">
                Focus cue
              </span>
              <span className="wz-note">Its use is asked first at every Day Close.</span>
            </div>
            <div role="radiogroup" aria-labelledby="focus-label" className="mt-6">
              {cueOptions
                .filter((c) => cueIds.includes(c.id))
                .map((c) => (
                  <OptionRow key={c.id} single on={focusId === c.id} label={c.name} onPick={() => onFocus(c.id)} />
                ))}
            </div>
          </div>
        ) : null}
        <CreateNew kind="cue" sits={sits} onCreated={onCreated} onCreateSituations={onCreateSituations} />
      </div>
    </>
  );
}

const CREATE_COPY: Record<ItemKind, { title: string; situationHint: string }> = {
  impediment: { title: "Create a new impediment", situationHint: "Tick at least one situation it applies to." },
  cue: { title: "Create a new execution cue", situationHint: "Tick at least one situation it applies to." },
};

/**
 * "Create new" — collapsed by default; open, it is the one-box capture for the kind
 * with APPLIES TO under the parts and a Create button gated by the required parts and
 * one situation. Saved to the library (global scope), then handed up to join the sprint.
 */
function CreateNew({ kind, sits, onCreated, onCreateSituations }: { kind: ItemKind; sits: SituationOption[]; onCreated: (item: LibraryItem) => void; onCreateSituations: CreateSituations }) {
  const idPrefix = `new-${kind}`;
  const [open, setOpen] = useState(false);
  const [parts, setParts] = useState<Parts>(() => emptyParts(kind));
  const [ticked, setTicked] = useState<string[]>([]);
  const [phase, setPhase] = useState<CapturePhase>("idle");
  const [key, setKey] = useState(0);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const opener = useRef<HTMLButtonElement>(null);

  const hint = phase === "parsing" ? "Reading your words…" : (missingPart(kind, parts)?.hint ?? (ticked.length === 0 ? CREATE_COPY[kind].situationHint : null));
  const ready = hint === null && !creating;

  async function create() {
    if (creating) return;
    if (hint) {
      focusMissingPart(idPrefix, kind, parts);
      return;
    }
    setCreating(true);
    setError(null);
    const name = partText(parts, kind === "cue" ? "remind" : "when").trim();
    const cueWhen = kind === "cue" ? partText(parts, "when").trim() : undefined;
    const res = await callAction(() =>
      createItem(kind, kind === "cue" ? { name, scope: "global", cueWhen, situationIds: ticked } : { name, scope: "global", proofThen: partText(parts, "then"), proofRecover: partText(parts, "recovered_when"), situationIds: ticked }),
    );
    setCreating(false);
    if (res.error || !res.id) {
      setError(res.error ?? "That did not save. Your words are still here — try again.");
      return;
    }
    onCreated({
      id: res.id,
      kind,
      name,
      scope: "global",
      rank: 0,
      archived_at: null,
      cue_when: cueWhen ?? null,
      proof_then: kind === "cue" ? null : partText(parts, "then").trim() || null,
      proof_recover: kind === "cue" ? null : partText(parts, "recovered_when").trim() || null,
      situations: sits.filter((s) => ticked.includes(s.id)),
      used: false,
      active: false,
    });
    setParts(emptyParts(kind));
    setTicked([]);
    setPhase("idle");
    setKey((k) => k + 1);
    setOpen(false);
    opener.current?.focus();
  }

  return (
    <div className="wz-create-new" data-testid={`create-new-${kind}`}>
      <button ref={opener} type="button" className="btn btn-ghost btn-ghost-accent" aria-expanded={open} aria-controls={`${idPrefix}-create`} onClick={() => setOpen((o) => !o)}>
        {open ? "Close" : "Create new"}
      </button>
      {open ? (
        <form
          id={`${idPrefix}-create`}
          className="wz-create-form"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <div className="label-accent" id={`${idPrefix}-title`}>
            {CREATE_COPY[kind].title}
          </div>
          <CaptureBox key={key} kind={kind} idPrefix={idPrefix} mode="capture" parts={parts} onParts={setParts} onPhase={setPhase} compact disabled={creating}>
            <SituationPicker
              idPrefix={idPrefix}
              options={sits}
              selected={ticked}
              onToggle={(id) => setTicked((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]))}
              onCreate={async (names) => {
                const res = await onCreateSituations(names);
                if ("error" in res) return res.error;
                setTicked((t) => [...t, ...res.ids.filter((id) => !t.includes(id))]);
                return null;
              }}
            />
          </CaptureBox>
          <div className="wz-row mt-8">
            <span className="hint grow" id={`${idPrefix}-hint`} aria-live="polite">
              {hint ?? ""}
            </span>
            <button type="submit" className="btn btn-ghost wz-create" aria-disabled={!ready} aria-describedby={hint ? `${idPrefix}-hint` : undefined}>
              {creating ? "Creating…" : "Create"}
            </button>
          </div>
          {error ? (
            <div role="alert" className="hint hint-accent mt-6">
              {error}
            </div>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
