"use client";

import { useState, useTransition } from "react";
import { saveMantra } from "@/app/(app)/actions/sprint";
import { callAction } from "@/lib/callAction";

export function MantraCard({ sprintId, initial }: { sprintId: string; initial: string }) {
  const [mantra, setMantra] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <section className="card-tint" style={{ marginTop: 20, padding: "24px 28px" }} data-testid="mantra-card">
      {editing ? (
        <form
          style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}
          onSubmit={(e) => {
            e.preventDefault();
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
          <input
            aria-label="Mantra"
            className="input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="An inspirational phrase"
            style={{ flex: 1, minWidth: 220, fontSize: 15 }}
          />
          <button type="submit" className="btn btn-primary" disabled={pending || !draft.trim()}>
            Save
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => { setDraft(mantra); setEditing(false); setError(null); }}>
            Cancel
          </button>
          {!draft.trim() ? <span className="hint" style={{ width: "100%" }}>A mantra is required.</span> : null}
          {error ? <div role="alert" className="error-bar" style={{ width: "100%" }}>{error}</div> : null}
        </form>
      ) : (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 18 }}>
          <blockquote
            style={{ margin: 0, fontSize: 23, fontWeight: 500, fontStyle: "italic", lineHeight: 1.35, maxWidth: "34ch", color: "var(--accent-ink)" }}
          >
            {mantra}
          </blockquote>
          <button type="button" className="link-quiet" onClick={() => setEditing(true)}>
            Edit
          </button>
        </div>
      )}
    </section>
  );
}
