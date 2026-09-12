"use client";

import { ErrorBar } from "@/components/ErrorBar";
import { Fragment, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { archiveItem, createItem, createSituations, deleteItem, moveItem, restoreItem, setItemScope, updateItem, type BlockedSprint, type ItemInput } from "@/app/(app)/actions/library";
import { areaName, isAreaKey } from "@/lib/areas";
import { onRadioArrowKeys } from "@/components/radioKeys";
import { CaptureBox, focusMissingPart, type CapturePhase } from "@/components/CaptureBox";
import { SituationPicker, type SituationOption } from "@/components/SituationPicker";
import { callAction } from "@/lib/callAction";
import { type CaptureKind, emptyParts, missingPart, partText, type Parts } from "@/lib/capture";
import { SCOPES, type ItemKind, type ItemScope, type LibraryItem, type SituationItem } from "@/lib/data";
import { blockedReason } from "@/lib/errors";

type Filter = "all" | ItemScope;

/** F17: the item's parts (the capture kind's keys) plus the APPLIES TO ticks. */
type Fields = { parts: Parts; situationIds: string[] };

const COPY: Record<
  ItemKind,
  { title: string; blurb: string; example: string; guidance: string; examples: ReactNode; addTitle: string; empty: string; situationHint: string }
> = {
  cue: {
    title: "Execution cues",
    blurb: "A when → reminder or action you keep in front of you, and the situations it applies to. Ranked, reusable across sprints.",
    example: 'e.g. WHEN I schedule anything → remind: ask "How much does this pay?" · applies to: Scheduling',
    guidance:
      "Say it in one breath — the moment you will recognise (WHEN) and a reminder, question or action specific enough to act on right there (REMIND): “When I schedule anything, remind me to ask how much this pays.” Then tick the situations it applies to — one cue can cover several.",
    examples: (
      <div>
        WHEN I schedule anything → remind: ask “How much does this pay?” · applies to: <em>Scheduling</em>, <em>A client call</em>
      </div>
    ),
    addTitle: "Add an execution cue",
    empty: "No execution cues yet. Add the first one above — a cue needs a WHEN, a REMIND and at least one situation.",
    situationHint: "Tick at least one situation.",
  },
  impediment: {
    title: "Impediments",
    blurb: "A moment you will recognise (WHEN), the THEN → RECOVERED WHEN response that answers it — and the situations it applies to.",
    example: "e.g. WHEN I notice delaying → THEN a 10-minute timer on the smallest task · RECOVERED WHEN the timer is running within 10 minutes · applies to: Starting late.",
    guidance:
      "Say it in one breath — the moment you will recognise (WHEN), a response that is specific and feasible right there (THEN), and what you would observe, within a time window, to know you are back on track (RECOVERED WHEN): “When I notice myself delaying, then I start a 10-minute timer. Recovered when the timer is running within 10 minutes.” Then tick the situations it applies to — one response usually covers several.",
    examples: (
      <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
        <li>
          <em>Missing skill</em> — WHEN I catch myself opening email before the deck · THEN write the three worst slides in 15 minutes · RECOVERED WHEN three slides exist before noon · applies to: I don&apos;t know how to start the pitch deck.
        </li>
        <li>
          <em>Practical constraint</em> — WHEN it is 5 pm and I am still at my desk · THEN 20 minutes of bodyweight work at home · RECOVERED WHEN the session is logged by 9 pm · applies to: The gym closes before I finish work.
        </li>
        <li>
          <em>Avoidance / forgetting</em> — WHEN I notice delaying · THEN a 10-minute timer on the smallest task · RECOVERED WHEN the timer is running within 10 minutes · applies to: Starting late, Late night.
        </li>
      </ul>
    ),
    addTitle: "Add an impediment",
    empty: "No impediments yet. Add the first one above — a sprint needs at least one, with a THEN → RECOVERED WHEN and a situation.",
    situationHint: "Tick at least one situation.",
  },
};

const CAPTURE_KIND: Record<ItemKind, CaptureKind> = { cue: "cue", impediment: "impediment" };

function scopeLabel(scope: ItemScope): string {
  return scope === "global" ? "Global" : isAreaKey(scope) ? areaName(scope) : scope;
}

function usageLabel(item: LibraryItem): string {
  if (item.situations.length === 0) return "Blocked · no situation";
  return item.active ? "In an active sprint" : item.used ? "In sprint history" : "Unused";
}

function fieldsOf(item: LibraryItem): Fields {
  return {
    parts:
      item.kind === "cue"
        ? { when: item.cue_when ?? "", remind: item.name }
        : { when: item.name, then: item.proof_then ?? "", recovered_when: item.proof_recover ?? "" },
    situationIds: item.situations.map((s) => s.id),
  };
}

function toInput(kind: ItemKind, f: Fields, scope: ItemScope): ItemInput {
  const p = f.parts;
  return kind === "cue"
    ? { name: partText(p, "remind"), scope, cueWhen: partText(p, "when"), situationIds: f.situationIds }
    : { name: partText(p, "when"), scope, proofThen: partText(p, "then"), proofRecover: partText(p, "recovered_when"), situationIds: f.situationIds };
}

/** What gates Add / Save: every required part (a cue's WHEN and REMIND, an impediment's WHEN) and at least one situation (F15); null when ready. */
function saveHint(kind: ItemKind, f: Fields, phase: CapturePhase): string | null {
  if (phase === "parsing") return "Reading your words…";
  const missing = missingPart(CAPTURE_KIND[kind], f.parts);
  if (missing) return missing.hint;
  if (f.situationIds.length === 0) return COPY[kind].situationHint;
  return null;
}

const empty = (kind: ItemKind): Fields => ({ parts: emptyParts(CAPTURE_KIND[kind]), situationIds: [] });

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

/** Archive, Delete and Restore unmount the pressed button; the page title takes focus (SC 2.4.3). */
function focusLibraryTitle() {
  document.getElementById("library-title")?.focus();
}

export function LibraryPage({ kind, items, situations }: { kind: ItemKind; items: LibraryItem[]; situations: SituationItem[] }) {
  const copy = COPY[kind];
  const [filter, setFilter] = useState<Filter>("all");
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // The live situations offered by every editor on the page; ones created inline join the list at once.
  const [options, setOptions] = useState<SituationOption[]>(() => situations.filter((s) => s.archived_at === null).map((s) => ({ id: s.id, name: s.name })));

  const active = items.filter((i) => i.archived_at === null);
  const archived = items.filter((i) => i.archived_at !== null);
  const shown = filter === "all" ? active : active.filter((i) => i.scope === filter);

  /** Saves situations named inside an editor (a spoken list) and adds them to every editor's options; the caller ticks them. */
  const createOptions = async (names: string[]): Promise<{ ids: string[] } | { error: string }> => {
    const res = await callAction(() => createSituations(names, "global"));
    if (res.error || !res.ids) return { error: res.error ?? "That did not save." };
    const ids = res.ids;
    setOptions((o) => [...o, ...ids.map((id, i) => ({ id, name: names[i] ?? "" })).filter((n) => !o.some((x) => x.id === n.id))]);
    return { ids };
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
        <h1 id="library-title" tabIndex={-1} className="heading focus-quiet" style={{ fontSize: 38, margin: 0, letterSpacing: "-0.03em", lineHeight: 1.1 }}>
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

      <AddCard kind={kind} options={options} onCreateOptions={createOptions} onError={setPageError} />

      {pageError ? (
        <ErrorBar style={{ marginBottom: 12 }} action={{ label: "Dismiss", onClick: () => setPageError(null) }}>{pageError}</ErrorBar>
      ) : null}

      <div data-testid="library-list">
        {shown.map((item, i) => (
          <ItemCard
            key={item.id}
            item={item}
            options={options}
            onCreateOptions={createOptions}
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
        <button key={s.key} type="button" role="radio" aria-checked={value === s.key} className={`chip ${value === s.key ? "chip-on" : ""}`} disabled={disabled} onClick={() => onChange(s.key)} onKeyDown={onRadioArrowKeys}>
          {s.label}
        </button>
      ))}
    </div>
  );
}

type CreateOptions = (names: string[]) => Promise<{ ids: string[] } | { error: string }>;

/**
 * The editor for both Add and Edit (F17): one box sorted into the parts (Add), or the parts
 * with Re-record (Edit); the situations under them; then the guidance line and examples.
 */
function Editor({
  kind,
  idPrefix,
  mode,
  f,
  onChange,
  onTick,
  onPhase,
  options,
  onCreateOptions,
  disabled,
}: {
  kind: ItemKind;
  idPrefix: string;
  mode: "capture" | "fields";
  f: Fields;
  onChange: (f: Fields) => void;
  /** Ticks situations by id against the latest fields (a create resolves after `f` was captured). */
  onTick: (ids: string[]) => void;
  onPhase: (phase: CapturePhase) => void;
  options: SituationOption[];
  onCreateOptions: CreateOptions;
  disabled?: boolean;
}) {
  const copy = COPY[kind];
  const [examplesOpen, setExamplesOpen] = useState(false);
  return (
    <>
      <CaptureBox kind={CAPTURE_KIND[kind]} idPrefix={idPrefix} mode={mode} parts={f.parts} onParts={(parts) => onChange({ ...f, parts })} onPhase={onPhase} disabled={disabled}>
        <SituationPicker
          idPrefix={idPrefix}
          options={options}
          selected={f.situationIds}
          onToggle={(id) => onChange({ ...f, situationIds: f.situationIds.includes(id) ? f.situationIds.filter((x) => x !== id) : [...f.situationIds, id] })}
          onCreate={async (names) => {
            const res = await onCreateOptions(names);
            if ("error" in res) return res.error;
            onTick(res.ids);
            return null;
          }}
        />
      </CaptureBox>
      <p style={{ fontSize: 12, color: "var(--muted)", margin: "10px 0 0", lineHeight: 1.5, maxWidth: "70ch" }}>{copy.guidance}</p>
      <button type="button" className="disclosure" style={{ marginTop: 6, fontSize: 12 }} aria-expanded={examplesOpen} onClick={() => setExamplesOpen((o) => !o)}>
        <span aria-hidden="true">{examplesOpen ? "▾" : "▸"}</span> Examples
      </button>
      {examplesOpen ? <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6, lineHeight: 1.5, maxWidth: "70ch" }}>{copy.examples}</div> : null}
    </>
  );
}

