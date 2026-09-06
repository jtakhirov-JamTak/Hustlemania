"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CloseFlow } from "@/components/today/CloseFlow";
import type { OfferedItems, SprintDay } from "@/lib/data";
import { formatAmount, type Measured } from "@/lib/format";

type Props = {
  sprintId: string;
  measured: Measured;
  goal: number;
  day: SprintDay;
  offered: OfferedItems;
  canClose: boolean;
  cannotCloseReason?: string;
  tz: string;
  celebration: string;
};

export function CloseCard(props: Props) {
  const { day, measured, celebration } = props;
  const [open, setOpen] = useState(false);
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
              Actual result first, then what hurt and what helped. Close before 11:59 PM {props.tz.replace("_", " ")} — a truthful zero counts.
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
        <CloseFlow
          sprintId={props.sprintId}
          measured={measured}
          goal={props.goal}
          day={day}
          offered={props.offered}
          backfill={false}
          onCancel={() => setOpen(false)}
          onDone={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      ) : null}
    </section>
  );
}
