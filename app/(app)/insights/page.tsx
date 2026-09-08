import type { Metadata } from "next";

export const metadata: Metadata = { title: "Insights" };

/**
 * Across sprints is F11. F10 gives the tab its sidebar and the single-sprint
 * postmortem at `/insights/reviews/[sprintId]`; this page stays the placeholder.
 */
export default function InsightsPage() {
  return (
    <div className="card card-page">
      <span className="tag tag-accent">Across sprints</span>
      <h1 className="heading page-title mt-12">Patterns arrive after your first sprint</h1>
      <p className="lede lede-narrow">
        Each finished sprint gets a postmortem on the left. Once a few of them exist, this page compares them: which impediments line up with
        under-target days, which cues line up with good ones.
      </p>
    </div>
  );
}
