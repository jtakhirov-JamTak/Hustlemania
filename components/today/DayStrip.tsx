"use client";

import { useEffect, useRef } from "react";
import { dayOfMonth, dayOfWeek, formatIsoDate, isWeekend, SHORT_DOW } from "@/lib/dates";
import type { SprintDay } from "@/lib/data";

export function DayStrip({ days, focusIndex, startDate, endDate }: { days: SprintDay[]; focusIndex: number; startDate: string; endDate: string }) {
  const strip = useRef<HTMLDivElement>(null);

  // On a narrow screen the strip scrolls sideways; centre the focus day in it. Only the
  // strip's own scrollLeft moves, so the page never jumps.
  useEffect(() => {
    const el = strip.current;
    const cell = el?.querySelector<HTMLElement>(`[data-day="${focusIndex}"]`);
    if (!el || !cell || el.scrollWidth <= el.clientWidth) return;
    const offset = cell.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft;
    el.scrollLeft = offset - (el.clientWidth - cell.offsetWidth) / 2;
  }, [focusIndex]);

  return (
    <>
      <div ref={strip} style={{ display: "flex", gap: 6, margin: "22px 0 0" }} data-strip data-testid="day-strip">
        {days.map((d) => {
          const closed = d.closed_at !== null;
          const hit = closed && Number(d.actual) >= Number(d.target);
          const focus = d.day_index === focusIndex;
          return (
            <div
              key={d.id}
              data-day={d.day_index}
              data-state={closed ? (hit ? "at-or-above" : "under") : "open"}
              title={`Day ${d.day_index} · ${formatIsoDate(d.date, { weekday: "short", month: "short", day: "numeric" })}`}
              style={{
                flex: 1,
                minWidth: 34,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                padding: "9px 2px 8px",
                border: focus ? "1.5px solid var(--accent)" : "1px solid var(--divider)",
                borderRadius: 10,
                background: closed || isWeekend(d.date) ? "var(--faint)" : "var(--panel)",
              }}
            >
              <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--accent-ink)" }}>D{d.day_index}</span>
              <span style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{SHORT_DOW[dayOfWeek(d.date)]}</span>
              <span style={{ fontSize: 14, fontWeight: 600, marginTop: 1 }}>{dayOfMonth(d.date)}</span>
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
        <span>Started {formatIsoDate(startDate, { weekday: "short", month: "short", day: "numeric" })}</span>
        <span>Ends {formatIsoDate(endDate, { weekday: "short", month: "short", day: "numeric" })}</span>
      </div>
    </>
  );
}
