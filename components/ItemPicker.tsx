"use client";

import { ProofInputs } from "@/components/ProofInputs";
import { ErrorBar } from "@/components/ErrorBar";
import { useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { OptionRow } from "@/components/OptionRow";

export type PickerOption = { id: string; label: string; sub?: string | null; tag?: string | null; disabled?: boolean };

/**
 * The 560px picker dialog: a list of selection rows, optional WHEN/THEN inputs, an
 * optional inline "Create" line, a hint beside the primary. Callers own the state.
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
  proof?: { when: string; then: string; onWhen: (v: string) => void; onThen: (v: string) => void } | null;
  create?: { placeholder: string; onCreate: (name: string) => Promise<string | null> } | null;
  hint?: string | null;
  error?: string | null;
  doneLabel: string;
  pending: boolean;
  onDone: () => void;
  onCancel: () => void;
  emptyLine?: string;
}) {
  const [draft, setDraft] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const blocked = Boolean(hint) || pending;

  async function submitCreate() {
    if (!create || !draft.trim() || creating) return;
    setCreating(true);
    setCreateError(null);
    const err = await create.onCreate(draft.trim());
    setCreating(false);
    if (err) setCreateError(err);
    else setDraft("");
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
        {proof ? <ProofInputs idPrefix="picker" when={proof.when} then={proof.then} onWhen={proof.onWhen} onThen={proof.onThen} className="mt-14" /> : null}
        {create ? (
          <form
            className="mt-14"
            onSubmit={(e) => {
              e.preventDefault();
              submitCreate();
            }}
          >
            <label htmlFor="picker-create" className="label-accent block field-label-top">
              {create.placeholder}
            </label>
            <div className="row">
              <input id="picker-create" className="input grow" value={draft} onChange={(e) => setDraft(e.target.value)} />
              <button type="submit" className="btn btn-ghost btn-ghost-accent" aria-disabled={creating || !draft.trim()}>
                {creating ? "Creating…" : "Create"}
              </button>
            </div>
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
