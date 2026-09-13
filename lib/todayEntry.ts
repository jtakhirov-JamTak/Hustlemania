/**
 * F19: Today's entry as one box. The box sorts into the intention and a task list; Save
 * turns them into a sequence of writes the DB already knows — the intention, then one
 * task per row, in order. A re-recording replaces the intention, keeps every task that is
 * already done, archives the undone ones and creates the new list. The plan is pure so
 * the done-kept rule and the order are testable without a browser; the host runs the
 * steps one by one and resumes from the first that failed, so nothing is duplicated.
 */

export type EntryStep = { kind: "intention"; text: string } | { kind: "archive"; id: string } | { kind: "create"; id: string; text: string };

export type ExistingTask = { id: string; done: boolean };

/**
 * The client names each new task's id up front (`newId`), so a create whose response was
 * lost after the row committed is replayed by the server as the same row, never a second
 * one (audit 2026-09-13 M1).
 */
export function planEntrySteps(input: { intention: string; tasks: string[]; existing: ExistingTask[] }, newId: () => string = () => crypto.randomUUID()): EntryStep[] {
  const steps: EntryStep[] = [{ kind: "intention", text: input.intention.trim() }];
  for (const t of input.existing) if (!t.done) steps.push({ kind: "archive", id: t.id });
  for (const text of input.tasks) {
    const body = text.trim();
    if (body) steps.push({ kind: "create", id: newId(), text: body });
  }
  return steps;
}

/** The line under Re-record: what a new recording does to the tasks already on the card. */
export const RERECORD_LINE = "Done tasks stay; the rest are replaced.";

/** What a failed run has already written, so the error names it and Retry reads as "the rest". */
export function savedSoFar(steps: EntryStep[], next: number): string {
  if (next === 0) return "";
  const total = steps.filter((s) => s.kind === "create").length;
  const created = steps.slice(0, next).filter((s) => s.kind === "create").length;
  if (total === 0 || created === 0) return "The intention is saved.";
  return `The intention and ${created} of ${total} tasks are saved.`;
}
