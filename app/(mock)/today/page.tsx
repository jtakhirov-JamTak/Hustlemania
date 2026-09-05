// Executable mockup for SPEC F1 (Today). Hardcoded data, no backend.
// Lives on branch mockup/today only; the real page is app/(app)/sprints/[area]/page.tsx.

const AREAS = [
  { name: "Health", meta: "Locked", sub: "No 1-year vision yet", active: false },
  { name: "Wealth", meta: "Day 3/14", sub: "$8,000", active: true },
  { name: "Relationships", meta: "Locked", sub: "No 1-year vision yet", active: false },
];

const START = new Date(2026, 8, 2); // Wed Sep 2, 2026
const TODAY_IDX = 2;
const TARGET = 572;
const GOAL = 8000;
const CLOSED: Record<number, number> = { 0: 610, 1: 420 };
const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function dateOf(i: number) {
  const d = new Date(START);
  d.setDate(START.getDate() + i);
  return d;
}

function fmt(n: number) {
  return n.toLocaleString("en-US") + " USD";
}

export default function TodayMock() {
  const cumulative = Object.values(CLOSED).reduce((a, b) => a + b, 0);
  const remaining = GOAL - cumulative;
  const daysLeft = 14 - TODAY_IDX;
  const today = dateOf(TODAY_IDX);

  return (
    <div className="page">
      <header
        style={{
          display: "flex",
          alignItems: "stretch",
          boxShadow: "0 1px 0 var(--divider)",
          background: "color-mix(in srgb, var(--panel) 88%, transparent)",
          backdropFilter: "blur(10px)",
          position: "sticky",
          top: 0,
          zIndex: 20,
          minHeight: 56,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 26px", minWidth: 186 }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: "var(--accent)", display: "inline-block" }} />
          <span className="heading" style={{ fontSize: 16, letterSpacing: "0.06em" }}>
            Hustlemania
          </span>
        </div>
        <nav style={{ display: "flex" }}>
          {["Sprints", "Vision", "Insights"].map((t, i) => (
            <button
              key={t}
              style={{
                border: "none",
                background: "transparent",
                boxShadow: i === 0 ? "inset 0 -2px 0 var(--accent)" : "none",
                color: i === 0 ? "var(--ink)" : "var(--muted)",
                padding: "0 22px",
                fontSize: 13.5,
                fontWeight: 600,
                minHeight: 56,
              }}
            >
              {t}
            </button>
          ))}
        </nav>
      </header>

      <div style={{ flex: 1, display: "flex", alignItems: "stretch" }} data-shell>
        <aside
          data-sidebar
          style={{
            width: 266,
            flex: "0 0 266px",
            borderRight: "1px solid var(--divider)",
            padding: "20px 0 40px",
            background: "var(--panel)",
          }}
        >
          <div className="label-muted" style={{ padding: "0 24px 10px" }}>
            Sprints
          </div>
          {AREAS.map((a) => (
            <button
              key={a.name}
              style={{
                display: "block",
                width: "calc(100% - 20px)",
                textAlign: "left",
                border: "none",
                borderRadius: 12,
                marginLeft: 10,
                marginBottom: 2,
                background: a.active ? "color-mix(in srgb, var(--accent) 10%, transparent)" : "transparent",
                padding: "11px 14px 12px",
              }}
            >
              <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                <span style={{ fontWeight: 600, fontSize: 13.5 }}>{a.name}</span>
                <span style={{ fontSize: 10.5, color: "var(--muted)", whiteSpace: "nowrap", fontWeight: 600 }}>{a.meta}</span>
              </span>
              <span style={{ display: "block", fontSize: 11.5, color: "var(--muted)", marginTop: 3, lineHeight: 1.4 }}>{a.sub}</span>
            </button>
          ))}
          <div style={{ padding: "14px 20px 0" }}>
            <button className="btn btn-primary btn-block">New Sprint</button>
          </div>
        </aside>

        <main data-main style={{ flex: 1, minWidth: 0, padding: "30px 40px 100px", overflow: "auto" }}>
          <div style={{ maxWidth: 940 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 22, flexWrap: "wrap" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 9 }}>
                  <span className="tag tag-accent">Wealth</span>
                  <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
                    {today.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                  </span>
                </div>
                <h1 className="heading" style={{ fontSize: 32, margin: 0, maxWidth: "28ch", lineHeight: 1.15 }}>
                  Save $8,000 toward the emergency fund
                </h1>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="heading" style={{ fontSize: 30, lineHeight: 1 }}>
                  Day {TODAY_IDX + 1} / 14
                </div>
                <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 5 }}>2-day streak</div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 6, margin: "22px 0 0" }} data-strip>
              {Array.from({ length: 14 }, (_, i) => {
                const dt = dateOf(i);
                const closed = i in CLOSED;
                const hit = closed && CLOSED[i] >= TARGET;
                const weekend = dt.getDay() === 0 || dt.getDay() === 6;
                return (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      minWidth: 34,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      padding: "9px 2px 8px",
                      border: i === TODAY_IDX ? "1.5px solid var(--accent)" : "1px solid var(--divider)",
                      borderRadius: 10,
                      background: closed || weekend ? "var(--faint)" : "var(--panel)",
                    }}
                  >
                    <span style={{ fontSize: 9, fontWeight: 700, color: "var(--accent)" }}>D{i + 1}</span>
                    <span style={{ fontSize: 9.5, color: "var(--muted)", marginTop: 2 }}>{DOW[dt.getDay()]}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, marginTop: 1 }}>{dt.getDate()}</span>
                    <span
                      style={{
                        display: "block",
                        width: 16,
                        height: 3,
                        borderRadius: 2,
                        marginTop: 7,
                        background: closed ? (hit ? "var(--success)" : "var(--under)") : "transparent",
                      }}
                    />
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted)", marginTop: 8 }}>
              <span>Started {dateOf(0).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
              <span>Ends {dateOf(13).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
            </div>

            <section className="card" style={{ marginTop: 34, padding: "26px 28px" }}>
              <div className="label-accent">Today&apos;s target</div>
              <div
                data-hero
                style={{ fontSize: 92, fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1, margin: "4px 0 0" }}
              >
                {TARGET.toLocaleString("en-US")}
              </div>
              <div style={{ fontSize: 17, fontWeight: 600, marginTop: 4, color: "var(--muted)" }}>USD</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginTop: 26 }} data-cols>
                {[
                  { label: "Cumulative actual", value: fmt(cumulative), sub: Math.round((cumulative / GOAL) * 100) + "% of goal" },
                  { label: "Sprint goal · locked", value: fmt(GOAL), sub: "USD" },
                  { label: "Remaining", value: fmt(remaining), sub: `${daysLeft} days left · ${fmt(Math.ceil(remaining / daysLeft))} a day` },
                ].map((st) => (
                  <div key={st.label} style={{ border: "1px solid var(--divider)", borderRadius: 14, padding: "14px 16px" }}>
                    <div style={{ fontSize: 10.5, color: "var(--muted)" }}>{st.label}</div>
                    <div style={{ fontSize: 21, fontWeight: 700, marginTop: 4, letterSpacing: "-0.01em" }}>{st.value}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{st.sub}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 20, paddingTop: 18, borderTop: "1px solid var(--divider)" }}>
                <div className="label-muted" style={{ marginBottom: 9 }}>
                  Usage of funds
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {[
                    ["2,800 USD", "Rent"],
                    ["2,200 USD", "Credit Card"],
                    ["3,000 USD", "Stocks"],
                  ].map(([amt, label]) => (
                    <span key={label} style={{ border: "1px solid var(--divider)", borderRadius: 999, padding: "6px 13px", fontSize: 12.5 }}>
                      <strong style={{ fontWeight: 600 }}>{amt}</strong> {label}
                    </span>
                  ))}
                </div>
              </div>
            </section>

            <section className="card" style={{ marginTop: 20, padding: "22px 26px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                <span className="label-accent">Daily intention</span>
                <span style={{ fontSize: 11, color: "var(--muted)" }}>Saved</span>
              </div>
              <textarea
                rows={2}
                defaultValue="Today I will move the $600 from checking before lunch, then leave the trading app closed."
                placeholder="Today I will…"
                style={{
                  width: "100%",
                  border: "1px solid var(--divider)",
                  borderRadius: 14,
                  background: "var(--panel)",
                  padding: "12px 14px",
                  fontSize: 15,
                  lineHeight: 1.5,
                  resize: "vertical",
                }}
              />
            </section>

            <section className="card-tint" style={{ marginTop: 20, padding: "24px 28px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 18 }}>
                <div
                  style={{ fontSize: 23, fontWeight: 500, fontStyle: "italic", lineHeight: 1.35, maxWidth: "34ch", color: "var(--accent-ink)" }}
                >
                  Boring money is the money that stays.
                </div>
                <button className="link-quiet">Edit</button>
              </div>
            </section>

            <section className="card" style={{ marginTop: 20, padding: "24px 26px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
                <div style={{ maxWidth: "42ch" }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Close the day</div>
                  <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4, lineHeight: 1.5 }}>
                    Actual result first. Close before 11:59 PM America/Los_Angeles to hold the streak — a truthful zero counts.
                  </div>
                </div>
                <button className="btn btn-primary" style={{ minWidth: 200 }}>
                  Enter actual result
                </button>
              </div>
              <div
                style={{
                  marginTop: 18,
                  paddingTop: 16,
                  borderTop: "1px solid var(--divider)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 16,
                  flexWrap: "wrap",
                  fontSize: 11.5,
                  color: "var(--muted)",
                }}
              >
                <span>Celebration: dinner at the lake once the fund is full.</span>
                <button className="link-quiet" style={{ fontSize: 11.5 }}>
                  End sprint early
                </button>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
