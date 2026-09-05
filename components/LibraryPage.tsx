"use client";

import { useState, useTransition } from "react";
import { archiveItem, createItem, deleteItem, moveItem, restoreItem, setItemScope, updateItem, type BlockedSprint } from "@/app/(app)/actions";
import { areaName, isAreaKey } from "@/lib/areas";
import { SCOPES, type ItemKind, type ItemScope, type LibraryItem } from "@/lib/data";
import { blockedReason } from "@/lib/errors";

type Filter = "all" | ItemScope;

const COPY: Record<ItemKind, { title: string; blurb: string; addTitle: string; namePlaceholder: string; empty: string }> = {
  cue: {
    title: "Execution cues",
    blurb: "Practical reminders, questions and principles that help you execute. Every sprint carries one to three of them; at Day Close you say which ones helped.",
    addTitle: "Add an execution cue",
    namePlaceholder: "Ask how much this pays whenever I schedule something",
    empty: "No execution cues yet. Add the first one above — a sprint needs at least one.",
  },
  impediment: {
    title: "Impediments",
    blurb: "Obstacles likely to get in the way: avoidance, distraction, poor sleep. Every sprint carries one to five, one of them the highest, with a WHEN → THEN proof point.",
    addTitle: "Add an impediment",
    namePlaceholder: "Starting late",
    empty: "No impediments yet. Add the first one above — a sprint needs at least one, with a WHEN → THEN.",
  },
};

function scopeLabel(scope: ItemScope): string {
  return scope === "global" ? "Global" : isAreaKey(scope) ? areaName(scope) : scope;
}

