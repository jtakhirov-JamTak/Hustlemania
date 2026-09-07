"use client";

import { ProofInputs } from "@/components/ProofInputs";
import { ErrorBar } from "@/components/ErrorBar";
import { useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { OptionRow } from "@/components/OptionRow";

export type PickerOption = { id: string; label: string; sub?: string | null; tag?: string | null; disabled?: boolean };

export type PickerProof = { when: string; then: string; recover: string; onWhen: (v: string) => void; onThen: (v: string) => void; onRecover: (v: string) => void };

/**
 * The 560px picker dialog: a list of selection rows, optional proof inputs, an optional
 * inline "Create" line (one input, or WHEN + REMIND for a cue), a hint beside the
 * primary. Callers own the state.
 */
export function ItemPicker({
  title,
  blurb,
  options,
  single,
  selected,
  onToggle,
  proof,
  create,
  hint,
  error,
  doneLabel,
  pending,
  onDone,
  onCancel,
  emptyLine,
}: {
  title: string;
  blurb?: string;
  options: PickerOption[];
  single: boolean;
  selected: string[];
  onToggle: (id: string) => void;
  proof?: PickerProof | null;
  /** `whenLabel` adds a required WHEN input ahead of the name (a cue's trigger, F6). */
  create?: { placeholder: string; whenLabel?: string; onCreate: (name: string, when: string) => Promise<string | null> } | null;
  hint?: string | null;
  error?: string | null;
  doneLabel: string;
  pending: boolean;
  onDone: () => void;
  onCancel: () => void;
  emptyLine?: string;
}) {
  const [draft, setDraft] = useState("");
  const [draftWhen, setDraftWhen] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const blocked = Boolean(hint) || pending;
  const createReady = Boolean(draft.trim()) && (!create?.whenLabel || Boolean(draftWhen.trim()));

  async function submitCreate() {
    if (!create || !createReady || creating) return;
    setCreating(true);
    setCreateError(null);
    const err = await create.onCreate(draft.trim(), draftWhen.trim());
    setCreating(false);
    if (err) setCreateError(err);
    else {
      setDraft("");
      setDraftWhen("");
    }
  }

  return (
    <Modal labelledBy="picker-title" onDismiss={onCancel} initialFocus={heading} maxWidth={560}>
      <div className="dialog-head dialog-head-rule">
        <h2 id="picker-title" className="card-title focus-quiet" ref={heading} tabIndex={-1}>
          {title}
        </h2>
        <button type="button" className="link-quiet dialog-x" aria-label="Cancel" onClick={onCancel}>
          ×
        </button>
      </div>
      <div className="dialog-body dialog-body-rule">
        {blurb ? <div className="dialog-blurb">{blurb}</div> : null}
        {options.length === 0 && emptyLine ? <div className="dialog-empty">{emptyLine}</div> : null}
        <div role={single ? "radiogroup" : "group"} aria-label={title}>
          {options.map((o) => (
            <OptionRow key={o.id} on={selected.includes(o.id)} single={single} disabled={o.disabled} onPick={() => onToggle(o.id)} label={o.label} sub={o.sub} tag={o.tag} />
          ))}
        </div>
        {proof ? (
          <ProofInputs idPrefix="picker" when={proof.when} then={proof.then} recover={proof.recover} onWhen={proof.onWhen} onThen={proof.onThen} onRecover={proof.onRecover} className="mt-14" />
        ) : null}
        {create ? (
          <form
            className="mt-14"
            onSubmit={(e) => {
              e.preventDefault();
              submitCreate();
            }}
          >
            <label htmlFor={create.whenLabel ? "picker-create-when" : "picker-create"} className="label-accent block field-label-top">
              {create.placeholder}
            </label>
            {create.whenLabel ? (
              <div className="proof-grid" style={{ marginBottom: 8 }}>
                <label htmlFor="picker-create-when" className="label-accent proof-label">
                  WHEN
                </label>
                <input id="picker-create-when" className="input input-compact" value={draftWhen} onChange={(e) => setDraftWhen(e.target.value)} placeholder={create.whenLabel} />
                <label htmlFor="picker-create" className="label-accent proof-label">
                  REMIND
                </label>
                <div className="row">
                  <input id="picker-create" className="input input-compact grow" value={draft} onChange={(e) => setDraft(e.target.value)} />
                  <button type="submit" className="btn btn-ghost btn-ghost-accent" aria-disabled={creating || !createReady}>
                    {creating ? "Creating…" : "Create"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="row">
                <input id="picker-create" className="input grow" value={draft} onChange={(e) => setDraft(e.target.value)} />
                <button type="submit" className="btn btn-ghost btn-ghost-accent" aria-disabled={creating || !createReady}>
                  {creating ? "Creating…" : "Create"}
                </button>
              </div>
            )}
          </form>
        ) : null}
        {createError || error ? <ErrorBar className="mt-12">{createError ?? error}</ErrorBar> : null}
      </div>
      <div className="dialog-foot dialog-foot-rule">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <div className="actions">
          <span className="hint" id="picker-hint" aria-live="polite">
            {hint ?? ""}
          </span>
          <button
            type="button"
            className="btn btn-primary"
            aria-disabled={blocked}
            aria-describedby={hint ? "picker-hint" : undefined}
            onClick={() => {
              if (!blocked) onDone();
            }}
          >
            {pending ? "Saving…" : doneLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
