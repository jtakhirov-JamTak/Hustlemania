"use client";

import { ErrorBar } from "@/components/ErrorBar";
import { useEffect, useRef, useState, useTransition } from "react";
import { archiveItem, createSituation, deleteItem, moveItem, restoreItem, setItemScope, updateSituation, type BlockedSprint } from "@/app/(app)/actions/library";
import { areaName, isAreaKey } from "@/lib/areas";
import { onRadioArrowKeys } from "@/components/radioKeys";
import { callAction } from "@/lib/callAction";
import { SCOPES, type ItemKind, type ItemScope, type SituationItem } from "@/lib/data";
import { blockedReason } from "@/lib/errors";

type Filter = "all" | ItemScope;

const COPY: Record<ItemKind, { title: string; blurb: string; addTitle: string; empty: string; placeholder: string; itemsPage: string }> = {
  impediment: {
    title: "Impediment situations",
    blurb: "The situations your impediments apply to. One response usually covers several; tick them on the Impediments page.",
    addTitle: "Add a situation",
    empty: "No impediment situations yet. Name the first one above, then tick it under an impediment.",
    placeholder: "Starting late",
    itemsPage: "impediment",
  },
  cue: {
    title: "Cue situations",
    blurb: "The situations your execution cues apply to. One cue usually covers several; tick them on the Cues page.",
    addTitle: "Add a situation",
    empty: "No cue situations yet. Name the first one above, then tick it under a cue.",
    placeholder: "Scheduling anything",
    itemsPage: "cue",
  },
};

function scopeLabel(scope: ItemScope): string {
  return scope === "global" ? "Global" : isAreaKey(scope) ? areaName(scope) : scope;
}

function usageLabel(s: SituationItem): string {
  const applied = s.attached ? `Applied by ${s.attached} ${s.kind}${s.attached === 1 ? "" : "s"}` : "Unused";
  return s.active ? `${applied} · in an active sprint` : s.used ? `${applied} · in sprint history` : applied;
}

function focusTitle() {
  document.getElementById("library-title")?.focus();
}

