"use client";

import { ErrorBar } from "@/components/ErrorBar";
import { useState, useTransition } from "react";
import { addSprintItem, createItem, removeSprintItem } from "@/app/(app)/actions/library";
import { ItemPicker } from "@/components/ItemPicker";
import { callAction } from "@/lib/callAction";
import type { ItemKind, LibraryItem, SprintItems } from "@/lib/data";

/**
 * "▸ Other impediments (n) · Execution cues (n)", expanding to two cards with Remove /
 * Add. Add opens the picker over the eligible library items not yet in the sprint,
 * with inline creation (saved to the library, global scope).
 */
export function SprintItemsRow({
  sprintId,
  items,
  library,
  locked,
}: {
  sprintId: string;
  items: SprintItems;
  library: { cues: LibraryItem[]; impediments: LibraryItem[] };
  locked: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState<ItemKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const others = items.impediments.filter((i) => !i.is_highest);

  function remove(kind: ItemKind, id: string) {
    setError(null);
    start(async () => {
      const res = await callAction(() => removeSprintItem(sprintId, kind, id));
      if (res.error) setError(res.error);
    });
  }

  return (
    <section style={{ marginTop: 20 }} data-testid="sprint-items">
      <button type="button" className="disclosure" aria-expanded={open} onClick={() => setOpen((o) => !o)} style={{ fontSize: 13 }} data-testid="sprint-items-toggle">
        <span aria-hidden="true">{open ? "▾" : "▸"}</span> Other impediments ({others.length}) · Execution cues ({items.cues.length})
      </button>
      {open ? (
        <>
          {error ? (
            <ErrorBar style={{ marginTop: 12 }} action={{ label: "Dismiss", onClick: () => setError(null) }}>{error}</ErrorBar>
          ) : null}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 12 }} data-cols>
            <ItemsCard
              title="Other impediments"
              count={`${items.impediments.length} of 5 in sprint`}
              rows={others.map((i) => ({ id: i.id, name: i.name, sub: i.proof_when && i.proof_then ? `WHEN ${i.proof_when} · THEN ${i.proof_then}` : i.explanation }))}
              addLabel="Add impediment"
              canAdd={!locked && items.impediments.length < 5}
              canRemove={!locked}
              pending={pending}
              onRemove={(id) => remove("impediment", id)}
              onAdd={() => setAdding("impediment")}
              emptyLine="Only the highest impediment is in this sprint."
            />
            <ItemsCard
              title="Execution cues"
              count={`${items.cues.length} of 3 in sprint`}
              rows={items.cues.map((c) => ({ id: c.id, name: c.name, sub: c.explanation }))}
              addLabel="Add cue"
              canAdd={!locked && items.cues.length < 3}
              canRemove={!locked && items.cues.length > 1}
              pending={pending}
              onRemove={(id) => remove("cue", id)}
              onAdd={() => setAdding("cue")}
              emptyLine="No cues in this sprint."
            />
          </div>
        </>
      ) : null}
      {adding ? (
        <AddPicker
          kind={adding}
          sprintId={sprintId}
          candidates={(adding === "cue" ? library.cues : library.impediments).filter((l) => !(adding === "cue" ? items.cues : items.impediments).some((m) => m.id === l.id))}
          onClose={() => setAdding(null)}
        />
      ) : null}
    </section>
  );
}

function ItemsCard({
  title,
  count,
  rows,
  addLabel,
  canAdd,
  canRemove,
  pending,
  onRemove,
  onAdd,
  emptyLine,
}: {
  title: string;
  count: string;
  rows: { id: string; name: string; sub: string | null }[];
  addLabel: string;
  canAdd: boolean;
  canRemove: boolean;
  pending: boolean;
  onRemove: (id: string) => void;
  onAdd: () => void;
  emptyLine: string;
}) {
  return (
    <div className="card" style={{ padding: "22px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <h2 className="card-title">{title}</h2>
        <span style={{ fontSize: 11, color: "var(--muted)" }}>{count}</span>
      </div>
      {rows.length === 0 ? <div style={{ fontSize: 12.5, color: "var(--muted)", padding: "8px 0" }}>{emptyLine}</div> : null}
      {rows.map((r) => (
        <div key={r.id} style={{ padding: "11px 0", borderTop: "1px solid var(--divider)" }} data-testid="sprint-item" data-item-id={r.id}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
            <span style={{ fontSize: 14, lineHeight: 1.4 }}>{r.name}</span>
            {canRemove ? (
              <button type="button" className="link-quiet" style={{ fontSize: 11.5, whiteSpace: "nowrap" }} disabled={pending} onClick={() => onRemove(r.id)} aria-label={`Remove ${r.name}`}>
                Remove
              </button>
            ) : null}
          </div>
          {r.sub ? <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3, lineHeight: 1.45 }}>{r.sub}</div> : null}
        </div>
      ))}
      {canAdd ? (
        <button type="button" className="btn btn-ghost" style={{ marginTop: 12, color: "var(--accent-ink)" }} onClick={onAdd}>
          {addLabel}
        </button>
      ) : null}
    </div>
  );
}

function AddPicker({ kind, sprintId, candidates, onClose }: { kind: ItemKind; sprintId: string; candidates: LibraryItem[]; onClose: () => void }) {
  const [pick, setPick] = useState<string | null>(null);
  const [created, setCreated] = useState<LibraryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const all = [...candidates, ...created];

  function done() {
    if (!pick) return;
    setError(null);
    start(async () => {
      const res = await callAction(() => addSprintItem(sprintId, kind, pick));
      if (res.error) {
        setError(res.error);
        return;
      }
      onClose();
    });
  }

  return (
    <ItemPicker
      title={kind === "cue" ? "Add an execution cue" : "Add an impediment"}
      blurb={kind === "cue" ? "From your library, or create one — it is saved to the library too." : "From your library, or create one — it is saved to the library too. A proof point can be added later on the Impediments page."}
      options={all.map((c) => ({ id: c.id, label: c.name, sub: c.explanation, tag: c.scope === "global" ? "Global" : null }))}
      single
      selected={pick ? [pick] : []}
      onToggle={setPick}
      create={{
        placeholder: kind === "cue" ? "Create a new execution cue" : "Create a new impediment",
        onCreate: async (name) => {
          const res = await callAction(() => createItem(kind, { name, explanation: "", scope: "global" }));
          if (res.error || !res.id) return res.error ?? "That did not save.";
          setCreated((c) => [...c, { id: res.id!, kind, name, explanation: null, scope: "global", rank: 0, archived_at: null, proof_when: null, proof_then: null, used: false }]);
          setPick(res.id);
          return null;
        },
      }}
      hint={!pick ? "Pick one, or create it." : null}
      error={error}
      doneLabel="Add to sprint"
      pending={pending}
      onDone={done}
      onCancel={onClose}
      emptyLine="Nothing eligible in the library yet — create one below."
    />
  );
}
