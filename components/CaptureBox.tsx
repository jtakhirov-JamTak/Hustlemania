"use client";

import { useRef, useState, type ReactNode } from "react";
import { parseCapture, type ParseCaptureResult } from "@/app/(app)/actions/capture";
import { Dictate } from "@/components/Dictate";
import { callAction } from "@/lib/callAction";
import { CAPTURE_BOX, type CaptureKind, emptyParts, joinParts, missingPart, normalizeParts, partList, PARTS, partText, type Parts } from "@/lib/capture";

export type CapturePhase = "idle" | "parsing" | "parsed" | "failed" | "unavailable" | "manual";

/** Focuses the first blank required part of `kind` (a refused Save lands the cursor where the words are missing). */
export function focusMissingPart(idPrefix: string, kind: CaptureKind, parts: Parts): boolean {
  const missing = missingPart(kind, parts);
  if (!missing) return false;
  const spec = PARTS[kind].find((p) => p.key === missing.key);
  const id = spec?.list ? `${idPrefix}-${missing.key}-1` : `${idPrefix}-${missing.key}`;
  const el = document.getElementById(id);
  if (el) el.focus();
  return true;
}

const LONG_PARTS = new Set(["goal", "intention"]);

/**
 * F17: one box of words, sorted into a kind's parts. Type or speak (Dictate); a dictation's
 * end, the "Sort into parts" button or Ctrl/Cmd+Enter sends the text to `parseCapture`;
 * the parts appear under the box as labelled fields, every one editable, list parts as
 * rows. A failed or unavailable sort keeps the text and shows the empty fields to fill by
 * hand. The host owns the parts (`parts` / `onParts`), the Save button and its hint
 * (`missingPart`); `onPhase` lets it disable Save while a sort is running. `mode="fields"`
 * starts with the fields alone plus a Re-record button that reopens the box.
 */
