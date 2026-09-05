"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { closeDayAction } from "@/app/(app)/actions";
import type { SprintDay } from "@/lib/data";
import { formatAmount, formatNumber, toBaseUnits, unitLabel, type Measured } from "@/lib/format";

type Props = {
  sprintId: string;
  measured: Measured;
  goal: number;
  day: SprintDay;
  days: SprintDay[];
  canClose: boolean;
  cannotCloseReason?: string;
  tz: string;
  celebration: string;
};

export function CloseCard(props: Props) {
  const { day, measured, celebration } = props;
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<SprintDay[] | null>(null);
  const router = useRouter();

  const closed = day.closed_at !== null;
  const actual = Number(day.actual ?? 0);
  const target = Number(day.target);
  const atOrAbove = actual >= target;

  return (
    <section className="card" style={{ marginTop: 20, padding: "24px 26px" }} data-testid="close-card">
      {closed ? (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 10.5, color: "var(--muted)" }}>Day closed · locked</div>
            <div
              className="heading"
              data-testid="closed-actual"
              data-state={atOrAbove ? "at-or-above" : "under"}
              style={{ fontSize: 28, marginTop: 3, color: atOrAbove ? "var(--success)" : "var(--under)" }}
            >
              {formatAmount(measured, actual)}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4 }}>against {formatAmount(measured, target)}</div>
          </div>
          <div style={{ fontSize: 12.5, color: "var(--muted)", maxWidth: "36ch", lineHeight: 1.5 }}>
            A closed day is historical truth. Tomorrow&apos;s target is already set — nothing carries over.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <div style={{ maxWidth: "42ch" }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Close the day</div>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4, lineHeight: 1.5 }}>
              Actual result first. Close before 11:59 PM {props.tz.replace("_", " ")} — a truthful zero counts.
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            {!props.canClose && props.cannotCloseReason ? <span className="hint">{props.cannotCloseReason}</span> : null}
            <button type="button" className="btn btn-primary" style={{ minWidth: 200 }} disabled={!props.canClose} onClick={() => setOpen(true)}>
              Enter actual result
            </button>
          </div>
        </div>
      )}
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
        <span>Celebration: {celebration}</span>
      </div>

      {open ? (
        <CloseDialog
          {...props}
          onCancel={() => setOpen(false)}
          onClosed={(days) => {
            setResult(days);
          }}
        />
      ) : null}
      {result ? (
        <ResultScreen
          measured={measured}
          goal={props.goal}
          day={result.find((d) => d.id === day.id) ?? day}
          days={result}
          onBack={() => {
            setResult(null);
            setOpen(false);
            router.refresh();
          }}
        />
      ) : null}
    </section>
  );
}

