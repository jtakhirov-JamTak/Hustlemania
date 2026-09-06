"use client";

import { ErrorBar } from "@/components/ErrorBar";
import { useEffect, useRef, useState, useTransition } from "react";
import { saveMantra } from "@/app/(app)/actions/sprint";
import { callAction } from "@/lib/callAction";

export function MantraCard({ sprintId, initial }: { sprintId: string; initial: string }) {
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
    <section className="card-tint" style={{ marginTop: 20, padding: "24px 28px" }} data-testid="mantra-card">
      {editing ? (
        <form
          style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}
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
          <label htmlFor="mantra" className="label-accent" style={{ width: "100%" }}>
            Mantra
          </label>
          <input id="mantra" className="input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="An inspirational phrase" style={{ flex: 1, minWidth: 220 }} />
          <button type="submit" className="btn btn-primary" aria-disabled={blocked} aria-describedby={draft.trim() ? undefined : "mantra-hint"}>
            Save
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => { setDraft(mantra); setEditing(false); setError(null); }}>
            Cancel
          </button>
          <span className="hint" id="mantra-hint" aria-live="polite" style={{ width: "100%" }}>
            {draft.trim() ? "" : "A mantra is required."}
          </span>
          {error ? <ErrorBar style={{ width: "100%" }}>{error}</ErrorBar> : null}
        </form>
      ) : (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 18 }}>
          <blockquote
            style={{ margin: 0, fontSize: 23, fontWeight: 500, fontStyle: "italic", lineHeight: 1.35, maxWidth: "34ch", color: "var(--accent-ink)" }}
          >
            {mantra}
          </blockquote>
          <button ref={editButton} type="button" className="link-quiet" onClick={() => setEditing(true)} aria-label="Edit mantra">
            Edit
          </button>
        </div>
      )}
    </section>
  );
}
