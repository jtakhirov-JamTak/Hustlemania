"use client";

import { ErrorBar } from "@/components/ErrorBar";
import { Fragment, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { archiveItem, createItem, deleteItem, moveItem, restoreItem, setItemScope, updateItem, type BlockedSprint, type ItemInput } from "@/app/(app)/actions/library";
import { areaName, isAreaKey } from "@/lib/areas";
import { callAction } from "@/lib/callAction";
import { SCOPES, type ItemKind, type ItemScope, type LibraryItem } from "@/lib/data";
import { blockedReason } from "@/lib/errors";

type Filter = "all" | ItemScope;

/** The editable parts of an item, keyed the way the inputs are labelled. */
type Fields = { when: string; name: string; note: string; then: string; recover: string };

const COPY: Record<
  ItemKind,
  { title: string; blurb: string; example: string; guidance: string; examples: ReactNode; addTitle: string; empty: string; nameLabel: string; namePlaceholder: string; addHint: string }
> = {
  cue: {
    title: "Execution cues",
    blurb: "A when → reminder or action you keep in front of you. Ranked, reusable across sprints; add the when under Edit.",
    example: 'e.g. WHEN I schedule anything → remind: ask "How much does this pay?"',
    guidance: "A good cue names a moment you will recognise (WHEN) and a reminder, question or action specific enough to act on right there (REMIND).",
    examples: (
      <div>
        WHEN I schedule anything → remind: ask “How much does this pay?”
      </div>
    ),
    addTitle: "Add an execution cue",
    empty: "No execution cues yet. Add the first one above — a sprint needs at least one.",
    nameLabel: "REMIND",
    namePlaceholder: 'ask "How much does this pay?"',
    addHint: "WHEN and REMIND are both needed.",
  },
  impediment: {
    title: "Impediments",
    blurb: "A situation, what it does to your day, and the WHEN → THEN response that answers it. Fill the rest under Edit.",
    example: "e.g. Starting late → the first block slips to noon → WHEN I notice delaying → THEN a 10-minute timer on the smallest task.",
    guidance:
      "Name a situation you will recognise when it happens, what it does to your day, and a response that is specific and feasible in that moment. RECOVERED WHEN is what you would observe, within a time window, to know you are back on track.",
    examples: (
      <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
        <li>
          <em>Missing skill</em> — SITUATION I don&apos;t know how to start the pitch deck · INTERFERES I open email instead · WHEN I catch myself opening email before the deck · THEN write the three worst slides in 15 minutes · RECOVERED WHEN three slides exist before noon.
        </li>
        <li>
          <em>Practical constraint</em> — SITUATION the gym closes before I finish work · INTERFERES sessions get skipped · WHEN it is 5 pm and I am still at my desk · THEN 20 minutes of bodyweight work at home · RECOVERED WHEN the session is logged by 9 pm.
        </li>
        <li>
          <em>Avoidance / forgetting</em> — SITUATION starting late · INTERFERES the first block slips to noon · WHEN I notice delaying · THEN a 10-minute timer on the smallest task · RECOVERED WHEN the timer is running within 10 minutes.
        </li>
      </ul>
    ),
    addTitle: "Add an impediment",
    empty: "No impediments yet. Add the first one above — a sprint needs at least one, with a WHEN → THEN → RECOVERED WHEN.",
    nameLabel: "SITUATION",
    namePlaceholder: "Starting late",
    addHint: "Name the situation first.",
  },
};

const PLACEHOLDER = {
  cueWhen: "I schedule anything",
  interferes: "the first block slips to noon",
  when: "I notice myself delaying my first work block",
  then: "I start a 10-minute timer on the smallest executable task",
  recover: "The timer is running within 10 minutes",
};

function scopeLabel(scope: ItemScope): string {
  return scope === "global" ? "Global" : isAreaKey(scope) ? areaName(scope) : scope;
}

function usageLabel(item: LibraryItem): string {
  return item.active ? "In an active sprint" : item.used ? "In sprint history" : "Unused";
}

function fieldsOf(item: LibraryItem): Fields {
  return { when: item.kind === "cue" ? (item.cue_when ?? "") : (item.proof_when ?? ""), name: item.name, note: item.explanation ?? "", then: item.proof_then ?? "", recover: item.proof_recover ?? "" };
}

function toInput(kind: ItemKind, f: Fields, scope: ItemScope): ItemInput {
  return kind === "cue"
    ? { name: f.name, explanation: f.note, scope, cueWhen: f.when }
    : { name: f.name, explanation: f.note, scope, proofWhen: f.when, proofThen: f.then, proofRecover: f.recover };
}

/** What gates Add / Save: a cue needs WHEN and REMIND, an impediment only its SITUATION. */
function ready(kind: ItemKind, f: Fields): boolean {
  return Boolean(f.name.trim()) && (kind !== "cue" || Boolean(f.when.trim()));
}

const EMPTY: Fields = { when: "", name: "", note: "", then: "", recover: "" };

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
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
        <h1 className="heading" style={{ fontSize: 38, margin: 0, letterSpacing: "-0.03em", lineHeight: 1.1 }}>
          {copy.title}
        </h1>
        <span style={{ fontSize: 13, color: "var(--muted)" }} data-testid="library-count">
          {active.length} · {archived.length} archived
        </span>
      </div>
      <p style={{ fontSize: 13.5, color: "var(--muted)", margin: "6px 0 4px", maxWidth: "62ch", lineHeight: 1.55 }}>{copy.blurb}</p>
      <p style={{ fontSize: 12, color: "var(--accent-ink)", margin: "0 0 20px", maxWidth: "62ch", lineHeight: 1.5 }}>{copy.example}</p>

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
                const res = await callAction(() => moveItem(kind, item.id, dir));
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

/** One labelled input on the part grid. */
function Part({ id, label, value, onChange, placeholder, strong }: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string; strong?: boolean }) {
  return (
    <>
      <label htmlFor={id} className="label-accent proof-label" style={{ whiteSpace: "nowrap" }}>
        {label}
      </label>
      <input id={id} className="input input-compact" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={strong ? { fontWeight: 600 } : undefined} />
    </>
  );
}

