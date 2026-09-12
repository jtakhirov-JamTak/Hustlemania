"use client";

import { useState, useTransition } from "react";
import { addSprintItem, createItem, createSituation } from "@/app/(app)/actions/library";
import { ItemPicker } from "@/components/ItemPicker";
import type { SituationOption } from "@/components/SituationPicker";
import { callAction } from "@/lib/callAction";
import { appliesTo, cueSummary, joinBlocker, proofSummary, type ItemKind, type LibraryItem } from "@/lib/data";

/**
 * Add a cue or an impediment to the sprint from the eligible library items not yet in
 * it, with inline creation (saved to the library, global scope; a cue needs its WHEN,
 * both need at least one situation — F15). Hosts: the rail's cards and "Set up
 * tomorrow" (F8).
 */
export function AddItemPicker({
  kind,
  sprintId,
  candidates,
  situations,
  onClose,
}: {
  kind: ItemKind;
  sprintId: string;
  candidates: LibraryItem[];
  /** The live situations of this kind, for the inline create's APPLIES TO ticks. */
  situations: SituationOption[];
  onClose: () => void;
}) {
  const [pick, setPick] = useState<string | null>(null);
  const [created, setCreated] = useState<LibraryItem[]>([]);
  const [options, setOptions] = useState<SituationOption[]>(situations);
  const [ticked, setTicked] = useState<string[]>([]);
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

  const blockerLine = (c: LibraryItem) =>
    joinBlocker(c) === "situation" ? "No situation yet — add one on its library page" : joinBlocker(c) === "response" ? "Needs a THEN and a RECOVERED WHEN on the Impediments page" : null;

  return (
    <ItemPicker
      title={kind === "cue" ? "Add an execution cue" : "Add an impediment"}
      blurb={
        kind === "cue"
          ? "From your library, or create one — it is saved to the library too."
          : "From your library, or create one — it is saved to the library too. Its THEN and RECOVERED WHEN can be added on the Impediments page before it joins."
      }
      options={all.map((c) => ({
        id: c.id,
        label: c.name,
        sub: blockerLine(c) ?? [kind === "cue" ? cueSummary(c) : proofSummary(c), appliesTo(c) && `applies to: ${appliesTo(c)}`].filter(Boolean).join(" · ") ?? c.explanation,
        tag: c.scope === "global" ? "Global" : null,
        disabled: joinBlocker(c) !== null,
      }))}
      single
      selected={pick ? [pick] : []}
      onToggle={setPick}
      create={{
        placeholder: kind === "cue" ? "Create a new execution cue" : "Create a new impediment",
        whenLabel: kind === "cue" ? "I schedule anything" : undefined,
        situations: {
          kind,
          options,
          selected: ticked,
          onToggle: (id) => setTicked((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id])),
          onCreate: async (name) => {
            const res = await callAction(() => createSituation(kind, name, "global"));
            if (res.error || !res.id) return res.error ?? "That did not save.";
            setOptions((o) => [...o, { id: res.id!, name }]);
            setTicked((t) => [...t, res.id!]);
            return null;
          },
        },
        onCreate: async (name, when) => {
          const res = await callAction(() => createItem(kind, { name, explanation: "", scope: "global", cueWhen: kind === "cue" ? when : undefined, situationIds: ticked }));
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
              proof_then: null,
              proof_recover: null,
              situations: options.filter((s) => ticked.includes(s.id)),
              used: false,
              active: false,
            },
          ]);
          // A cue can join at once; an impediment still needs its response (F15 rule 6).
          if (kind === "cue") setPick(res.id);
          setTicked([]);
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
