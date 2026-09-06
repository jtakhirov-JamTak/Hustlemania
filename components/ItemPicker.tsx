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
      <div className="dialog-head" style={{ paddingBottom: 18, borderBottom: "1px solid var(--divider)" }}>
        <h2 id="picker-title" className="card-title" ref={heading} tabIndex={-1} style={{ outline: "none" }}>
          {title}
        </h2>
        <button type="button" className="link-quiet" aria-label="Cancel" onClick={onCancel} style={{ fontSize: 18, lineHeight: 1 }}>
          ×
        </button>
      </div>
      <div className="dialog-body" style={{ paddingTop: 18 }}>
        {blurb ? <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 12, lineHeight: 1.5 }}>{blurb}</div> : null}
        {options.length === 0 && emptyLine ? <div style={{ fontSize: 13, color: "var(--muted)" }}>{emptyLine}</div> : null}
        <div role={single ? "radiogroup" : "group"} aria-label={title}>
          {options.map((o) => (
            <OptionRow key={o.id} on={selected.includes(o.id)} single={single} disabled={o.disabled} onPick={() => onToggle(o.id)} label={o.label} sub={o.sub} tag={o.tag} />
          ))}
        </div>
        {proof ? <ProofInputs idPrefix="picker" when={proof.when} then={proof.then} onWhen={proof.onWhen} onThen={proof.onThen} style={{ marginTop: 14 }} /> : null}
        {create ? (
          <form
            style={{ marginTop: 14 }}
            onSubmit={(e) => {
              e.preventDefault();
              submitCreate();
            }}
          >
            <label htmlFor="picker-create" className="label-accent" style={{ display: "block", marginBottom: 6 }}>
              {create.placeholder}
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <input id="picker-create" className="input" value={draft} onChange={(e) => setDraft(e.target.value)} style={{ flex: 1 }} />
              <button type="submit" className="btn btn-ghost" aria-disabled={creating || !draft.trim()} style={{ padding: "6px 12px", color: "var(--accent-ink)" }}>
                {creating ? "Creating…" : "Create"}
              </button>
            </div>
          </form>
        ) : null}
        {createError || error ? (
          <ErrorBar style={{ marginTop: 12 }}>{createError ?? error}</ErrorBar>
        ) : null}
      </div>
      <div className="dialog-foot" style={{ borderTop: "1px solid var(--divider)" }}>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
