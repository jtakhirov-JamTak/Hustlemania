# 14-Day Goal Sprint App — Product Requirements

## 1. Purpose

Turn a 1-Year Vision into measurable 14-day Sprints and learn which obstacles and practical reminders affect results. Impediments receive greater emphasis than reminders.

**Area → Vision → Sprint → Daily Target → Actual Result → Insights**

Today answers: **What do I have to produce today?** Yesterday provides data without automatically creating work debt. Engagement should improve execution, not maximize screen time.

## 2. Areas and Vision

- Fixed Areas: Health, Wealth, Relationships; no custom Areas.
- Each Area has one active, editable 1-Year Vision. A Sprint requires its Area's Vision; users may configure one Area and start without configuring the others.
- Replacing a Vision archives the previous version and preserves Sprint history and master libraries.
- Allow one active Sprint per Area, up to three simultaneously. No queued Sprints behind an active Sprint.

## 3. Behavioral tools

| Tool | Purpose and rule |
|---|---|
| Execution Cue | Practical mindset, reminder, question, or principle that helps execution. Example: “Ask how much this pays whenever I schedule something.” |
| Impediment | Obstacle likely to prevent success, such as avoidance, distraction, or poor sleep. |
| Highest Impediment | User-designated primary threat among the Sprint's Impediments; required throughout the Sprint. |
| Proof Point: WHEN → THEN | Preplanned response attached to an Impediment. Required for the Highest Impediment; optional for others. |
| Mantra | Required Sprint-level inspirational phrase, always visible on Today and editable during the Sprint. Present as a quote. |

Example Proof Point: **WHEN** I catch myself delaying my first work block, **THEN** I start a 10-minute timer and begin the smallest executable task.

The Highest Impediment can change during a Sprint without rewriting past Day records. Proof Points can be edited and reused across Sprints.

## 4. Master libraries

Execution Cues and Impediments live in separate persistent libraries with no quantity limit. Each item has a name, optional explanation, user-selected scope, manual priority/rank, active/archive status, and historical Sprint references. Impediments may also store a Proof Point.

- Scope: Global, Health, Wealth, or Relationships. Global items are eligible for any Sprint; Area items only for that Area.
- Default view: All. Filters: Global, Health, Wealth, Relationships. Filtered views preserve relative ranking.
- Users can edit names, descriptions, scope, rank, and Proof Points at any time. Edits retain item identity and historical associations; current master and active-Sprint views use updated wording.
- Permanently delete only items never associated with any Sprint.
- Archive used items to preserve evidence. Archived items disappear from normal views and selection lists and appear only inside the collapsed **Archived** section at the bottom of the library page. Expanded entries can be viewed; restoration may be supported.
- Archiving an active Sprint item also removes it from that Sprint. Block removal if it leaves fewer than one Cue or Impediment. Before archiving the Highest Impediment, require a replacement with a valid Proof Point.

Each active Sprint contains **1–3 Execution Cues** and **1–5 Impediments**. Users may add, remove, replace, or edit them during the Sprint within those limits. Removing an item from a Sprint leaves it in the master library. Inline creation also saves it to the library.

## 5. Sprint setup and measurement

A normal Sprint lasts **14 calendar days**, starting Today or Tomorrow. Setup requires:

- Area, active Vision, Sprint outcome, and confirmation that the outcome meaningfully advances the Vision.
- One numeric Goal, measurement type, and currency/unit.
- Confidence from 1–10, with 6–8 highlighted as the ideal stretch range.
- Why the Sprint matters, Celebration, and Mantra.
- Usage of Funds for Money Sprints: “If I earn this money, what will I use it for?”
- Daily Targets, selected Cues and Impediments, and a Highest Impediment with a valid WHEN → THEN.

| Measurement | Input and storage |
|---|---|
| Money | Whole currency units, no cents; default USD, editable before start. |
| Hours | Hours and minutes; store as minutes. |
| Quantity | Whole numbers with a named unit; no decimals. |

The Sprint Goal, measurement type, and currency/unit lock at start. A materially different Goal requires another Sprint. Daily planning changes do not change the Sprint Goal.

## 6. Calendar and Daily Targets

Show all 14 days with **Sprint day number, weekday, and calendar date** in setup, daily planning, and history. Today shows its day number, weekday, date, and progress through the 14 days. Show the Sprint's start and end dates so weekends and nonworking days are clear.

The Sprint locks its starting time zone. Travel does not change day boundaries; days advance at midnight in that zone, even if the app is unopened. Day-close deadline is 11:59 PM.

### Target modes

| Mode | Behavior |
|---|---|
| Same daily target | Default to Goal ÷ 14. Distribute whole-unit or minute remainders so the initial plan totals the Goal. Explain any rounding differences. |
| Custom daily targets | Let users set each day's Target independently, including zero for nonworking days. Before starting, all 14 Targets are editable; after starting, only future Targets are editable. |

Custom mode can be selected during setup or during an active Sprint for remaining future days. Editing one custom Target **does not redistribute other days**, require matching another day's Target, or force the planned total to equal the Sprint Goal.

