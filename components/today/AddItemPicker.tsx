"use client";

import { useState, useTransition } from "react";
import { addSprintItem, createItem } from "@/app/(app)/actions/library";
import { ItemPicker } from "@/components/ItemPicker";
import { callAction } from "@/lib/callAction";
import { cueSummary, proofSummary, type ItemKind, type LibraryItem } from "@/lib/data";

/**
 * Add a cue or an impediment to the sprint from the eligible library items not yet in
 * it, with inline creation (saved to the library, global scope; a cue needs its WHEN).
 * Hosts: the rail's cards and "Set up tomorrow" (F8).
 */
export function AddItemPicker({ kind, sprintId, candidates, onClose }: { kind: ItemKind; sprintId: string; candidates: LibraryItem[]; onClose: () => void }) {
  const [pick, setPick] = useState<string | null>(null);
  const [created, setCreated] = useState<LibraryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // A created item lands in `candidates` once the page revalidates; until then it lives in `created`.
  const all = [...candidates, ...created.filter((c) => !candidates.some((x) => x.id === c.id))];

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
      options={all.map((c) => ({ id: c.id, label: c.name, sub: (kind === "cue" ? cueSummary(c) : proofSummary(c)) ?? c.explanation, tag: c.scope === "global" ? "Global" : null }))}
      single
      selected={pick ? [pick] : []}
      onToggle={setPick}
      create={{
        placeholder: kind === "cue" ? "Create a new execution cue" : "Create a new impediment",
        whenLabel: kind === "cue" ? "I schedule anything" : undefined,
        onCreate: async (name, when) => {
          const res = await callAction(() => createItem(kind, { name, explanation: "", scope: "global", cueWhen: kind === "cue" ? when : undefined }));
          if (res.error || !res.id) return res.error ?? "That did not save.";
          setCreated((c) => [
            ...c,
            {
              id: res.id!,
              kind,
              name,
              explanation: null,
              scope: "global",
              rank: 0,
              archived_at: null,
              cue_when: kind === "cue" ? when.trim() || null : null,
              proof_when: null,
              proof_then: null,
              proof_recover: null,
              used: false,
              active: false,
            },
          ]);
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

/** Library items of `kind` that the sprint does not carry yet. */
export function candidatesFor(kind: ItemKind, library: { cues: LibraryItem[]; impediments: LibraryItem[] }, members: { id: string }[]): LibraryItem[] {
  return (kind === "cue" ? library.cues : library.impediments).filter((l) => !members.some((m) => m.id === l.id));
}
