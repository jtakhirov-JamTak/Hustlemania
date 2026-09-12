"use client";

import { useState } from "react";
import type { ItemKind } from "@/lib/data";

export type SituationOption = { id: string; name: string };

/**
 * F15: the "APPLIES TO" chips under a cue or impediment editor — tick the situations
 * this response covers, or name a new one (saved to the situations library of this kind,
 * global scope, and ticked). Callers own the options and the selection; `onCreate`
 * returns an error line or null and the caller adds the new situation to `options`.
 */
export function SituationPicker({
  idPrefix,
  kind,
  options,
  selected,
  onToggle,
  onCreate,
  compact,
}: {
  idPrefix: string;
  kind: ItemKind;
  options: SituationOption[];
  selected: string[];
  onToggle: (id: string) => void;
  onCreate: (name: string) => Promise<string | null>;
  /** Inline hosts (the wizard, the pickers): one line of chips and a short create row. */
  compact?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = Boolean(draft.trim()) && !creating;

  async function submit() {
    if (!ready) return;
    setCreating(true);
    setError(null);
    const err = await onCreate(draft.trim());
    setCreating(false);
    if (err) setError(err);
    else setDraft("");
  }

  return (
    <div className={`situations ${compact ? "situations-compact" : ""}`} data-testid="situation-picker">
      <span className="label-accent proof-label" id={`${idPrefix}-situations-label`}>
        APPLIES TO
      </span>
      {options.length === 0 ? (
        <div className="situations-empty" data-testid="situations-empty">
          No {kind} situations yet — name the first one here.
        </div>
      ) : null}
      <div className="pill-row" role="group" aria-labelledby={`${idPrefix}-situations-label`}>
        {options.map((s) => {
          const on = selected.includes(s.id);
          return (
            <button key={s.id} type="button" role="checkbox" className={`chip ${on ? "chip-on" : ""}`} aria-checked={on} data-situation-id={s.id} onClick={() => onToggle(s.id)}>
              {s.name}
            </button>
          );
        })}
      </div>
      <div className="row situations-create">
        <input
          id={`${idPrefix}-situation-new`}
          className="input input-compact grow"
          value={draft}
          aria-label="New situation"
          placeholder="New situation"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <button type="button" className="btn btn-ghost btn-ghost-accent" aria-disabled={!ready} onClick={() => void submit()}>
          {creating ? "Adding…" : "Add"}
        </button>
      </div>
      {error ? (
        <div role="alert" className="hint hint-accent mt-6">
          {error}
        </div>
      ) : null}
    </div>
  );
}
