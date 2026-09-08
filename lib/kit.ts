import type { AreaKit } from "@/lib/data";

/**
 * The Area kit: what the last postmortem in an Area decided to carry forward. It is
 * read from `review_decisions` (there is no kit table — a second copy would drift from
 * the review that wrote it), and it does two jobs: the postmortem previews it as the
 * reader edits, and the next New Sprint pre-checks it.
 */

/**
 * The kit the postmortem previews, derived from the decisions currently on screen.
 * Dropping an item removes it; promoting one makes it the highest. Nothing else moves.
 */
export function kitFrom(
  decisions: Record<string, string>,
  items: { impediments: { id: string; name: string }[]; cues: { id: string; name: string }[] },
): { highest: string | null; watching: string[]; cues: string[] } {
  const decisionOf = (id: string) => decisions[id] ?? "keep";
  const keptImps = items.impediments.filter((i) => decisionOf(i.id) !== "drop");
  const highest = keptImps.find((i) => decisionOf(i.id) === "highest") ?? null;
  return {
    highest: highest?.name ?? null,
    watching: keptImps.filter((i) => i.id !== highest?.id).map((i) => i.name),
    cues: items.cues.filter((c) => decisionOf(c.id) !== "drop").map((c) => c.name),
  };
}

export type Prefill = {
  impedimentIds: string[];
  highestId: string | null;
  cueIds: string[];
  focusId: string | null;
};

export const NO_PREFILL: Prefill = { impedimentIds: [], highestId: null, cueIds: [], focusId: null };

/**
 * What step 4 starts from. The kit is already filtered for archived items server-side
 * (rule 24); this filters again against the library the wizard actually holds, which is
 * scoped to the Area — a global item promoted in Health must not arrive pre-checked in
 * a Wealth sprint if its scope no longer covers it.
 *
 * Rules 3–4 cap the picks at five impediments and three cues, so an over-long kit is
 * trimmed rather than handed to `start_sprint` for rejection.
 */
export function prefillFromKit(
  kit: AreaKit | null | undefined,
  library: { cues: { id: string }[]; impediments: { id: string }[] },
): Prefill {
  if (!kit) return NO_PREFILL;
  const liveImps = new Set(library.impediments.map((i) => i.id));
  const liveCues = new Set(library.cues.map((c) => c.id));

  // The promoted impediment leads, so it survives the cap.
  const imps = kit.impedimentIds.filter((id) => liveImps.has(id));
  const ordered = kit.highestId && imps.includes(kit.highestId) ? [kit.highestId, ...imps.filter((id) => id !== kit.highestId)] : imps;
  const impedimentIds = ordered.slice(0, 5);
  const highestId = kit.highestId && impedimentIds.includes(kit.highestId) ? kit.highestId : null;

  const cueIds = kit.cueIds.filter((id) => liveCues.has(id)).slice(0, 3);
  return { impedimentIds, highestId, cueIds, focusId: cueIds[0] ?? null };
}