function CloseDialog(props: Props & { onCancel: () => void; onClosed: (days: SprintDay[]) => void }) {
  const { measured, day } = props;
  const [whole, setWhole] = useState("");
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), []);

  const value =
    measured.measurement === "hours"
      ? hours === "" && minutes === ""
        ? null
        : toBaseUnits("hours", { hours: Number(hours || 0), minutes: Number(minutes || 0) })
      : whole === ""
        ? null
        : toBaseUnits(measured.measurement, { whole: Number(whole) });
  const valid = value !== null && Number.isFinite(value) && value >= 0 && (measured.measurement !== "hours" || Number(minutes || 0) < 60);

  function submit() {
    if (!valid || value === null) return;
    start(async () => {
      const res = await closeDayAction(day.id, props.sprintId, value, notes);
      if (res.error || !res.days) {
        setError(res.error ?? "That did not save. Your input is still here — try again.");
        return;
      }
      props.onClosed(res.days);
    });
  }

  return (
    <div className="dialog-scrim" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && props.onCancel()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="close-title" style={{ maxWidth: 620 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="label-muted">Close day {day.day_index} · step 1 of 1</span>
          <button type="button" className="link-quiet" aria-label="Cancel" onClick={props.onCancel} style={{ fontSize: 18, lineHeight: 1 }}>
            ×
          </button>
        </div>
        <h2 id="close-title" className="heading" style={{ fontSize: 26, margin: "10px 0 0" }}>
          What was the actual result?
        </h2>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 6 }}>
          Today&apos;s target was <strong style={{ fontWeight: 600, color: "var(--ink)" }}>{formatAmount(measured, Number(day.target))}</strong>. Zero is a
          truthful answer.
        </div>

        <form
          style={{ marginTop: 18 }}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {measured.measurement === "hours" ? (
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
              <label style={{ flex: 1 }}>
                <span className="label-muted">Hours</span>
                <input ref={first} className="input input-hero" type="number" inputMode="numeric" min={0} step={1} value={hours} onChange={(e) => setHours(e.target.value)} />
              </label>
              <label style={{ flex: 1 }}>
                <span className="label-muted">Minutes</span>
                <input className="input input-hero" type="number" inputMode="numeric" min={0} max={59} step={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
              </label>
            </div>
          ) : (
            <label style={{ display: "block" }}>
              <span className="label-muted">Actual · {unitLabel(measured)}</span>
              <input
                ref={first}
                className="input input-hero"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={whole}
                onChange={(e) => setWhole(e.target.value)}
                aria-label="Actual result"
              />
            </label>
          )}

          <label style={{ display: "block", marginTop: 16 }}>
            <span className="label-muted">Notes · optional</span>
            <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything worth remembering about today" style={{ marginTop: 6 }} />
          </label>

          {error ? (
            <div role="alert" className="error-bar" style={{ marginTop: 14 }}>
              <span>{error}</span>
              <button type="submit" className="link-quiet" style={{ color: "inherit", fontWeight: 600 }}>
                Retry
              </button>
            </div>
          ) : null}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 22, flexWrap: "wrap" }}>
            <button type="button" className="btn btn-ghost" onClick={props.onCancel}>
              Cancel
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {!valid ? <span className="hint">Enter the actual, zero included.</span> : null}
              <button type="submit" className="btn btn-primary" disabled={!valid || pending}>
                {pending ? "Closing…" : "Close the day"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function ResultScreen({ measured, goal, day, days, onBack }: { measured: Measured; goal: number; day: SprintDay; days: SprintDay[]; onBack: () => void }) {
  const actual = Number(day.actual ?? 0);
  const target = Number(day.target);
  const atOrAbove = actual >= target;
  const cumulative = days.reduce((acc, d) => acc + Number(d.actual ?? 0), 0);
  const tomorrow = days.find((d) => d.day_index === day.day_index + 1);

  return (
    <div className="dialog-scrim" role="presentation">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="result-title" style={{ maxWidth: 620, animation: "popIn 220ms ease-out" }}>
        <span className="label-muted">Day {day.day_index} closed</span>
        <div
          id="result-title"
          className="heading"
          data-testid="result-actual"
          data-state={atOrAbove ? "at-or-above" : "under"}
          style={{ fontSize: 78, letterSpacing: "-0.04em", lineHeight: 1, marginTop: 8, color: atOrAbove ? "var(--success)" : "var(--under)" }}
        >
          {formatNumber(measured, actual)}
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--muted)", marginTop: 4 }}>
          {unitLabel(measured)} · target {formatNumber(measured, target)}
        </div>

        <div style={{ display: "flex", gap: 4, marginTop: 22 }} aria-label="14-day progress">
          {days.map((d) => {
            const c = d.closed_at !== null;
            const h = c && Number(d.actual) >= Number(d.target);
            return <span key={d.id} style={{ flex: 1, height: 6, borderRadius: 3, background: c ? (h ? "var(--success)" : "var(--under)") : "var(--faint)" }} />;
          })}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--divider)", fontSize: 13.5 }}>
          <span style={{ color: "var(--muted)" }}>Cumulative</span>
          <strong style={{ fontWeight: 600 }}>
            {formatAmount(measured, cumulative)} · {Math.round((cumulative / goal) * 100)}% of goal
          </strong>
        </div>
        {tomorrow ? (
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 9, fontSize: 13.5 }}>
            <span style={{ color: "var(--muted)" }}>Tomorrow&apos;s target</span>
            <strong style={{ fontWeight: 600 }}>{formatAmount(measured, Number(tomorrow.target))}</strong>
          </div>
        ) : (
          <div style={{ marginTop: 9, fontSize: 13.5, color: "var(--muted)" }}>That was the last day of the sprint.</div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
          <button type="button" className="btn btn-primary" onClick={onBack}>
            Back to today
          </button>
        </div>
      </div>
    </div>
  );
}
