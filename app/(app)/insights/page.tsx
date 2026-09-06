import type { Metadata } from "next";

export const metadata: Metadata = { title: "Insights" };

export default function InsightsPage() {
  return (
    <main data-main style={{ flex: 1, minWidth: 0, padding: "30px 40px 100px" }}>
      <div className="card" style={{ maxWidth: 940, padding: "28px 30px" }}>
        <span className="tag tag-accent">Insights</span>
        <h1 className="heading" style={{ fontSize: 30, margin: "12px 0 0" }}>
          Patterns arrive after your first sprint
        </h1>
        <p style={{ fontSize: 14.5, lineHeight: 1.55, color: "var(--muted)", marginTop: 10, maxWidth: "52ch" }}>
          Insights compares closed days across sprints: which impediments line up with under-target days, which cues line up
          with good ones. There is nothing to compare yet.
        </p>
      </div>
    </main>
  );
}