function AddCard({
  kind,
  options,
  onCreateOptions,
  onError,
}: {
  kind: ItemKind;
  options: SituationOption[];
  onCreateOptions: CreateOptions;
  onError: (e: string | null) => void;
}) {
  const copy = COPY[kind];
  const [f, setF] = useState<Fields>(() => empty(kind));
  const [phase, setPhase] = useState<CapturePhase>("idle");
  const [key, setKey] = useState(0);
  const [scope, setScope] = useState<ItemScope>("global");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const hint = saveHint(kind, f, phase);
  const ok = hint === null;

  function submit() {
    if (pending) return;
    if (!ok) {
      focusMissingPart("add", CAPTURE_KIND[kind], f.parts);
      return;
    }
    setError(null);
    start(async () => {
      const res = await callAction(() => createItem(kind, toInput(kind, f, scope)));
      if (res.error) {
        setError(res.error);
        return;
      }
      setF(empty(kind));
      setPhase("idle");
      setKey((k) => k + 1);
      onError(null);
    });
  }

  const tick = (ids: string[]) => setF((p) => ({ ...p, situationIds: [...p.situationIds, ...ids.filter((id) => !p.situationIds.includes(id))] }));

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
      <Editor key={key} kind={kind} idPrefix="add" mode="capture" f={f} onChange={setF} onTick={tick} onPhase={setPhase} options={options} onCreateOptions={onCreateOptions} disabled={pending} />
      {error ? (
        <ErrorBar style={{ marginTop: 12 }} action={{ label: "Retry", submit: true }}>{error}</ErrorBar>
      ) : null}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, marginTop: 14, flexWrap: "wrap" }}>
        <ScopeChips value={scope} onChange={setScope} />
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="hint" id="add-hint" aria-live="polite">
            {hint ?? ""}
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
  const applies = item.situations.map((s) => s.name).join(", ") || null;
  const rows: [string, string | null, string, boolean?][] =
    item.kind === "cue"
      ? [
          ["WHEN", item.cue_when, "add the moment this should fire"],
          ["REMIND", item.name, "", true],
          ["APPLIES TO", applies, "no situation yet — add one under Edit; it cannot join a sprint until then"],
        ]
      : [
          ["WHEN", item.name, "", true],
          ["THEN", item.proof_then, "not set"],
          ["RECOVERED", item.proof_recover, "not set"],
          ["APPLIES TO", applies, "no situation yet — add one under Edit; it cannot join a sprint until then"],
        ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "5px 12px", alignItems: "baseline" }}>
      {rows.map(([label, value, missing, strong]) => (
        <Fragment key={label}>
          <span className="label-accent" style={partLabel}>
            {label}
          </span>
          {value ? (
            <span style={strong ? { fontSize: 14, fontWeight: 600, lineHeight: 1.4 } : partValue} data-part={label.toLowerCase().replace(" ", "-")}>
              {value}
            </span>
          ) : (
            <span style={partMissing} data-part={label.toLowerCase().replace(" ", "-")} data-missing>
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
  options,
  onCreateOptions,
  position,
  first,
  last,
  pending,
  onMove,
}: {
  item: LibraryItem;
  options: SituationOption[];
  onCreateOptions: CreateOptions;
  position: number;
  first: boolean;
  last: boolean;
  pending: boolean;
  onMove: (dir: "up" | "down") => void;
}) {
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState<Fields>(() => fieldsOf(item));
  const [phase, setPhase] = useState<CapturePhase>("manual");
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
  const hint = saveHint(item.kind, f, phase);
  const ok = hint === null;
  const tick = (ids: string[]) => setF((p) => ({ ...p, situationIds: [...p.situationIds, ...ids.filter((id) => !p.situationIds.includes(id))] }));

  function startEdit() {
    setF(fieldsOf(item));
    setPhase("manual");
    setScope(item.scope);
    setError(null);
    setBlocked(null);
    setEditing(true);
  }

  function save() {
    if (busy) return;
    if (!ok) {
      focusMissingPart(`edit-${item.id}`, CAPTURE_KIND[item.kind], f.parts);
      return;
    }
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
      else focusLibraryTitle();
    });
  }

  function remove() {
    setError(null);
    start(async () => {
      const res = await callAction(() => deleteItem(item.kind, item.id));
      if (res.error) setError(res.error);
      else focusLibraryTitle();
    });
  }

  return (
    <div
      className="card"
      style={{ borderRadius: 16, padding: "16px 18px", marginBottom: 10 }}
      data-testid="library-item"
      data-item-id={item.id}
      data-blocked={item.situations.length === 0 ? "true" : undefined}
    >
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
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
                <span className="option-tag" style={{ marginTop: 0 }}>
                  {scopeLabel(item.scope)}
                </span>
                <span style={{ fontSize: 10.5, color: item.situations.length === 0 ? "var(--accent-ink)" : "var(--muted)" }} data-testid="usage-line">
                  {usageLabel(item)}
                </span>
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
              <Editor kind={item.kind} idPrefix={`edit-${item.id}`} mode="fields" f={f} onChange={setF} onTick={tick} onPhase={setPhase} options={options} onCreateOptions={onCreateOptions} disabled={busy} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
                <ScopeChips value={scope} onChange={setScope} disabled={busy} />
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className="hint" id={`edit-${item.id}-hint`} aria-live="polite">
                    {hint ?? ""}
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
            if (!res.error) focusLibraryTitle();
          })
        }
      >
        Restore
      </button>
    </div>
  );
}
