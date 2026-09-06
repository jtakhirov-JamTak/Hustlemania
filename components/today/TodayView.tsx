import { CloseCard } from "@/components/today/CloseCard";
import { DayStrip } from "@/components/today/DayStrip";
import { HighestImpedimentCard } from "@/components/today/HighestImpedimentCard";
import { IntentionCard } from "@/components/today/IntentionCard";
import { MantraCard } from "@/components/today/MantraCard";
import { PlanCard } from "@/components/today/PlanCard";
import { SprintItemsRow } from "@/components/today/SprintItemsRow";
import { TasksCard } from "@/components/today/TasksCard";
import { areaName, type AreaKey } from "@/lib/areas";
import type { LibraryItem, OfferedItems, Sprint, SprintDay, SprintItems, Task } from "@/lib/data";
import { formatIsoDate } from "@/lib/dates";
import { formatAmount, formatNumber, unitLabel, type Measured } from "@/lib/format";
import { hasRoundingDifference, measurementStep } from "@/lib/targets";
import { localDateIn, streakLabel, type SprintDayPosition } from "@/lib/sprintDay";

type UsageRow = { label: string; amount: number };

export function TodayView({
  sprint,
  days,
  position,
  items,
  library,
  offered,
  tasks,
  streak,
}: {
  sprint: Sprint;
  days: SprintDay[];
  position: SprintDayPosition;
  items: SprintItems;
  library: { cues: LibraryItem[]; impediments: LibraryItem[] };
  offered: OfferedItems;
  tasks: Task[];
  streak: number;
}) {
  const measured: Measured = { measurement: sprint.measurement as Measured["measurement"], currency: sprint.currency, unit: sprint.unit };
  const goal = Number(sprint.amount);

  // The day in focus: today during the sprint, day 1 before it starts, day 14 after.
  const focusIndex = position.kind === "during" ? position.dayIndex : position.kind === "before" ? 1 : 14;
  const day = days.find((d) => d.day_index === focusIndex) ?? days[0];

  const closedDays = days.filter((d) => d.closed_at !== null);
  const cumulative = closedDays.reduce((acc, d) => acc + Number(d.actual ?? 0), 0);
  const remaining = Math.max(0, goal - cumulative);
  const daysLeft = days.filter((d) => d.closed_at === null && d.day_index >= focusIndex).length;
  const step = measurementStep(measured.measurement);
  const perDay = daysLeft > 0 ? Math.ceil(remaining / daysLeft / step) * step : 0;
  const usage = Array.isArray(sprint.usage_of_funds) ? (sprint.usage_of_funds as UsageRow[]) : [];
  const rounding = hasRoundingDifference(days.map((d) => Number(d.target)));

  const canClose = position.kind === "during" && day.closed_at === null;
  const cannotCloseReason =
    position.kind === "before" ? "Day 1 begins tomorrow." : position.kind === "after" ? "The 14 days are over." : undefined;
  const sprintOver = position.kind === "after";
  // Rule 10 is decided in the sprint's zone; the DB re-checks on save.
  const todayInSprintTz = position.kind === "during" ? position.date : localDateIn(sprint.tz, new Date());

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 22, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 9 }}>
            <span className="tag tag-accent">{areaName(sprint.area as AreaKey)}</span>
            <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
              {formatIsoDate(day.date, { weekday: "long", month: "short", day: "numeric" })}
              {position.kind === "before" ? " · starts tomorrow" : position.kind === "after" ? " · sprint window ended" : ""}
            </span>
          </div>
          <h1 className="heading" style={{ fontSize: 32, margin: 0, maxWidth: "28ch", lineHeight: 1.15 }}>
            {sprint.outcome}
          </h1>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="heading" style={{ fontSize: 30, lineHeight: 1 }} data-testid="day-label">
            Day {focusIndex} / 14
          </div>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 5 }} data-testid="streak-label">
            {position.kind === "before" ? "Streak starts with day 1" : streakLabel(streak)}
          </div>
        </div>
      </div>

      <DayStrip days={days} focusIndex={focusIndex} startDate={sprint.start_date} endDate={sprint.end_date} />

      <section className="card" style={{ marginTop: 34, padding: "26px 28px" }} data-testid="target-hero">
        <div className="label-accent">{position.kind === "before" ? "Day 1 target" : "Today's target"}</div>
        <div data-hero style={{ fontSize: 92, fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1, margin: "4px 0 0" }}>
          {formatNumber(measured, Number(day.target))}
        </div>
        <div style={{ fontSize: 17, fontWeight: 600, marginTop: 4, color: "var(--muted)" }}>{unitLabel(measured)}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginTop: 26 }} data-cols>
          <Stat label="Cumulative actual" value={formatAmount(measured, cumulative)} sub={`${Math.round((cumulative / goal) * 100)}% of goal`} />
          <Stat label="Sprint goal · locked" value={formatAmount(measured, goal)} sub={measured.measurement === "money" ? (measured.currency ?? "") : measured.measurement} />
          <Stat
            label="Remaining"
            value={formatAmount(measured, remaining)}
            sub={daysLeft > 0 ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left · ${formatAmount(measured, perDay)} a day` : "Final day"}
          />
        </div>
        {rounding ? (
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 12 }}>
            The goal does not split evenly over 14 days, so the first days carry one extra unit.
          </div>
        ) : null}
        {measured.measurement === "money" && usage.length > 0 ? (
          <div style={{ marginTop: 20, paddingTop: 18, borderTop: "1px solid var(--divider)" }}>
            <div className="label-muted" style={{ marginBottom: 9 }}>
              Usage of funds
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {usage.map((u, i) => (
                <span key={i} style={{ border: "1px solid var(--divider)", borderRadius: 999, padding: "6px 13px", fontSize: 12.5 }}>
                  <strong style={{ fontWeight: 600 }}>{formatAmount(measured, u.amount)}</strong> {u.label}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <IntentionCard key={day.id} dayId={day.id} initial={day.intention ?? ""} locked={day.closed_at !== null} />

      <TasksCard
        key={`tasks-${day.id}`}
        dayId={day.id}
        initial={tasks}
        locked={day.closed_at !== null || sprintOver}
        lockedReason={day.closed_at !== null ? "Locked with the closed day" : "The sprint window has ended"}
      />

      <HighestImpedimentCard sprintId={sprint.id} impediments={items.impediments} locked={sprintOver} />

      <SprintItemsRow sprintId={sprint.id} items={items} library={library} locked={sprintOver} />

      <MantraCard sprintId={sprint.id} initial={sprint.mantra} />

      <CloseCard
        sprintId={sprint.id}
        measured={measured}
        goal={goal}
        day={day}
        offered={offered}
        canClose={canClose}
        cannotCloseReason={cannotCloseReason}
        tz={sprint.tz}
        celebration={sprint.celebration}
      />

      <PlanCard
        sprintId={sprint.id}
        measured={measured}
        goal={goal}
        initialMode={sprint.target_mode === "custom" ? "custom" : "same"}
        days={days}
        todayInSprintTz={todayInSprintTz}
        sprintOver={sprintOver}
      />
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{ border: "1px solid var(--divider)", borderRadius: 14, padding: "14px 16px" }}>
      <div style={{ fontSize: 10.5, color: "var(--muted)" }}>{label}</div>
      <div style={{ fontSize: 21, fontWeight: 700, marginTop: 4, letterSpacing: "-0.01em" }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{sub}</div>
    </div>
  );
}