Show the **planned total, locked Sprint Goal, and amount above/below Goal**. A mismatch is informational and does not block saving or starting. The Goal remains the success threshold even when the plan differs.

Past Targets and today's Target are locked once their day begins. For a Sprint starting Today, configure today's Target before starting; it locks at Sprint start. All Targets are nonnegative and follow the selected measurement's precision.

Actual underperformance or overperformance never automatically changes future Targets. Users must deliberately edit their future plan.

## 7. Navigation and Today

Three horizontal tabs with contextual left navigation and a scrollable central workspace:

| Tab | Contents |
|---|---|
| Sprints | Sidebar lists active Sprints; selecting one opens its Today workspace. Show one Sprint centrally at a time. |
| Vision | Three Area Visions and the Execution Cue and Impediment libraries, including scope filters and collapsed archives. |
| Insights | Health, Wealth, Relationships, All Areas, and Sprint History. |

Today combines planning, execution, Tasks, and Day Close on one page, in this order:

1. **Today's Target**, visually dominant.
2. Day number, weekday, calendar date, and 14-day progress.
3. **Mantra**, always visible.
4. **Highest Impediment and its WHEN → THEN**, always visible.
5. Other Sprint Impediments.
6. Execution Cues.
7. Optional Tasks.
8. Actual Result / Close Day.

## 8. Tasks and Day Close

Each day starts with one blank optional Task. Users may remove it or add unlimited Tasks, each with text and completion status. Incomplete Tasks do not roll over automatically; users may recreate them. Task data feeds Insights, but completion does not determine Goal accomplishment.

Day Close collects:

1. **Actual Result first:** a number, including zero; no explanation required before entry.
2. Impediments that hurt; “None” is valid. If any are selected, require the most damaging one.
3. Execution Cues that helped; “None” is valid. If any are selected, require the most useful one.
4. Optional notes; no mandatory long-form journaling.

Below-target Actual is red; at/above-target Actual is green with satisfying completion feedback. Do not use explicit HIT/MISS labels, XP, coins, arbitrary points, or unrelated rewards.

Closing a Day permanently locks Actual, Tasks and completion, helped/hurt selections, highest-impact selections, and notes.

## 9. Streaks and missed days

- Each Sprint has its own streak. Truthfully closing before midnight preserves it, even with zero Actual or a missed Target.
- Missing the close deadline breaks the streak. No grace day, repair token, or retroactive restoration.
- Missed, unclosed days may be backfilled while the Sprint remains open with Actual and the required helped/hurt selections. Backfilled Actual counts toward totals, Goal achievement, and Insights, but never repairs the streak.
- No backfill after Sprint closure. A new Sprint starts a new streak.

## 10. Sprint completion and review

**Success = cumulative Actual ≥ locked Sprint Goal.** Daily misses, Tasks, and Cue usage do not independently determine success.

- Reaching the Goal unlocks **Complete Sprint**; it does not automatically end the Sprint. Choosing it cancels future days without counting them as missed, records early completion when applicable, surfaces Celebration, and begins Review.
- **End Sprint Early** is available without reaching the Goal. Preserve existing data, cancel future days, record **Ended Early**, and require Review.
- Review is required after normal completion, early success, or ending early. The next Sprint in that Area cannot start until Review is complete.

Review includes Goal, total Actual, percentage achieved, daily performance, Cue and Impediment patterns, most useful Cues, most damaging Impediments, Highest Impediment, WHEN → THEN observations, one key lesson, and whether the Sprint meaningfully advanced its Vision. Completing Review enables **Start Next Sprint**, beginning Today or Tomorrow.

Celebration becomes subtly more visible as success approaches and prominent on successful completion.

## 11. Insights and history

Show recurring relationships between results, Cues, Impediments, and behavioral responses. Frame findings as **patterns or associations**, not proven causation. Example: “Starting late appeared on four of your five lowest-result days.”

Global items accumulate evidence across Areas while retaining each observation's source Area. Compare Areas using **percentage of Sprint Goal achieved**; never directly add Money, Hours, and Quantity.

History preserves Area and Vision; Goal, measurement and unit; daily dates, Targets and Actuals; Tasks and completion; Cues, Impediments and scope; Highest Impediment and Proof Point; helped/hurt and impact selections; streak; Usage of Funds, Mantra and Celebration; completion status, Review and lesson. Master edits must not destroy or disconnect historical evidence.

## 12. Platform, persistence, and privacy

- Initial platform: responsive web app / PWA. Desktop emphasizes Vision, setup, libraries, ranking, Insights and history. Phone emphasizes Today, Tasks, Actual and Day Close. Native apps may come later.
- Save active edits immediately, including Tasks, completion, library items, rankings, Sprint selections, Proof Points, Mantra and future daily plans. Refresh must preserve them.
- Keep Close Day, Complete Sprint, End Sprint Early, Archive, permanent deletion and Vision replacement deliberate actions.
- Personal data is private by default and exportable. Exact export format is not an MVP blocker.
