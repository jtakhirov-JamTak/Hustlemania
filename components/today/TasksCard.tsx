"use client";

import { useRef, useState } from "react";
import { createTask, removeTask, updateTask } from "@/app/(app)/actions";
import type { Task } from "@/lib/data";
import { GENERIC_SAVE_ERROR } from "@/lib/errors";

type Row = { id: string; text: string; saved: string; done: boolean };
type Status = { kind: "idle" | "saving" | "saved" | "error"; text?: string; retry?: () => void };

/**
 * The day's optional task list (PRD §8). Rows autosave on blur; one blank row is always
 * offered while the day is open; "remove" archives. Completion is a fact about the task
 * alone — nothing here reads or changes a target, an actual or the sprint (rule 15).
 * A closed day renders read-only (rule 17); the DB refuses the write regardless.
 */
export function TasksCard({ dayId, initial, locked, lockedReason }: { dayId: string; initial: Task[]; locked: boolean; lockedReason: string }) {
  const [rows, setRows] = useState<Row[]>(initial.map((t) => ({ id: t.id, text: t.text, saved: t.text, done: t.done })));
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const draftRef = useRef<HTMLInputElement>(null);
  const adding = useRef(false);

  async function run(op: () => Promise<{ error?: string }>, retry: () => void) {
    setStatus({ kind: "saving" });
    const res = await op();
    if (res.error) {
      setStatus({ kind: "error", text: res.error, retry });
      return false;
    }
    setStatus({ kind: "saved" });
    return true;
  }

  async function addDraft(refocus: boolean) {
    const text = draft.trim();
    if (!text || adding.current) return;
    adding.current = true;
    const ok = await run(
      async () => {
        const res = await createTask(dayId, text);
        const task = res.task;
        if (res.error || !task) return { error: res.error ?? GENERIC_SAVE_ERROR };
        setRows((r) => [...r, { id: task.id, text: task.text, saved: task.text, done: task.done }]);
        setDraft("");
        return {};
      },
      () => void addDraft(refocus),
    );
    adding.current = false;
    if (ok && refocus) draftRef.current?.focus();
  }

  function saveText(id: string) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const text = row.text.trim();
    if (!text) {
      // Emptying the text is not a remove: the × is. Put the saved text back.
      setRows((r) => r.map((x) => (x.id === id ? { ...x, text: x.saved } : x)));
      return;
    }
    if (text === row.saved) return;
    void run(
      async () => {
        const res = await updateTask(id, { text });
        const task = res.task;
        if (res.error || !task) return { error: res.error ?? GENERIC_SAVE_ERROR };
        setRows((r) => r.map((x) => (x.id === id ? { ...x, text: task.text, saved: task.text } : x)));
        return {};
      },
      () => saveText(id),
    );
  }

  function toggle(id: string) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const done = !row.done;
    setRows((r) => r.map((x) => (x.id === id ? { ...x, done } : x)));
    void run(
      async () => {
        const res = await updateTask(id, { done });
        if (res.error) {
          setRows((r) => r.map((x) => (x.id === id ? { ...x, done: !done } : x)));
          return res;
        }
        return {};
      },
      () => toggle(id),
    );
  }

  function remove(id: string) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    setRows((r) => r.filter((x) => x.id !== id));
    void run(
      async () => {
        const res = await removeTask(id);
        if (res.error) {
          setRows((r) => (r.some((x) => x.id === id) ? r : [...r, row]));
          return res;
        }
        return {};
      },
      () => remove(id),
    );
  }

  const hint = locked ? lockedReason : status.kind === "saving" ? "Saving…" : status.kind === "saved" ? "Saved" : "";

  return (
    <section className="card" style={{ marginTop: 20, padding: "22px 26px" }} data-testid="tasks-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Tasks · optional</span>
        <span style={{ fontSize: 11, color: status.kind === "error" ? "var(--under)" : "var(--muted)" }} data-testid="tasks-hint">
          {hint}
        </span>
      </div>

      {rows.length === 0 && locked ? (
        <div style={{ fontSize: 13, color: "var(--muted)", padding: "10px 0" }}>No tasks were written for this day.</div>
      ) : null}

      {rows.map((row, i) => (
        <div key={row.id} className="task-row" data-testid="task-row" data-done={row.done}>
          <button
            type="button"
            role="checkbox"
            aria-checked={row.done}
            aria-label={`Done: ${row.saved}`}
            disabled={locked}
            onClick={() => toggle(row.id)}
            className={`option-mark task-mark ${row.done ? "task-mark-on" : ""}`}
          >
            {row.done ? "✓" : ""}
          </button>
          <input
            className="task-text"
            aria-label={`Task ${i + 1}`}
            value={row.text}
            disabled={locked}
            data-done={row.done}
            onChange={(e) => setRows((r) => r.map((x) => (x.id === row.id ? { ...x, text: e.target.value } : x)))}
            onBlur={() => saveText(row.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
          {locked ? null : (
            <button type="button" className="task-remove" aria-label={`Remove task: ${row.saved}`} onClick={() => remove(row.id)}>
              ×
            </button>
          )}
        </div>
      ))}

      {locked ? null : (
        <div className="task-row" data-testid="task-draft">
          <span className="option-mark task-mark" aria-hidden="true" style={{ opacity: 0.45 }} />
          <input
            ref={draftRef}
            className="task-text"
            aria-label="New task"
            placeholder="Add a task"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void addDraft(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void addDraft(true);
              }
            }}
          />
        </div>
      )}

      {status.kind === "error" ? (
        <div role="alert" className="error-bar" style={{ marginTop: 10 }}>
          <span>{status.text}</span>
          <button type="button" className="link-quiet" style={{ color: "inherit", fontWeight: 600 }} onClick={() => status.retry?.()}>
            Retry
          </button>
        </div>
      ) : null}

      {locked ? null : (
        <button type="button" className="btn btn-ghost" style={{ marginTop: 12 }} onClick={() => draftRef.current?.focus()}>
          Add task
        </button>
      )}
    </section>
  );
}
