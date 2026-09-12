"use client";

import { useState } from "react";
import { CaptureBox } from "@/components/CaptureBox";
import { emptyParts, missingPart, partList, type Parts } from "@/lib/capture";

export type SituationOption = { id: string; name: string };

/**
 * F15 / F17: the "APPLIES TO" chips under a cue or impediment editor — tick the situations
 * this response covers, or say a list of new ones ("getting up early, going to bed late")
 * which are created in the one situations library (global scope) and ticked at once.
 * Callers own the options and the selection; `onCreate` takes the names, returns an error
 * line or null, and adds the new situations to `options`.
 */
export function SituationPicker({
  idPrefix,
  options,
  selected,
  onToggle,
  onCreate,
  compact,
}: {
  idPrefix: string;
  options: SituationOption[];
  selected: string[];
  onToggle: (id: string) => void;
  onCreate: (names: string[]) => Promise<string | null>;
  /** Inline hosts (the wizard, the pickers): one line of chips and a short create row. */
  compact?: boolean;
}) {
  return (
    <div className={`situations ${compact ? "situations-compact" : ""}`} data-testid="situation-picker">
      <span className="label-accent proof-label" id={`${idPrefix}-situations-label`}>
        APPLIES TO
      </span>
      {options.length === 0 ? (
        <div className="situations-empty" data-testid="situations-empty">
          No situations yet — name the first ones here.
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
      <SituationCapture idPrefix={`${idPrefix}-situation`} onCreate={onCreate} compact />
    </div>
  );
}

/**
 * F17: the compact situations box — one line, Dictate, Sort into parts, then a row per
 * situation and "Add all". A single typed name and Enter is the one-item list.
 */
export function SituationCapture({ idPrefix, onCreate, compact }: { idPrefix: string; onCreate: (names: string[]) => Promise<string | null>; compact?: boolean }) {
  const [parts, setParts] = useState<Parts>(() => emptyParts("situations"));
  const [key, setKey] = useState(0);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const names = partList(parts, "situations")
    .map((s) => s.trim())
    .filter(Boolean);
  const ready = names.length > 0 && !creating;
  const hint = missingPart("situations", parts)?.hint ?? null;

  async function submit() {
    if (!ready) return;
    setCreating(true);
    setError(null);
    const err = await onCreate(names);
    setCreating(false);
    if (err) setError(err);
    else {
      setParts(emptyParts("situations"));
      setKey((k) => k + 1);
    }
  }

  return (
    <div className="situations-create" data-testid="situation-capture">
      <CaptureBox key={key} kind="situations" idPrefix={idPrefix} mode="capture" parts={parts} onParts={setParts} compact={compact} disabled={creating} />
      <div className="row mt-6">
        <span className="hint grow" id={`${idPrefix}-hint`} aria-live="polite">
          {names.length === 0 && parts.situations && (parts.situations as string[]).length > 0 ? hint : ""}
        </span>
        <button type="button" className="btn btn-ghost btn-ghost-accent" aria-disabled={!ready} onClick={() => void submit()}>
          {creating ? "Adding…" : names.length > 1 ? `Add all ${names.length}` : "Add all"}
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