/** The editor for both Add and Edit: one input per part, the note, then the guidance line and examples. */
function Editor({ kind, idPrefix, f, onChange }: { kind: ItemKind; idPrefix: string; f: Fields; onChange: (f: Fields) => void }) {
  const copy = COPY[kind];
  const [examplesOpen, setExamplesOpen] = useState(false);
  const setF = (k: keyof Fields) => (v: string) => onChange({ ...f, [k]: v });
  return (
    <>
      <div className="proof-grid">
        {kind === "cue" ? (
          <>
            <Part id={`${idPrefix}-when`} label="WHEN" value={f.when} onChange={setF("when")} placeholder={PLACEHOLDER.cueWhen} />
            <Part id={`${idPrefix}-name`} label="REMIND" value={f.name} onChange={setF("name")} placeholder={copy.namePlaceholder} strong />
          </>
        ) : (
          <>
            <Part id={`${idPrefix}-name`} label="SITUATION" value={f.name} onChange={setF("name")} placeholder={copy.namePlaceholder} strong />
            <Part id={`${idPrefix}-note`} label="INTERFERES" value={f.note} onChange={setF("note")} placeholder={PLACEHOLDER.interferes} />
            <Part id={`${idPrefix}-when`} label="WHEN" value={f.when} onChange={setF("when")} placeholder={PLACEHOLDER.when} />
            <Part id={`${idPrefix}-then`} label="THEN" value={f.then} onChange={setF("then")} placeholder={PLACEHOLDER.then} />
            <Part id={`${idPrefix}-recover`} label="RECOVERED WHEN" value={f.recover} onChange={setF("recover")} placeholder={PLACEHOLDER.recover} />
          </>
        )}
        {kind === "cue" ? <Part id={`${idPrefix}-note`} label="NOTE" value={f.note} onChange={setF("note")} placeholder="optional" /> : null}
      </div>
      <p style={{ fontSize: 12, color: "var(--muted)", margin: "10px 0 0", lineHeight: 1.5, maxWidth: "70ch" }}>{copy.guidance}</p>
      <button type="button" className="disclosure" style={{ marginTop: 6, fontSize: 12 }} aria-expanded={examplesOpen} onClick={() => setExamplesOpen((o) => !o)}>
        <span aria-hidden="true">{examplesOpen ? "▾" : "▸"}</span> Examples
      </button>
      {examplesOpen ? <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6, lineHeight: 1.5, maxWidth: "70ch" }}>{copy.examples}</div> : null}
    </>
  );
}

