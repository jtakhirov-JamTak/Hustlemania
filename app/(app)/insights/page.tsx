import type { Metadata } from "next";

export const metadata: Metadata = { title: "Insights" };

export default function InsightsPage() {
  return (
    <main className="main">
      <div className="card card-page workspace">
        <span className="tag tag-accent">Insights</span>
        <h1 className="heading page-title mt-12">Patterns arrive after your first sprint</h1>
        <p className="lede lede-narrow">
          Insights compares closed days across sprints: which impediments line up with under-target days, which cues line up
          with good ones. There is nothing to compare yet.
        </p>
      </div>
    </main>
  );
}