function BlockedList({ blocked }: { blocked: BlockedSprint[] }) {
  return (
    <div role="alert" className="error-bar" style={{ marginTop: 12, display: "block" }}>
      <div style={{ fontWeight: 600 }}>Archive is blocked — fix these sprints first, then retry.</div>
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

function ScopeChips({ value, onChange, disabled }: { value: ItemScope; onChange: (s: ItemScope) => void; disabled?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} role="radiogroup" aria-label="Scope">
      {SCOPES.map((s) => (
        <button key={s.key} type="button" role="radio" aria-checked={value === s.key} className={`chip ${value === s.key ? "chip-on" : ""}`} disabled={disabled} onClick={() => onChange(s.key)} onKeyDown={onRadioArrowKeys}>
          {s.label}
        </button>
      ))}
    </div>
  );
}

/**
 * F15: one kind's situations library — the same skeleton as the item libraries: rank,
 * scope chips, an archived fold, and the usage line. A situation is attached to items
 * on their own page; here it is named, ranked, scoped, archived or deleted.
 */
export function SituationLibraryPage({ kind, items }: { kind: ItemKind; items: SituationItem[] }) {
  const copy = COPY[kind];
  const [filter, setFilter] = useState<Filter>("all");
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const active = items.filter((s) => s.archived_at === null);
  const archived = items.filter((s) => s.archived_at !== null);
  const shown = filter === "all" ? active : active.filter((s) => s.scope === filter);

  return (
    <div data-testid="situations-page" data-kind={kind}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
        <h1 id="library-title" tabIndex={-1} className="heading focus-quiet" style={{ fontSize: 38, margin: 0, letterSpacing: "-0.03em", lineHeight: 1.1 }}>
          {copy.title}
        </h1>
        <span style={{ fontSize: 13, color: "var(--muted)" }} data-testid="library-count">
          {active.length} · {archived.length} archived
        </span>
      </div>
      <p style={{ fontSize: 13.5, color: "var(--muted)", margin: "6px 0 20px", maxWidth: "62ch", lineHeight: 1.55 }}>{copy.blurb}</p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }} role="group" aria-label="Scope filter">
        {[{ key: "all" as Filter, label: "All" }, ...SCOPES.map((s) => ({ key: s.key as Filter, label: s.label }))].map((f) => (
          <button key={f.key} type="button" className={`chip ${filter === f.key ? "chip-on" : ""}`} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      <AddCard kind={kind} onError={setPageError} />

      {pageError ? (
        <ErrorBar style={{ marginBottom: 12 }} action={{ label: "Dismiss", onClick: () => setPageError(null) }}>{pageError}</ErrorBar>
      ) : null}

      <div data-testid="library-list">
        {shown.map((s, i) => (
          <SituationCard
            key={s.id}
            item={s}
            position={i + 1}
            first={active[0]?.id === s.id}
            last={active[active.length - 1]?.id === s.id}
            pending={pending}
            onMove={(dir) =>
              start(async () => {
                const res = await callAction(() => moveItem("situation", s.id, dir));
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

function AddCard({ kind, onError }: { kind: ItemKind; onError: (e: string | null) => void }) {
  const copy = COPY[kind];
  const [name, setName] = useState("");
  const [scope, setScope] = useState<ItemScope>("global");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ok = Boolean(name.trim());

  function submit() {
    if (!ok || pending) return;
    setError(null);
    start(async () => {
      const res = await callAction(() => createSituation(kind, name, scope));
      if (res.error) {
        setError(res.error);
        return;
      }
      setName("");
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
      <h2 className="card-title" style={{ marginBottom: 12 }}>
        {copy.addTitle}
      </h2>
      <label htmlFor="add-situation" className="label-accent proof-label block">
        SITUATION
      </label>
      <input id="add-situation" className="input mt-6" value={name} onChange={(e) => setName(e.target.value)} placeholder={copy.placeholder} />
      {error ? (
        <ErrorBar style={{ marginTop: 12 }} action={{ label: "Retry", submit: true }}>{error}</ErrorBar>
      ) : null}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, marginTop: 14, flexWrap: "wrap" }}>
        <ScopeChips value={scope} onChange={setScope} />
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="hint" id="add-hint" aria-live="polite">
            {ok ? "" : "Name the situation."}
          </span>
          <button type="submit" className="btn btn-primary" aria-disabled={pending || !ok} aria-describedby={ok ? undefined : "add-hint"}>
            {pending ? "Adding…" : "Add"}
          </button>
        </div>
      </div>
    </form>
  );
}

function SituationCard({ item, position, first, last, pending, onMove }: { item: SituationItem; position: number; first: boolean; last: boolean; pending: boolean; onMove: (dir: "up" | "down") => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [scope, setScope] = useState<ItemScope>(item.scope);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<BlockedSprint[] | null>(null);
  const [busy, start] = useTransition();
  const editButton = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  useEffect(() => {
    if (wasEditing.current && !editing) editButton.current?.focus();
    wasEditing.current = editing;
  }, [editing]);
  const ok = Boolean(name.trim());

  function save() {
    if (!ok || busy) return;
    setError(null);
    start(async () => {
      if (name.trim() !== item.name) {
        const res = await callAction(() => updateSituation(item.id, name));
        if (res.error) {
          setError(res.error);
          return;
        }
      }
      if (scope !== item.scope) {
        const sc = await callAction(() => setItemScope("situation", item.id, scope));
        if (sc.error) {
          setError(sc.error);
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
      const res = await callAction(() => archiveItem("situation", item.id));
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.blocked && res.blocked.length > 0) setBlocked(res.blocked);
      else focusTitle();
    });
  }

  function remove() {
    setError(null);
    start(async () => {
      const res = await callAction(() => deleteItem("situation", item.id));
      if (res.error) setError(res.error);
      else focusTitle();
    });
  }

  return (
    <div className="card" style={{ borderRadius: 16, padding: "14px 18px", marginBottom: 10 }} data-testid="situation-item" data-item-id={item.id}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <button type="button" className="link-quiet" aria-label={`Move ${item.name} up`} disabled={first || pending || busy} onClick={() => onMove("up")} style={{ opacity: first ? 0.3 : 1, fontSize: 13, lineHeight: 1 }}>
            ↑
          </button>
          <button type="button" className="link-quiet" aria-label={`Move ${item.name} down`} disabled={last || pending || busy} onClick={() => onMove("down")} style={{ opacity: last ? 0.3 : 1, fontSize: 13, lineHeight: 1 }}>
            ↓
          </button>
        </div>
        <div style={{ width: 20, fontSize: 13, fontWeight: 700, color: "var(--muted)", paddingTop: 3 }}>
          <span className="sr-only">Rank </span>
          {position}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {!editing ? (
            <>
              <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.4 }} data-part="situation">
                {item.name}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
                <span className="option-tag" style={{ marginTop: 0 }}>
                  {scopeLabel(item.scope)}
                </span>
                <span style={{ fontSize: 10.5, color: "var(--muted)" }} data-testid="usage-line">
                  {usageLabel(item)}
                </span>
                <button
                  ref={editButton}
                  type="button"
                  className="link-quiet"
                  style={{ color: "var(--accent-ink)" }}
                  onClick={() => {
                    setName(item.name);
                    setScope(item.scope);
                    setError(null);
                    setBlocked(null);
                    setEditing(true);
                  }}
                  aria-label={`Edit ${item.name}`}
                >
                  Edit
                </button>
                {item.attached > 0 || item.used ? (
                  <button type="button" className="link-quiet" disabled={busy} onClick={archive}>
                    Archive
                  </button>
                ) : (
                  <button type="button" className="link-quiet" disabled={busy} onClick={remove}>
                    Delete
                  </button>
                )}
              </div>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              <label htmlFor={`edit-${item.id}`} className="label-accent proof-label block">
                SITUATION
              </label>
              <input id={`edit-${item.id}`} className="input input-compact mt-6" value={name} onChange={(e) => setName(e.target.value)} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
                <ScopeChips value={scope} onChange={setScope} disabled={busy} />
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className="hint" id={`edit-${item.id}-hint`} aria-live="polite">
                    {ok ? "" : "Name the situation."}
                  </span>
                  <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" aria-disabled={busy || !ok} aria-describedby={ok ? undefined : `edit-${item.id}-hint`}>
                    {busy ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            </form>
          )}
          {error ? (
            <ErrorBar style={{ marginTop: 12 }} action={{ label: "Dismiss", onClick: () => setError(null) }}>{error}</ErrorBar>
          ) : null}
          {blocked ? <BlockedList blocked={blocked} /> : null}
        </div>
      </div>
    </div>
  );
}

function ArchivedRow({ item, onError }: { item: SituationItem; onError: (e: string | null) => void }) {
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
            const res = await callAction(() => restoreItem("situation", item.id));
            onError(res.error ?? null);
            if (!res.error) focusTitle();
          })
        }
      >
        Restore
      </button>
    </div>
  );
}