export function CaptureBox({
  kind,
  idPrefix,
  mode,
  parts,
  onParts,
  onPhase,
  disabled,
  compact,
  initialText,
  children,
  parse = parseCapture,
}: {
  kind: CaptureKind;
  idPrefix: string;
  mode: "capture" | "fields";
  parts: Parts;
  onParts: (parts: Parts) => void;
  onPhase?: (phase: CapturePhase) => void;
  disabled?: boolean;
  /** Inline hosts (a picker, a wizard row): a one-line box and smaller spacing. */
  compact?: boolean;
  initialText?: string;
  /** Rendered under the parts (APPLIES TO chips, scope chips). */
  children?: ReactNode;
  /** The sorter; a mockup or a test injects its own. */
  parse?: (kind: CaptureKind, text: string) => Promise<ParseCaptureResult>;
}) {
  const box = CAPTURE_BOX[kind];
  const [fieldsOnly, setFieldsOnly] = useState(mode === "fields");
  const [text, setText] = useState(initialText ?? "");
  const [phase, setPhaseState] = useState<CapturePhase>(mode === "fields" ? "manual" : "idle");
  const [status, setStatus] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const run = useRef(0);

  const setPhase = (p: CapturePhase) => {
    setPhaseState(p);
    onPhase?.(p);
  };

  async function sort(source?: string) {
    const words = (source ?? text).trim();
    if (!words || phase === "parsing" || disabled) return;
    const id = ++run.current;
    setStatus(null);
    setPhase("parsing");
    const res = await callAction(() => parse(kind, words));
    if (id !== run.current) return;
    if (res.error) {
      setStatus(res.error);
      setPhase(res.code === "parser_unavailable" ? "unavailable" : "failed");
      if (missingPart(kind, parts) && !PARTS[kind].some((p) => (p.list ? partList(parts, p.key).length : partText(parts, p.key)))) onParts(emptyParts(kind));
      return;
    }
    onParts(normalizeParts(kind, res.parts));
    setPhase("parsed");
  }

  function byHand() {
    setStatus(null);
    setPhase("manual");
  }

  function reRecord() {
    setText(joinParts(kind, parts));
    setFieldsOnly(false);
    setStatus(null);
    setPhase("idle");
    setTimeout(() => textarea.current?.focus(), 0);
  }

  const showFields = fieldsOnly || phase === "parsed" || phase === "failed" || phase === "unavailable" || phase === "manual";
  const setText_ = (k: string, v: string) => onParts({ ...parts, [k]: v });
  const setItem = (k: string, i: number, v: string) => {
    const list = [...partList(parts, k)];
    list[i] = v;
    onParts({ ...parts, [k]: list });
  };
  const removeItem = (k: string, i: number) => onParts({ ...parts, [k]: partList(parts, k).filter((_, j) => j !== i) });
  const addItem = (k: string) => onParts({ ...parts, [k]: [...partList(parts, k), ""] });

  return (
    <div className={`capture ${compact ? "capture-compact" : ""}`} data-testid="capture-box" data-kind={kind} data-phase={phase}>
      {!fieldsOnly ? (
        <>
          <textarea
            ref={textarea}
            id={`${idPrefix}-box`}
            className="input capture-box"
            rows={compact ? 1 : 3}
            value={text}
            aria-label={box.label}
            placeholder={box.placeholder}
            disabled={disabled}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey || compact)) {
                e.preventDefault();
                void sort();
              }
            }}
          />
          <div className="capture-tools">
            <Dictate label={box.dictate} value={text} onChange={setText} disabled={disabled || phase === "parsing"} onStop={(t) => void sort(t)} />
            <button type="button" className="btn btn-ghost btn-ghost-accent" disabled={disabled || phase === "parsing" || !text.trim()} onClick={() => void sort()}>
              {phase === "parsing" ? "Sorting…" : "Sort into parts"}
            </button>
            {phase === "idle" ? (
              <button type="button" className="link-quiet capture-hand" onClick={byHand}>
                Fill the parts by hand
              </button>
            ) : null}
          </div>
          {phase === "parsing" ? (
            <div className="capture-status" role="status">
              Reading your words…
            </div>
          ) : status ? (
            <div className="capture-status capture-status-warn" role="status">
              {status}
            </div>
          ) : null}
        </>
      ) : null}

      {showFields ? (
        <div className="capture-parts" data-testid="capture-parts">
          {!fieldsOnly ? <div className="label-accent capture-parts-title">Parsed as</div> : null}
          {PARTS[kind].map((spec) =>
            spec.list ? (
              <div key={spec.key} className="capture-list" role="group" aria-label={`${spec.label}s`}>
                {partList(parts, spec.key).map((item, i) => (
                  <div key={i} className="capture-list-row">
                    <label htmlFor={`${idPrefix}-${spec.key}-${i + 1}`} className="label-accent proof-label">
                      {spec.label} {i + 1}
                    </label>
                    <input id={`${idPrefix}-${spec.key}-${i + 1}`} className="input input-compact" value={item} disabled={disabled} placeholder={spec.placeholder} onChange={(e) => setItem(spec.key, i, e.target.value)} />
                    <button type="button" className="link-quiet" aria-label={`Remove ${spec.label.toLowerCase()} ${i + 1}`} disabled={disabled} onClick={() => removeItem(spec.key, i)}>
                      ×
                    </button>
                  </div>
                ))}
                {partList(parts, spec.key).length === 0 ? (
                  <div className="capture-list-row">
                    <label htmlFor={`${idPrefix}-${spec.key}-1`} className="label-accent proof-label">
                      {spec.label} 1
                    </label>
                    <input id={`${idPrefix}-${spec.key}-1`} className="input input-compact" value="" disabled={disabled} placeholder={spec.placeholder} onChange={(e) => onParts({ ...parts, [spec.key]: [e.target.value] })} />
                    <span />
                  </div>
                ) : null}
                <button type="button" className="link-quiet capture-add" disabled={disabled} onClick={() => addItem(spec.key)}>
                  + Add another
                </button>
              </div>
            ) : (
              <div key={spec.key} className="capture-part">
                <label htmlFor={`${idPrefix}-${spec.key}`} className="label-accent proof-label">
                  {spec.label}
                </label>
                <textarea
                  id={`${idPrefix}-${spec.key}`}
                  className="input input-compact capture-part-text"
                  rows={LONG_PARTS.has(spec.key) ? 2 : 1}
                  value={partText(parts, spec.key)}
                  disabled={disabled}
                  placeholder={spec.placeholder}
                  onChange={(e) => setText_(spec.key, e.target.value)}
                  onKeyDown={(e) => {
                    // One line per part: Enter submits the host form as an input would.
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
                    }
                  }}
                />
              </div>
            ),
          )}
          {children}
          {fieldsOnly ? (
            <button type="button" className="btn btn-ghost btn-ghost-accent capture-rerecord" disabled={disabled} onClick={reRecord}>
              Re-record
            </button>
          ) : null}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
