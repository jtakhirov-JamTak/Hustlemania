import Link from "next/link";
import { areaName, type AreaKey } from "@/lib/areas";
import { COMPLETION_LABEL, type ReviewSummary } from "@/lib/data";
import { formatAmount, formatNumber, type Measured } from "@/lib/format";

/**
 * F10, v8 README §Review gate: what a finished, unreviewed sprint leaves on its Area.
 * The next sprint here is blocked by `start_sprint` (rule 26), so the card is the only
 * place that explains the block before the wizard refuses.
 */
export function ReviewGate({
  sprintId,
  area,
  outcome,
  status,
  summary,
  measured,
}: {
  sprintId: string;
  area: AreaKey;
  outcome: string;
  status: string;
  summary: ReviewSummary | null;
  measured: Measured;
}) {
  const name = areaName(area);
  return (
    <div className="card g-card" data-testid="review-gate">
      <span className="t-kicker">
        {name} · {COMPLETION_LABEL[status] ?? "sprint ended"}
      </span>
      <h1 className="heading g-title">{outcome}</h1>
      <p className="g-copy">
        This sprint has ended. The next {name} sprint stays locked until its postmortem is finished — what hurt, what helped, one lesson, and what
        to carry forward.
      </p>
      <div className="g-actions">
        <Link href={`/insights/reviews/${sprintId}`} className="btn btn-primary btn-link">
          Open the postmortem
        </Link>
        {summary ? (
          <span className="g-hint" data-testid="gate-meta">
            {formatNumber(measured, Number(summary.total))} of {formatAmount(measured, Number(summary.goal))} · {summary.met ? "met" : "under"} ·{" "}
            {summary.closed_days} of 14 days closed
          </span>
        ) : null}
      </div>
    </div>
  );
}
