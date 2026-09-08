/**
 * The shared insight card (v8 README §Four insight cards). One shape for all four:
 * kicker + coverage, the question, then a row per item with two bars and a tail.
 *
 * Every number it renders is an association with its sample size printed beside it. A
 * row without enough days says so instead of showing a comparison — the threshold is
 * the DB's (`insight_min_days`), and `enough` arrives already decided.
 */
export type Bar = { value: string; label: string; pct: number; tone?: "good" | "bad" };

export type InsightRow = {
  key: string;
  name: string;
  tag?: string | null;
  tail: string;
  tailTone?: "good" | "bad";
  sub: string;
  bars: Bar[];
  note?: string | null;
  /** A short sample turns the note accent-ink: it is a caveat, not a footnote. */
  warn?: boolean;
};

export function InsightCard({
  tone,
  title,
  coverage,
  question,
  empty,
  rows,
  testId,
}: {
  tone: "impediment" | "response" | "cue";
  title: string;
  coverage: string;
  question: string;
  /** Why there is nothing to compare, when there is nothing to compare. */
  empty: string | null;
  rows: InsightRow[];
  testId: string;
}) {
  return (
    <section className="card ic" data-testid={testId}>
      <div className="ic-head">
        <span className="ic-kicker" data-tone={tone}>
          {title}
        </span>
        <span className="ic-coverage">{coverage}</span>
      </div>
      <div className="ic-question">{question}</div>
      {empty ? (
        <div className="ic-empty" data-testid="insight-empty">
          {empty}
        </div>
      ) : (
        rows.map((r) => (
          <div key={r.key} className="ic-row" data-testid="insight-row">
            <div className="ic-row-head">
              <span className="ic-name">
                {r.name}
                {r.tag ? <span className="ic-tag">{r.tag}</span> : null}
              </span>
              <span className="ic-tail" data-tone={r.tailTone}>
                {r.tail}
              </span>
            </div>
            <div className="ic-sub">{r.sub}</div>
            {r.bars.map((b) => (
              <div key={b.label} className="ic-bar">
                <div className="ic-track">
                  <span className="ic-fill" data-tone={b.tone} style={{ width: `${Math.max(0, Math.min(100, b.pct))}%` }} />
                </div>
                <span className="ic-bar-label">
                  <strong>{b.value}</strong> {b.label}
                </span>
              </div>
            ))}
            {r.note ? (
              <div className="ic-note" data-warn={r.warn ? "true" : "false"}>
                {r.note}
              </div>
            ) : null}
          </div>
        ))
      )}
    </section>
  );
}
