"use client";

import { useEffect, useRef, useState } from "react";
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
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => first.current?.focus(), []);

  async function submitCreate() {
    if (!create || !draft.trim()) return;
    setCreating(true);
    setCreateError(null);
    const err = await create.onCreate(draft.trim());
    setCreating(false);
    if (err) setCreateError(err);
    else setDraft("");
  }

  return (
    <div className="dialog-scrim" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="picker-title" style={{ maxWidth: 560, padding: 0 }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--divider)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span id="picker-title" style={{ fontSize: 13, fontWeight: 600 }}>
            {title}
          </span>
          <button ref={first} type="button" className="link-quiet" aria-label="Cancel" onClick={onCancel} style={{ fontSize: 18, lineHeight: 1 }}>
            ×
          </button>
        </div>
        <div style={{ padding: 22 }}>
          {blurb ? <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 12, lineHeight: 1.5 }}>{blurb}</div> : null}
          {options.length === 0 && emptyLine ? <div style={{ fontSize: 13, color: "var(--muted)" }}>{emptyLine}</div> : null}
          {options.map((o) => (
            <OptionRow key={o.id} on={selected.includes(o.id)} single={single} disabled={o.disabled} onPick={() => onToggle(o.id)} label={o.label} sub={o.sub} tag={o.tag} />
          ))}
          {proof ? (
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "9px 12px", marginTop: 14, alignItems: "center" }}>
              <label htmlFor="picker-when" className="label-accent" style={{ fontWeight: 700 }}>
                WHEN
              </label>
              <input id="picker-when" className="input" value={proof.when} onChange={(e) => proof.onWhen(e.target.value)} placeholder="I notice myself…" style={{ fontSize: 13.5, padding: "10px 13px" }} />
              <label htmlFor="picker-then" className="label-accent" style={{ fontWeight: 700 }}>
                THEN
              </label>
              <input id="picker-then" className="input" value={proof.then} onChange={(e) => proof.onThen(e.target.value)} placeholder="I immediately…" style={{ fontSize: 13.5, padding: "10px 13px" }} />
            </div>
          ) : null}
          {create ? (
            <form
              style={{ display: "flex", gap: 8, marginTop: 14 }}
              onSubmit={(e) => {
                e.preventDefault();
                submitCreate();
              }}
            >
              <input className="input" aria-label={create.placeholder} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={create.placeholder} style={{ flex: 1, fontSize: 14 }} />
              <button type="submit" className="btn btn-ghost" disabled={creating || !draft.trim()} style={{ padding: "6px 12px", color: "var(--accent-ink)" }}>
                {creating ? "Creating…" : "Create"}
              </button>
            </form>
          ) : null}
          {createError || error ? (
            <div role="alert" className="error-bar" style={{ marginTop: 12 }}>
              <span>{createError ?? error}</span>
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "16px 22px", borderTop: "1px solid var(--divider)" }}>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {hint ? <span className="hint">{hint}</span> : null}
            <button type="button" className="btn btn-primary" disabled={Boolean(hint) || pending} onClick={onDone}>
              {pending ? "Saving…" : doneLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
