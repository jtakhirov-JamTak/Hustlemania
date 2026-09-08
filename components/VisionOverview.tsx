"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { replaceVision, reviewVision, type Verdict } from "@/app/(app)/actions/vision";
import { ErrorBar } from "@/components/ErrorBar";
import { TwoTap } from "@/components/TwoTap";
import { callAction } from "@/lib/callAction";
import { areaName } from "@/lib/areas";
import { formatIsoDate, stampDate } from "@/lib/dates";
import { visionSteps, type ActiveVision, type PreviousVision, type VisionSprintRow } from "@/lib/data";
import { formatNumber } from "@/lib/format";
import { daysBetween, localDateIn } from "@/lib/sprintDay";

const DATE: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
const MONTH: Intl.DateTimeFormatOptions = { month: "short", year: "numeric" };

/**
 * F9: the saved vision — headline, meta, Edit · Review vision · Replace, `n of 3 steps`,
 * the three cards, the Library card and "Sprints behind this vision", previous visions
 * folded underneath. Review opens a card; both verdicts write a dated row.
 */
export function VisionOverview({
  active,
  sprints,
  previous,
  counts,
}: {
  active: ActiveVision;
  sprints: VisionSprintRow[];
  previous: PreviousVision[];
  counts: { cues: number; impediments: number };
}) {
  const router = useRouter();
  const [review, setReview] = useState(false);
  const [note, setNote] = useState("");
  const [showPrevious, setShowPrevious] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { vision, obstacle, latestReview } = active;
  const steps = visionSteps(active);
  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const daysLeft = daysBetween(localDateIn(tz, new Date()), vision.deadline);
  const deadlineText = formatIsoDate(vision.deadline, DATE);
  const ruleComplete = Boolean(obstacle && obstacle.proof_when && obstacle.proof_then && obstacle.proof_recover);

  function send(verdict: Verdict) {
    setError(null);
    start(async () => {
      const res = await callAction(() => reviewVision(verdict, note));
      if (res.error) {
        setError(res.error);
        return;
      }
      setNote("");
      if (verdict === "needs_changes") {
        router.push("/vision?step=1");
        return;
      }
      setReview(false);
      router.refresh();
    });
  }

  function replace() {
    setError(null);
    start(async () => {
      const res = await callAction(() => replaceVision());
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div data-testid="vision-overview">
      <div className="v-head">
        <div className="label-accent">One to two years from now</div>
        <span className="v-head-meta" data-testid="vision-meta">
          Saved {stampDate(vision.updated_at)} · {daysLeft < 0 ? <span className="v-under">Deadline passed {deadlineText}</span> : `By ${deadlineText}`} ·{" "}
          {latestReview ? `Reviewed ${stampDate(latestReview.created_at)}` : "Not reviewed yet"}
        </span>
      </div>
      <h1 className="v-vision">{vision.body}</h1>
      <div className="v-actions">
        <Link href="/vision?step=1" className="btn btn-secondary btn-link">
          Edit
        </Link>
        <button type="button" className="btn btn-primary" onClick={() => setReview(true)} aria-expanded={review} disabled={pending}>
          Review vision
        </button>
        <TwoTap label="Replace" armedLabel="Tap again to archive it and start over" onFire={replace} disabled={pending} className="v-replace" testId="vision-replace" />
        <span className={`v-steps-done ${steps === 3 ? "v-steps-done-all" : ""}`} data-testid="vision-steps">
          {steps} of 3 steps
        </span>
      </div>
      {error && !review ? (
        <ErrorBar className="mt-14" action={{ label: "Dismiss", onClick: () => setError(null) }}>
          {error}
        </ErrorBar>
      ) : null}

      {review ? (
        <div className="v-review" data-testid="vision-review">
          <div className="label-accent">Review</div>
          <div className="v-review-q">Does this still describe where you&apos;re headed?</div>
          <div className="v-review-note">
            {vision.proof ? `Proof you named: ${vision.proof}. ` : ""}
            {active.sprintCount} {active.sprintCount === 1 ? "sprint has" : "sprints have"} run behind it.{" "}
            {daysLeft < 0 ? `The deadline passed ${-daysLeft} ${-daysLeft === 1 ? "day" : "days"} ago.` : `${daysLeft} ${daysLeft === 1 ? "day" : "days"} to the deadline.`}
          </div>
          <label className="v-field-label v-field-label-opt" htmlFor="review-note">
            What shows it? <em>· optional</em>
          </label>
          <textarea id="review-note" className="input v-textarea" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Evidence you can point to today" aria-label="Review note" />
          {error ? (
            <ErrorBar className="mt-14" action={{ label: "Dismiss", onClick: () => setError(null) }}>
              {error}
            </ErrorBar>
          ) : null}
          <div className="v-review-actions">
            <button type="button" className="btn btn-primary" onClick={() => send("still_true")} disabled={pending}>
              {pending ? "Saving…" : "Still true · mark reviewed"}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => send("needs_changes")} disabled={pending}>
              Needs changes
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setReview(false)} disabled={pending}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="v-cards">
        <div className="card v-mini" data-testid="card-vision">
          <div className="v-mini-head">
            <span className="label-accent">Vision</span>
            <Link href="/vision?step=1" className="v-mini-action">
              Edit
            </Link>
          </div>
          <div className="v-mini-body">{vision.body}</div>
          <div className="v-mini-sub">{vision.proof ? `Proof: ${vision.proof}` : "No success evidence yet"}</div>
        </div>
        <div className="card v-mini" data-testid="card-obstacle">
          <div className="v-mini-head">
            <span className="label-accent">Main obstacle</span>
            <Link href="/vision?step=2" className="v-mini-action">
              {obstacle ? "Edit" : "Add"}
            </Link>
          </div>
          {obstacle ? (
            <>
              <div className="v-mini-body">{obstacle.name}</div>
              <div className="v-mini-sub">{obstacle.explanation ?? "Global impediment · every sprint can watch it"}</div>
            </>
          ) : (
            <Link href="/vision?step=2" className="v-mini-empty">
              What most often pulls you off course?
            </Link>
          )}
        </div>
        <div className="card v-mini" data-testid="card-rule">
          <div className="v-mini-head">
            <span className="label-accent">Guiding rule</span>
            <Link href={obstacle ? "/vision?step=3" : "/vision?step=2"} className="v-mini-action">
              {ruleComplete ? "Edit" : "Add"}
            </Link>
          </div>
          {obstacle && ruleComplete ? (
            <>
              <div className="v-mini-body">
                WHEN {obstacle.proof_when} → THEN {obstacle.proof_then}
              </div>
              <div className="v-mini-sub">Recovered when {obstacle.proof_recover}</div>
            </>
          ) : (
            <Link href={obstacle ? "/vision?step=3" : "/vision?step=2"} className="v-mini-empty">
              {obstacle ? `One move, every time ${obstacle.name} shows up.` : "Name the obstacle first."}
            </Link>
          )}
        </div>
      </div>

      <div className="v-cards v-cards-2">
        <div className="card v-mini" data-testid="card-library">
          <span className="label-accent">Library</span>
          <Link href="/vision/cues" className="v-row">
            <span>Execution cues</span>
            <span className="v-row-n">{counts.cues} →</span>
          </Link>
          <Link href="/vision/impediments" className="v-row">
            <span>Impediments</span>
            <span className="v-row-n">{counts.impediments} →</span>
          </Link>
          <div className="v-mini-note">Cues and impediments are picked per sprint.</div>
        </div>
        <div className="card v-mini" data-testid="card-sprints">
          <div className="v-mini-head">
            <span className="label-accent">Sprints behind this vision</span>
            <span className="v-mini-sub">{sprints.length}</span>
          </div>
          {sprints.length === 0 ? <div className="v-empty-line">No sprints yet. They are planned on the Sprints tab.</div> : null}
          {sprints.map((s) => (
            <Link key={s.id} href={`/sprints/${s.area}`} className="v-sprint" data-testid="vision-sprint">
              <span className="v-sprint-area">{areaName(s.area)}</span>
              <span className="v-sprint-outcome">{s.outcome}</span>
              <span className={`v-sprint-status ${s.verdict ? (s.verdict.met ? "v-met" : "v-under") : ""}`}>
                {s.verdict ? `${s.verdict.met ? "Met" : "Under"} · ${formatNumber(s.verdict.measured, s.verdict.actual)} of ${formatNumber(s.verdict.measured, s.verdict.goal)}` : s.label}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {previous.length > 0 ? (
        <>
          <button type="button" className="v-prev-toggle" aria-expanded={showPrevious} onClick={() => setShowPrevious((v) => !v)}>
            {showPrevious ? "Hide" : "Show"} previous visions ({previous.length})
          </button>
          {showPrevious
            ? previous.map((p) => (
                <div key={p.id} className="v-prev" data-testid="previous-vision">
                  {p.body}
                  <span className="v-prev-meta">
                    {new Date(p.created_at).toLocaleDateString("en-US", MONTH)} – {new Date(p.archived_at).toLocaleDateString("en-US", MONTH)} · replaced {stampDate(p.archived_at)} · {p.sprintCount}{" "}
                    {p.sprintCount === 1 ? "sprint" : "sprints"} ran behind it
                  </span>
                </div>
              ))
            : null}
        </>
      ) : null}
    </div>
  );
}
