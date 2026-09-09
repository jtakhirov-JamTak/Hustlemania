import type { Metadata } from "next";
import Link from "next/link";
import { InsightCard } from "@/components/insights/InsightCard";
import { groupCues, groupFollow, groupImpact, groupRecovery, type Scope } from "@/lib/across";
import { acrossCueRows, acrossFollowRows, acrossImpactRows, acrossRecoveryRows, coverageAcross, evidenceLine, HOW_TO_READ, suggestedKit } from "@/lib/acrossCards";
import { AREAS, areaName, isAreaKey } from "@/lib/areas";
import { loadAcross } from "@/lib/data";
import { formatIsoDate } from "@/lib/dates";
import { coverageLine } from "@/lib/insightCards";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Insights" };

const SCOPES: { key: Scope; label: string }[] = [{ key: "all", label: "All areas" }, ...AREAS.map((a) => ({ key: a.key as Scope, label: a.name }))];

/**
 * Across sprints (F11). Every finished sprint in scope, read through the same per-sprint
 * calculations the postmortem uses, grouped one row per item.
 *
 * The scope lives in the URL so this stays a server component and each chip is a link —
 * the page has no state of its own and no action on it. An unknown scope falls back to
 * All areas rather than erroring: a bad query string is not worth a broken page.
 */
export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const raw = (await searchParams).scope;
  const scope: Scope = raw === "all" || raw === undefined ? "all" : isAreaKey(raw) ? raw : "all";

  const supabase = await createClient();
  const data = await loadAcross(supabase, scope);

  if (data.sprints === 0 && scope === "all") return <Placeholder />;

  const impact = groupImpact(data.history, scope);
  const follow = groupFollow(data.history, scope);
  const recovery = groupRecovery(data.history, scope);
  const cues = groupCues(data.history, scope);

  const impactRows = acrossImpactRows(impact, scope);
  const followRows = acrossFollowRows(follow, scope);
  const recoveryRows = acrossRecoveryRows(recovery, scope);
  const cueRows = acrossCueRows(cues, scope);

  const impactCover = coverageAcross(data.history.map((h) => h.impact));
  const cueCover = coverageAcross(data.history.map((h) => h.cues));
  const occurrences = data.history.flatMap((h) => h.follow).reduce((a, r) => a + r.occurrences, 0);
  const ftAnswered = data.history.flatMap((h) => h.follow).reduce((a, r) => a + r.answered, 0);
  const responses = data.history.flatMap((h) => h.recovery).reduce((a, r) => a + r.with_response + r.without_response, 0);
  const rcAnswered = data.history.flatMap((h) => h.recovery).reduce((a, r) => a + r.answered, 0);

  const area = scope === "all" ? null : areaName(scope);
  const nothing = data.sprints === 0;
  const emptyReason = nothing ? `No finished ${area} sprint yet. Comparisons appear once one ends.` : null;

  return (
    <div data-testid="across">
      <div className="lg-head">
        <div>
          <div className="lg-kicker">
            {data.firstStart ? `Evidence · ${formatIsoDate(data.firstStart, { month: "short", day: "numeric" })} → today` : "Evidence · nothing yet"}
          </div>
          <h1 className="heading page-title mt-6">What actually works for you</h1>
        </div>
        <div>
          <div className="lg-stats" data-testid="across-evidence">
            {nothing ? `No finished ${area} sprint` : evidenceLine(data.sprints, data.closedDays, data.onTarget)}
          </div>
          <div className="lg-caveat">Comparisons need 3 days on each side · association, not cause</div>
        </div>
      </div>

      <div className="lg-scopes" role="group" aria-label="Scope">
        {SCOPES.map((s) => (
          <Link key={s.key} href={s.key === "all" ? "/insights" : `/insights?scope=${s.key}`} className={`chip ${scope === s.key ? "chip-on" : ""}`} aria-current={scope === s.key ? "true" : undefined}>
            {s.label}
          </Link>
        ))}
      </div>

      <div className="pm-cards">
        <InsightCard
          tone="impediment"
          title="IMPEDIMENT IMPACT"
          coverage={nothing ? "No closed days" : coverageLine(impactCover.logged, data.closedDays, impactCover.unsure)}
          question="Median daily attainment on days an obstacle was present vs absent."
          empty={impactRows.length === 0 ? (emptyReason ?? "No impediments were logged on a closed day.") : null}
          rows={impactRows}
          testId="card-impact"
        />
        <InsightCard
          tone="response"
          title="RESPONSE FOLLOW-THROUGH"
          coverage={nothing ? "No occurrences" : `${occurrences} occurrences · ${ftAnswered} answered`}
          question="When the highest impediment showed up, did the WHEN → THEN response run?"
          empty={followRows.length === 0 ? (emptyReason ?? "The highest impediment never showed up on a logged day.") : null}
          rows={followRows}
          testId="card-followthrough"
        />
        <InsightCard
          tone="response"
          title="RESPONSE RECOVERY"
          coverage={nothing ? "No responses" : `${responses} responses · ${rcAnswered} answered`}
          question="After the response ran, was the recovery criterion met?"
          empty={recoveryRows.length === 0 ? (emptyReason ?? "No recovery answer was given on a logged day.") : null}
          rows={recoveryRows}
          testId="card-recovery"
        />
        <InsightCard
          tone="cue"
          title="CUE USEFULNESS"
          coverage={nothing ? "No closed days" : coverageLine(cueCover.logged, data.closedDays, cueCover.unsure)}
          question="Median daily attainment on days a cue was used vs not used."
          empty={cueRows.length === 0 ? (emptyReason ?? "No cues were logged on a closed day.") : null}
          rows={cueRows}
          testId="card-cues"
        />
      </div>

      <div className="lg-foot">
        <section className="card lg-suggest" data-testid="suggested-kit">
          <div className="lg-title">Suggested kit for the next sprint</div>
          <p className="lg-body">{suggestedKit({ impact, follow, recovery, cues, closedDays: data.closedDays })}</p>
        </section>
        <section className="card lg-read">
          <div className="lg-title">How to read this</div>
          <p className="lg-body">{HOW_TO_READ}</p>
        </section>
      </div>
    </div>
  );
}

/** Before the first sprint ends there is nothing to compare and nothing to explain. */
function Placeholder() {
  return (
    <div className="card card-page" data-testid="across-empty">
      <span className="tag tag-accent">Across sprints</span>
      <h1 className="heading page-title mt-12">Patterns arrive after your first sprint</h1>
      <p className="lede lede-narrow">
        Each finished sprint gets a postmortem on the left. Once a few of them exist, this page compares them: which impediments line up with
        under-target days, which cues line up with good ones.
      </p>
    </div>
  );
}