function BlockedList({ blocked, verb }: { blocked: BlockedSprint[]; verb: string }) {
  return (
    <div role="alert" className="error-bar" style={{ marginTop: 12, display: "block" }}>
      <div style={{ fontWeight: 600 }}>{verb} is blocked — fix these sprints first, then retry.</div>
      <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
        {blocked.map((b) => (
          <li key={b.sprint_id}>
            {isAreaKey(b.area) ? areaName(b.area) : b.area} · “{b.outcome}”: {blockedReason(b.reason)}.
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LibraryPage({ kind, items }: { kind: ItemKind; items: LibraryItem[] }) {
  const copy = COPY[kind];
  const [filter, setFilter] = useState<Filter>("all");
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const active = items.filter((i) => i.archived_at === null);
  const archived = items.filter((i) => i.archived_at !== null);
  const shown = filter === "all" ? active : active.filter((i) => i.scope === filter);

  return (
    <div>
      <h1 className="heading" style={{ fontSize: 38, margin: 0, letterSpacing: "-0.03em", lineHeight: 1.1 }}>
        {copy.title}
      </h1>
      <p style={{ fontSize: 13.5, color: "var(--muted)", margin: "6px 0 20px", maxWidth: "62ch", lineHeight: 1.55 }}>{copy.blurb}</p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }} aria-label="Scope filter">
        {[{ key: "all" as Filter, label: "All" }, ...SCOPES.map((s) => ({ key: s.key as Filter, label: s.label }))].map((f) => (
          <button key={f.key} type="button" className={`chip ${filter === f.key ? "chip-on" : ""}`} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      <AddCard kind={kind} onError={setPageError} />

      {pageError ? (
        <div role="alert" className="error-bar" style={{ marginBottom: 12 }}>
          <span>{pageError}</span>
          <button type="button" className="link-quiet" style={{ color: "inherit", fontWeight: 600 }} onClick={() => setPageError(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      <div data-testid="library-list">
        {shown.map((item, i) => (
          <ItemCard
            key={item.id}
            item={item}
            position={i + 1}
            first={active[0]?.id === item.id}
            last={active[active.length - 1]?.id === item.id}
            pending={pending}
            onMove={(dir) =>
              start(async () => {
                const res = await moveItem(kind, item.id, dir);
                if (res.error) setPageError(res.error);
              })
            }
          />
        ))}
      </div>
      {shown.length === 0 ? (
        <div style={{ border: "1px dashed var(--divider)", borderRadius: 16, padding: "26px 24px", fontSize: 13.5, color: "var(--muted)", lineHeight: 1.55, maxWidth: "56ch" }} data-testid="library-empty">
          {active.length === 0 ? copy.empty : "Nothing in this scope. Filters keep the rank order of the full list."}
        </div>
      ) : null}

      <div style={{ marginTop: 26, borderTop: "1px solid var(--divider)", paddingTop: 16 }}>
        <button type="button" className="disclosure" aria-expanded={archivedOpen} onClick={() => setArchivedOpen((o) => !o)}>
          {archivedOpen ? "Hide archived" : "Show archived"} ({archived.length})
        </button>
        {archivedOpen ? (
          <div data-testid="archived-list">
            {archived.length === 0 ? <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 10 }}>Nothing archived yet.</div> : null}
            {archived.map((a) => (
              <ArchivedRow key={a.id} item={a} onError={setPageError} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ScopeChips({ value, onChange, disabled }: { value: ItemScope; onChange: (s: ItemScope) => void; disabled?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} role="radiogroup" aria-label="Scope">
      {SCOPES.map((s) => (
        <button key={s.key} type="button" role="radio" aria-checked={value === s.key} className={`chip ${value === s.key ? "chip-on" : ""}`} disabled={disabled} onClick={() => onChange(s.key)}>
          {s.label}
        </button>
      ))}
    </div>
  );
}

function ProofInputs({ when, then, onWhen, onThen, idPrefix }: { when: string; then: string; onWhen: (v: string) => void; onThen: (v: string) => void; idPrefix: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 12px", marginTop: 10, alignItems: "center" }}>
      <label htmlFor={`${idPrefix}-when`} className="label-accent" style={{ fontWeight: 700 }}>
        WHEN
      </label>
      <input id={`${idPrefix}-when`} className="input" value={when} onChange={(e) => onWhen(e.target.value)} placeholder="I notice myself…" style={{ fontSize: 13.5, padding: "9px 12px" }} />
      <label htmlFor={`${idPrefix}-then`} className="label-accent" style={{ fontWeight: 700 }}>
        THEN
      </label>
      <input id={`${idPrefix}-then`} className="input" value={then} onChange={(e) => onThen(e.target.value)} placeholder="I immediately…" style={{ fontSize: 13.5, padding: "9px 12px" }} />
    </div>
  );
}

function AddCard({ kind, onError }: { kind: ItemKind; onError: (e: string | null) => void }) {
  const copy = COPY[kind];
  const [name, setName] = useState("");
  const [explanation, setExplanation] = useState("");
  const [scope, setScope] = useState<ItemScope>("global");
  const [when, setWhen] = useState("");
  const [then, setThen] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    if (!name.trim()) return;
    setError(null);
    start(async () => {
      const res = await createItem(kind, { name, explanation, scope, proofWhen: when, proofThen: then });
      if (res.error) {
        setError(res.error);
        return;
      }
      setName("");
      setExplanation("");
      setWhen("");
      setThen("");
      onError(null);
    });
  }

  return (
    <form
      className="card"
      style={{ padding: "20px 22px", marginBottom: 20 }}
      data-testid="library-add"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{copy.addTitle}</div>
      <input className="input" aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder={copy.namePlaceholder} />
      <input className="input" aria-label="Explanation" value={explanation} onChange={(e) => setExplanation(e.target.value)} placeholder="Optional explanation — why this matters" style={{ marginTop: 10, fontSize: 13.5 }} />
      {kind === "impediment" ? <ProofInputs idPrefix="add" when={when} then={then} onWhen={setWhen} onThen={setThen} /> : null}
      {error ? (
        <div role="alert" className="error-bar" style={{ marginTop: 12 }}>
          <span>{error}</span>
          <button type="submit" className="link-quiet" style={{ color: "inherit", fontWeight: 600 }}>
            Retry
          </button>
        </div>
      ) : null}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, marginTop: 14, flexWrap: "wrap" }}>
        <ScopeChips value={scope} onChange={setScope} />
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {!name.trim() ? <span className="hint">Name it first.</span> : null}
          <button type="submit" className="btn btn-primary" disabled={pending || !name.trim()}>
            {pending ? "Adding…" : "Add"}
          </button>
        </div>
      </div>
    </form>
  );
}

function ItemCard({
  item,
  position,
  first,
  last,
  pending,
  onMove,
}: {
  item: LibraryItem;
  position: number;
  first: boolean;
  last: boolean;
  pending: boolean;
  onMove: (dir: "up" | "down") => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [explanation, setExplanation] = useState(item.explanation ?? "");
  const [when, setWhen] = useState(item.proof_when ?? "");
  const [then, setThen] = useState(item.proof_then ?? "");
  const [scope, setScope] = useState<ItemScope>(item.scope);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<{ verb: string; list: BlockedSprint[] } | null>(null);
  const [busy, start] = useTransition();
  const hasProof = Boolean(item.proof_when || item.proof_then);

  function startEdit() {
    setName(item.name);
    setExplanation(item.explanation ?? "");
    setWhen(item.proof_when ?? "");
    setThen(item.proof_then ?? "");
    setScope(item.scope);
    setError(null);
    setBlocked(null);
    setEditing(true);
  }

  function save() {
    if (!name.trim()) return;
    setError(null);
    setBlocked(null);
    start(async () => {
      const res = await updateItem(item.kind, item.id, { name, explanation, proofWhen: when, proofThen: then });
      if (res.error) {
        setError(res.error);
        return;
      }
      if (scope !== item.scope) {
        const sc = await setItemScope(item.kind, item.id, scope);
        if (sc.error) {
          setError(sc.error);
          return;
        }
        if (sc.blocked && sc.blocked.length > 0) {
          setBlocked({ verb: "Narrowing the scope", list: sc.blocked });
          return;
        }
      }
      setEditing(false);
    });
  }

  function archive() {
    setError(null);
    setBlocked(null);
    start(async () => {
      const res = await archiveItem(item.kind, item.id);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.blocked && res.blocked.length > 0) setBlocked({ verb: "Archive", list: res.blocked });
    });
  }

  function remove() {
    setError(null);
    start(async () => {
      const res = await deleteItem(item.kind, item.id);
      if (res.error) setError(res.error);
    });
  }

  return (
    <div className="card" style={{ borderRadius: 16, padding: "16px 18px", marginBottom: 10 }} data-testid="library-item" data-item-id={item.id}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <button type="button" className="link-quiet" aria-label={`Move ${item.name} up`} disabled={first || pending || busy} onClick={() => onMove("up")} style={{ opacity: first ? 0.3 : 1, fontSize: 13, lineHeight: 1 }}>
            ↑
          </button>
          <button type="button" className="link-quiet" aria-label={`Move ${item.name} down`} disabled={last || pending || busy} onClick={() => onMove("down")} style={{ opacity: last ? 0.3 : 1, fontSize: 13, lineHeight: 1 }}>
            ↓
          </button>
        </div>
        <div style={{ width: 20, fontSize: 13, fontWeight: 700, color: "var(--muted)", paddingTop: 3 }} aria-label={`Rank ${position}`}>
          {position}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {!editing ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.4 }}>{item.name}</div>
                  {item.explanation ? <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 3, lineHeight: 1.45 }}>{item.explanation}</div> : null}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <span className="option-tag" style={{ marginTop: 0 }}>
                    {scopeLabel(item.scope)}
                  </span>
                  <span style={{ fontSize: 10.5, color: "var(--muted)" }}>{item.used ? "In sprint history" : "Unused"}</span>
                  <button type="button" className="link-quiet" style={{ color: "var(--accent-ink)" }} onClick={startEdit}>
                    Edit
                  </button>
                  {item.used ? (
                    <button type="button" className="link-quiet" disabled={busy} onClick={archive}>
                      Archive
                    </button>
                  ) : (
                    <button type="button" className="link-quiet" disabled={busy} onClick={remove}>
                      Delete
                    </button>
                  )}
                </div>
              </div>
              {item.kind === "impediment" && hasProof ? (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--divider)", display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 12px", alignItems: "baseline" }}>
                  <span className="label-accent" style={{ fontWeight: 700, fontSize: 10 }}>
                    WHEN
                  </span>
                  <span style={{ fontSize: 13, lineHeight: 1.45 }}>{item.proof_when ?? "—"}</span>
                  <span className="label-accent" style={{ fontWeight: 700, fontSize: 10 }}>
                    THEN
                  </span>
                  <span style={{ fontSize: 13, lineHeight: 1.45 }}>{item.proof_then ?? "—"}</span>
                </div>
              ) : item.kind === "impediment" ? (
                <div style={{ marginTop: 10, fontSize: 11.5, color: "var(--muted)" }}>No proof point yet — needed before this can be a highest impediment.</div>
              ) : null}
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              <input className="input" aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} style={{ fontWeight: 600, padding: "10px 12px" }} />
              <input className="input" aria-label="Explanation" value={explanation} onChange={(e) => setExplanation(e.target.value)} placeholder="Optional explanation" style={{ marginTop: 8, fontSize: 13.5, padding: "9px 12px" }} />
              {item.kind === "impediment" ? <ProofInputs idPrefix={`edit-${item.id}`} when={when} then={then} onWhen={setWhen} onThen={setThen} /> : null}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
                <ScopeChips value={scope} onChange={setScope} disabled={busy} />
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {!name.trim() ? <span className="hint">A name is required.</span> : null}
                  <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
                    {busy ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            </form>
          )}
          {error ? (
            <div role="alert" className="error-bar" style={{ marginTop: 12 }}>
              <span>{error}</span>
              <button type="button" className="link-quiet" style={{ color: "inherit", fontWeight: 600 }} onClick={() => setError(null)}>
                Dismiss
              </button>
            </div>
          ) : null}
          {blocked ? <BlockedList blocked={blocked.list} verb={blocked.verb} /> : null}
        </div>
      </div>
    </div>
  );
}

function ArchivedRow({ item, onError }: { item: LibraryItem; onError: (e: string | null) => void }) {
  const [busy, start] = useTransition();
  return (
    <div style={{ marginTop: 10, background: "var(--faint)", borderRadius: 14, padding: "13px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }} data-testid="archived-item">
      <span style={{ fontSize: 13.5, color: "var(--muted)" }}>
        {item.name} <span style={{ fontSize: 11 }}>· {scopeLabel(item.scope)}</span>
      </span>
      <button
        type="button"
        className="link-quiet"
        style={{ color: "var(--accent-ink)" }}
        disabled={busy}
        onClick={() =>
          start(async () => {
            const res = await restoreItem(item.kind, item.id);
            onError(res.error ?? null);
          })
        }
      >
        Restore
      </button>
    </div>
  );
}
