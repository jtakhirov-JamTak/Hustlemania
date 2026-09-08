"use client";

import { useState, useTransition } from "react";
import { finishSprint } from "@/app/(app)/actions/review";
import { ErrorBar } from "@/components/ErrorBar";
import { callAction } from "@/lib/callAction";

/**
 * F10: the Today slot once all 14 days have passed. Nothing closes a sprint on a page
 * load, so backfill stays open on the rows above until this is pressed — the UI and the
 * DB agree on what "open" means (PRD §9).
 */
export function FinishSprint({ sprintId, closedCount }: { sprintId: string; closedCount: number }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="j-finish" data-testid="sprint-ended">
      <div>
        <span className="j-finish-text">
          <strong>All 14 days have passed.</strong> Add any missed day above, then finish the sprint. Unclosed days stay as they are once it is
          finished.
        </span>
        <div className="j-finish-meta">{closedCount} of 14 days closed</div>
        {error ? <ErrorBar className="mt-10">{error}</ErrorBar> : null}
      </div>
      <button
        type="button"
        className="btn btn-primary nowrap"
        aria-disabled={pending}
        data-testid="finish-sprint"
        onClick={() => {
          if (pending) return;
          setError(null);
          start(async () => {
            const res = await callAction(() => finishSprint(sprintId));
            if (res.error) setError(res.error);
          });
        }}
      >
        {pending ? "Finishing…" : "Finish the sprint"}
      </button>
    </div>
  );
}