function AddCard({ kind, onError }: { kind: ItemKind; onError: (e: string | null) => void }) {
  const copy = COPY[kind];
  const [f, setF] = useState<Fields>(EMPTY);
  const [scope, setScope] = useState<ItemScope>("global");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ok = ready(kind, f);

  function submit() {
    if (!ok || pending) return;
    setError(null);
    start(async () => {
      const res = await callAction(() => createItem(kind, toInput(kind, f, scope)));
      if (res.error) {
        setError(res.error);
        return;
      }
      setF(EMPTY);
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
      <Editor kind={kind} idPrefix="add" f={f} onChange={setF} />
      {error ? (
        <ErrorBar style={{ marginTop: 12 }} action={{ label: "Retry", submit: true }}>{error}</ErrorBar>
      ) : null}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, marginTop: 14, flexWrap: "wrap" }}>
        <ScopeChips value={scope} onChange={setScope} />
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="hint" id="add-hint" aria-live="polite">
            {ok ? "" : copy.addHint}
          </span>
          <button type="submit" className="btn btn-primary" aria-disabled={pending || !ok} aria-describedby={ok ? undefined : "add-hint"}>
            {pending ? "Adding…" : "Add"}
          </button>
        </div>
      </div>
    </form>
  );
}

const partLabel: React.CSSProperties = { fontWeight: 700, fontSize: 10, whiteSpace: "nowrap" };
const partValue: React.CSSProperties = { fontSize: 12.5, lineHeight: 1.45 };
const partMissing: React.CSSProperties = { ...partValue, color: "var(--muted)", fontStyle: "italic" };

function ViewParts({ item }: { item: LibraryItem }) {
  const rows: [string, string | null, string, boolean?][] =
    item.kind === "cue"
      ? [
          ["WHEN", item.cue_when, "add the moment this should fire"],
          ["REMIND", item.name, "", true],
        ]
      : [
          ["SITUATION", item.name, "", true],
          ["INTERFERES", item.explanation, "what it does to your day"],
          ["WHEN", item.proof_when, "not set"],
          ["THEN", item.proof_then, "not set"],
          ["RECOVERED", item.proof_recover, "not set"],
        ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "5px 12px", alignItems: "baseline" }}>
      {rows.map(([label, value, missing, strong]) => (
        <Fragment key={label}>
          <span className="label-accent" style={partLabel}>
            {label}
          </span>
          {value ? (
            <span style={strong ? { fontSize: 14, fontWeight: 600, lineHeight: 1.4 } : partValue} data-part={label.toLowerCase()}>
              {value}
            </span>
          ) : (
            <span style={partMissing} data-part={label.toLowerCase()} data-missing>
              {missing}
            </span>
          )}
        </Fragment>
      ))}
    </div>
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
  const [f, setF] = useState<Fields>(() => fieldsOf(item));
  const [scope, setScope] = useState<ItemScope>(item.scope);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<{ verb: string; list: BlockedSprint[] } | null>(null);
  const [busy, start] = useTransition();
  const editButton = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  useEffect(() => {
    if (wasEditing.current && !editing) editButton.current?.focus();
    wasEditing.current = editing;
  }, [editing]);
  const ok = ready(item.kind, f);

  function startEdit() {
    setF(fieldsOf(item));
    setScope(item.scope);
    setError(null);
    setBlocked(null);
    setEditing(true);
  }

  function save() {
    if (!ok || busy) return;
    setError(null);
    setBlocked(null);
    start(async () => {
      const res = await callAction(() => updateItem(item.kind, item.id, toInput(item.kind, f, scope)));
      if (res.error) {
        setError(res.error);
        return;
      }
      if (scope !== item.scope) {
        const sc = await callAction(() => setItemScope(item.kind, item.id, scope));
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
      const res = await callAction(() => archiveItem(item.kind, item.id));
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
      const res = await callAction(() => deleteItem(item.kind, item.id));
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
        <div style={{ width: 20, fontSize: 13, fontWeight: 700, color: "var(--muted)", paddingTop: 3 }}>
          <span className="sr-only">Rank </span>
          {position}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {!editing ? (
            <>
              <ViewParts item={item} />
              {item.kind === "cue" && item.explanation ? <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8, lineHeight: 1.45 }}>{item.explanation}</div> : null}
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
                <span className="option-tag" style={{ marginTop: 0 }}>
                  {scopeLabel(item.scope)}
                </span>
                <span style={{ fontSize: 10.5, color: "var(--muted)" }}>{usageLabel(item)}</span>
                <button ref={editButton} type="button" className="link-quiet" style={{ color: "var(--accent-ink)" }} onClick={startEdit} aria-label={`Edit ${item.name}`}>
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
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              <Editor kind={item.kind} idPrefix={`edit-${item.id}`} f={f} onChange={setF} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
                <ScopeChips value={scope} onChange={setScope} disabled={busy} />
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className="hint" id={`edit-${item.id}-hint`} aria-live="polite">
                    {ok ? "" : COPY[item.kind].addHint}
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
            const res = await callAction(() => restoreItem(item.kind, item.id));
            onError(res.error ?? null);
          })
        }
      >
        Restore
      </button>
    </div>
  );
}
