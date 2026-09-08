"use client";

import { Rail } from "@/components/today/Rail";
import { Timeline } from "@/components/today/Timeline";
import { TodayCard } from "@/components/today/TodayCard";
import { areaName, type AreaKey } from "@/lib/areas";
import type { LibraryItem, OfferedItems, Sprint, SprintDay, SprintItems, Task } from "@/lib/data";
import type { DayObservations } from "@/lib/daySummary";
import { formatIsoDate } from "@/lib/dates";
import { formatAmount, formatNumber, type Measured } from "@/lib/format";
import { localDateIn, streakLabel, type SprintDayPosition } from "@/lib/sprintDay";
import { measurementStep, remainingPlan } from "@/lib/targets";

type UsageRow = { label: string; amount: number };

/**
 * The Sprints tab (F8): header, progress block, timeline with the Today card, rail.
 * Everything comes loaded from the page; the parts below own their own edits.
 */
export function Journal({
  sprint,
  days,
  position,
  items,
  library,
  offered,
  tasks,
  streak,
  observations,
}: {
  sprint: Sprint;
  days: SprintDay[];
  position: SprintDayPosition;
  items: SprintItems;
  library: { cues: LibraryItem[]; impediments: LibraryItem[] };
  offered: OfferedItems;
  tasks: Task[];
  streak: number;
  observations: Map<string, DayObservations>;
}) {
  const measured: Measured = { measurement: sprint.measurement as Measured["measurement"], currency: sprint.currency, unit: sprint.unit };
  const goal = Number(sprint.amount);
  const sprintOver = position.kind === "after";
  // The day in the Today slot: today during the sprint, day 1 before it starts, none after.
  const focusIndex = position.kind === "during" ? position.dayIndex : position.kind === "before" ? 1 : 15;
  const day = days.find((d) => d.day_index === Math.min(focusIndex, 14)) ?? days[0];
  const { cumulative, remaining, daysLeft, perDay } = remainingPlan(days, goal, Math.min(focusIndex, 14), measurementStep(measured.measurement));
  const usage = Array.isArray(sprint.usage_of_funds) ? (sprint.usage_of_funds as UsageRow[]) : [];
  const todayInSprintTz = position.kind === "during" ? position.date : localDateIn(sprint.tz, new Date());
  const highestId = items.impediments.find((i) => i.is_highest)?.id ?? null;
  const closedCount = days.filter((d) => d.closed_at !== null).length;
  const streakText = position.kind === "before" ? "Streak starts with day 1" : streakLabel(streak);
  const pct = Math.round((cumulative / goal) * 100);
  const pace = remaining === 0 ? " · goal reached" : sprintOver ? " · sprint over" : daysLeft > 1 ? ` · ${formatNumber(measured, perDay)} a day finishes it` : " · final day";

  return (
    <div className="journal" data-testid="journal">
      <div>
        <h1 className="heading j-title" data-testid="journal-title">
          {sprint.outcome}
        </h1>
        <div className="j-meta">
          {areaName(sprint.area as AreaKey)} · {formatIsoDate(sprint.start_date, { month: "short", day: "numeric" })} → {formatIsoDate(sprint.end_date, { month: "short", day: "numeric" })}
        </div>

        <div className="j-progress" data-testid="sprint-progress">
          <div>
            <div className="j-progress-kicker" data-testid="day-label">
              {position.kind === "before" ? "Day 1 of 14 · starts tomorrow" : `Day ${Math.min(focusIndex, 14)} of 14`}
            </div>
            <div className="heading j-progress-pct">{pct}%</div>
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="j-progress-line">
              {formatNumber(measured, cumulative)} of {formatAmount(measured, goal)}
              {pace}
            </div>
            <div className="j-segs" role="img" aria-label={`${closedCount} of 14 days closed`}>
              {days.map((d) => (
                <span key={d.id} className="j-seg" data-day={d.day_index} data-closed={d.closed_at !== null ? "true" : "false"} data-today={d.day_index === focusIndex ? "true" : "false"} />
              ))}
            </div>
            <div className="j-progress-streak">{streakText}</div>
          </div>
        </div>

        <Timeline
          sprintId={sprint.id}
          measured={measured}
          goal={goal}
          days={days}
          focusIndex={focusIndex}
          todayInSprintTz={todayInSprintTz}
          observations={observations}
          highestId={highestId}
          initialMode={sprint.target_mode === "custom" ? "custom" : "same"}
          sprintOver={sprintOver}
          today={
            sprintOver ? (
              <div className="j-ended" data-testid="sprint-ended">
                <span>
                  Sprint window ended · {closedCount} of 14 days closed. A missed day can still be added above.
                </span>
              </div>
            ) : (
              <TodayCard
                key={day.id}
                sprintId={sprint.id}
                measured={measured}
                day={day}
                nextTarget={focusIndex < 14 ? Number(days.find((d) => d.day_index === focusIndex + 1)?.target ?? 0) : null}
                tz={sprint.tz}
                offered={offered}
                highestId={highestId}
                tasks={tasks}
                observations={observations.get(day.id) ?? { impediments: [], cues: [] }}
                items={items}
                library={library}
                canClose={position.kind === "during" && day.closed_at === null}
                cannotCloseReason={position.kind === "before" ? "Day 1 begins tomorrow." : undefined}
                dayOneAhead={position.kind === "before"}
              />
            )
          }
        />
        <div className="j-footnote">Days close 11:59 PM {sprint.tz.replace("_", " ")}.</div>
      </div>

      <Rail
        sprintId={sprint.id}
        mantra={sprint.mantra}
        streakText={streakText}
        items={items}
        library={library}
        locked={sprintOver}
        celebration={sprint.celebration}
        measured={measured}
        usage={usage}
      />
    </div>
  );
}
