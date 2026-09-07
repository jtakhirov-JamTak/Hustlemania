# Reconciliation — UI v8 handoff and the Insights/Vision draft against SPEC v1

Date: 2026-09-06. Purpose: decide, row by row, what the new inputs change in
`docs/SPEC.md` before any interview or code. Nothing in this file is a decision until
the **Your call** column is filled and the result is copied into SPEC Part 2 §5.

## Inputs

| Id | File | What it is | Standing |
|---|---|---|---|
| R | `docs/mockups/ui-v2/handoff_sprint_ui_v8/README.md` | UI reference v8: visual language, every screen, plus behaviour it needs (close questions, insight cards, vision steps, postmortem) | Authoritative on **look** once adopted. Its behaviour claims are proposals, reconciled below. Its own header says: where prototype and README disagree, follow the README. |
| P | `…/Sprint App v8 Libraries.dc.html` + `support.js` + `_ds/` | Working prototype | Mockup of record for screens once adopted. Not read line by line; R describes it. |
| S3 | `…/spec_v3.md` | Bundled "Product Requirements" | **Byte-identical to the old handoff's `spec.md`** (`diff` empty), which SPEC v1 already records as an older, superseded PRD draft. It lacks the PRD's §13 hard rules, the archive/scope/date-range rules, and says an unbalanced plan "is informational" — rejected in `docs/DECISIONS.md` 2026-09-05 (F3). **Ignored entirely.** |
| D | `docs/drafts/Changes to Insights and Vision pages.docx` | Draft (ChatGPT-assisted) for Insights, Day Close observations, Vision, and the library editors | Claims to test. Where D and R disagree, a row below says so. |
| PRD | `docs/references/14-Day-Goal-Sprint-Req.md` | Behavioural reference SPEC v1 defers to | Unchanged. Still wins on behaviour unless a row below records a delta. |

## Part 1 of the SPEC (Problem) — unchanged

No input touches outcome, users, requirements, constraints, or failure conditions.
"Insights are rule-based statistics" still holds: every new insight is a count or a
median over closed days. One requirement gets **more** specific, not different:
"no patterns" was the stated pain, and the four insight cards are the first direct
answer to it.

## A. Unchanged — SPEC holds, nothing to do

| Area | Evidence |
|---|---|
| Palette Lake (`#2b7ea8` accent, ink `#16242e`, met `#2f7d52`, under `#c0392b`), Plus Jakarta Sans, cards radius 20px, buttons radius 12px, pills, sidebar 266px, stack at ≤940px, sticky header with three tabs, kickers, hint-beside-disabled-primary, selection rows with leading square/circle, "locked" said quietly, colours never words for met/under | R visual language = old README on every one of these; the e2e pins for font, 20px radius and 266/390px sidebar stay valid |
| Every PRD §13 rule 1–29 and everything F1–F5 built on them: RLS, `start_sprint`, `close_day`, targets balance and locking, tasks, streaks, backfill, membership date ranges, archive/scope/delete rules | R "Interactions & state (unchanged rules)" restates F5; D says "preserve legacy records, eligibility, selection limits, RLS, archive/scope/delete rules, closed-day history" |
| Day Close is two steps: Actual → what happened → result | R step 1/2; D "preserve the two-step Close flow" |
| New Sprint dialog: 4 steps, 800px, same step contents (step 4 grows, see B5) | R |
| Libraries: scope chips All/Global/Health/Wealth/Relationships, ↑↓ rank, archive/restore, delete only when unused, "Show archived (n)" | R |
| Brand **Hustlemania** (R still says "Sprint") | SPEC §5 delta, DECISIONS 2026-09-05 |
| Money in minor units, whole units in the UI; hours as minutes; `usage_of_funds` jsonb array already stores allocations, so R's "5,000 savings · 3,000 debt" line needs no schema change | `0001_init.sql` |
| F8 Circles, F9 evening reminder, F10 export / PWA / deploy | No input mentions them |

## B. Changed — SPEC says X, an input says Y

Each row needs a call. **Rec** = my recommendation, stated so it can be overruled.

| # | SPEC v1 says | Input says | Cost if taken | Rec | Your call |
|---|---|---|---|---|---|
| B1 | Today's target **92px** desktop / 64px phone; page titles 38px; outcome h1 32px; highest name 22px | R: target and actual **64px** everywhere; page titles 30px; highest name 16px in the rail; result number 78px unchanged | Three e2e pins move (`golden-path.spec.ts` lines 129, 138); CSS tokens | Take R. Look is R's to own. | |
| B2 | Sprints tab = one column of cards in the user's order: header + 14-day strip → target hero with 3-up stats → Intention → Tasks → Highest → collapsed others/cues → Mantra → Close card → 14-day plan grid | R: **journal timeline** (Days 1–7 collapsed → Yesterday → Today card → Tomorrow → Days 11–14) with a 300px right rail (Mantra, Highest, Cues, Celebration, Usage of funds); rail stacks under 1240px; the 14-day strip becomes 14 thin segments in the header; the plan grid becomes inline "edit" on future rows plus mode chips under the timeline | The largest UI change: `TodayView`, `DayStrip`, `PlanCard`/`PlanGrid`, `SprintItemsRow`, `HighestImpedimentCard`, `MantraCard`, `CloseCard` all re-laid; SPEC §5's Today-order delta is superseded | Take R. This is the design you want to keep. | |
| B3 | **Daily Intention** per day, pre-plannable at setup (user delta vs PRD; built: `sprint_days.intention`, `p_intentions`, `IntentionCard`) | R and D: no intention field. R's Today card asks "How do I intend to produce today's target?" above the **tasks** | If dropped: card removed, column and setup pre-plan stay (history value), one e2e step changes. If kept: needs a place in R's Today card that R does not draw | Keep the data, decide the UI: either (a) the intention becomes the first line of the Today card under that prompt, or (b) drop the card. I lean (a): it was your call twice. | |
| B4 | Close step 2: "Which impediments hurt?" + most-damaging radio; "Which cues helped?" + most-useful radio (built: `day_impediment_hurt`, `day_cue_helped`) | R + D: **observations** replace judgments: which impediments *occurred*, which cues were *used*, and for the Highest: did the response run, did you recover, how much did it cost. See C1 and D3 for the exact shape | New tables, `close_day` signature, `CloseFlow` step 2, Insights source | Take it. This is the whole point of D. Keep the old tables read-only for history (D: "preserve historical judgments"). | |
| B5 | Highest Impediment proof point = WHEN → THEN (rule 6; `proof_when`, `proof_then`; snapshotted on the day row) | R + D: WHEN → THEN → **RECOVERED WHEN**, an observable recovery criterion, required for the Highest at setup and whenever it changes; D adds "with a time window" as guidance; D: preserve the rule version evaluated each day | Column `proof_recover`; rule 6 and the rule-22 trigger extend to it; `start_sprint` / `set_highest_impediment` validate it; day snapshot gains it; wizard step 4 and the picker modal add the input | Take it. Additive migration; extends existing tests. | |
| B6 | Cue = name + optional explanation | R: **WHEN** (trigger) → **REMIND** (the name), trigger optional, "add the when under Edit". D: Name → WHEN to use → Reminder/question/action, **trigger and response required for new cues** | Column `trigger`; editor and card layout; Add row | Take the model; requiredness is D5. | |
| B7 | Impediment = name + explanation + WHEN/THEN | R + D: **SITUATION** (name) → **INTERFERES** (explanation) → WHEN → THEN → RECOVERED. Relabel plus B5 | Labels and card layout only beyond B5 | Take it. | |
| B8 | Vision = one textarea per Area, Save, Replace & archive, archived list (built: `visions` with `area`, `body`, `archived_at`) | R + D: **three annual steps** — Define vision (+ evidence) → Identify main obstacle (**is** a global impediment in the library, picked or created) → WHEN → THEN guiding rule (**is** that impediment's proof point) — then a saved overview with Edit, Review vision, Replace (two-tap), three summary cards, Library card, "Sprints behind this vision". D adds required fields and dated reviews (see D6, D7) and atomic save of vision + new impediment | Columns on `visions` (evidence, obstacle impediment id, reviewed/… see D7), one DB function for the atomic save, three-step form, overview page | Take it, subject to D1 (cardinality) which decides whether this runs once or per Area. | |
| B9 | F7 Insights: per Area and All: % of Goal per sprint, impediment/cue frequency on lowest vs highest days, most damaging/useful, task completion vs result; Sprint History table | R + D: **four cards** — Impediment impact · Response follow-through · Response recovery · Cue usefulness — in two views: **Reviews** (single-sprint postmortem) and **Across sprints** (scope chips by Area, "Suggested kit", "How to read this"). Calculations in D. History table absent from R (finished sprints appear as Reviews rows: Met/Under) | F7 rewritten; nothing built yet, so no rework | Take it. Metric choice is D4; history table is D9; task-vs-result is D10. | |
| B10 | F6 Review: goal, total, %, per-day, most useful/damaging, highest + proof point, one lesson, "advanced the vision?" | R: **postmortem** = result card + the four insight cards + proof-point **verdict** (Worked / Partly / Didn't) + lesson + moved-vision + **Carry forward** per item (Keep / Promote to highest / Drop; Keep / test more / Drop) → stored as the Area's **kit**, pre-filling the next New Sprint's step 4; lesson pinned on Day 1 of the next sprint | `reviews` gains verdict, decisions, kit; wizard reads the kit; Day 1 shows the lesson. F6 not built, so respec only | Take it. | |
| B11 | Sidebars: Sprints has a full-width "New Sprint" button; Vision lists three Area visions; Insights lists Health / Wealth / Relationships / All / History | R: Sprints has no button (the empty-area card carries "Create a {Area} sprint"); Vision lists Vision (`n of 3` steps) · Execution cues · Impediments · Data & export; Insights lists **Across sprints** then a **Reviews** section (needs-review first, finished after, running never) | `SideNav` content per tab | Take R, except the Vision row depends on D1. | |
| B12 | — | R: right after closing, a faint **"Set up tomorrow"** block lists impediments that "Didn't show up today" and cues "Not used today" with Remove, plus Add; Done dismisses | UI over existing `add_sprint_item` / `remove_sprint_item`; must respect rules 3–4 minimums (the DB already does) | Take it, small. | |
| B13 | Look = Lake | R/P: four palettes (Lake · Meadow · Dusk · Sand) as a prototype tweak | A user setting and a theme layer | **Do not take.** Prototype knob, not a feature. Lake only. | |
| B14 | Breakpoint 940px | R adds **1240px**: journal + rail stack to one column; rail becomes static | One media query; the phone e2e sidebar pin (390px) unaffected | Take it. | |
| B15 | F10 export | R: "Data & export" card with "Saved on this device only", Export JSON, **Load sample sprint**, **Reset all data** | — | Export JSON = F10 as is. Load sample and Reset are prototype devices: **do not take.** | |
| B16 | Confirmations use native dialogs (audit remediation phase 4) | R: **two-tap** destructive pattern ("Tap again to…", turns red) for End sprint early, Replace vision, Reset | A small shared component; touches End-early (F6, unbuilt) and Replace (B8) | Take it for those two actions; keep native dialogs elsewhere. | |
| B17 | Completion band on the Close card; End sprint early link in the header | R: **Complete sprint** primary lives in the rail's Celebration card when cumulative ≥ goal; **End sprint early** is the card's footer (two-tap); an ended sprint shows a full-width **Review gate** card → "Open the postmortem" | F6 placement; unbuilt | Take it. | |
| B18 | Mantra card with "Edit" | R: mantra in the rail, tap to edit inline, streak line under it | `MantraCard` moves; streak label moves from the header | Take it (part of B2). | |

## C. New — no SPEC entry exists

| # | Feature | Source | Depends on | Notes |
|---|---|---|---|---|
| C1 | **Day observations.** Per closed day: for each offered impediment, occurred yes/no/unsure/unanswered; for each offered cue, used yes/no/unsure/unanswered; for the Highest: response ran (yes/no/[partially]/unsure), recovered (yes/no/unsure), perceived impact (nothing/some/a lot/unsure). Unanswered is stored distinctly from No, Unsure, and not-applicable. Item wording and the proof-point version are snapshotted with the observation. Days closed before this exists stay "missing": never block a close, never count as negative. First occurrence of the day is the one assessed, and the question says so. | D (model), R (UI) | B5 | New tables, `close_day` extension, `day_offered_items` stays the single owner of who is asked. Evaluator: migration creating user-data tables. |
| C2 | **RECOVERED WHEN** on impediments | R, D | — | See B5. |
| C3 | **Cue trigger** (WHEN) | R, D | — | See B6, D5. |
| C4 | **Vision v2**: three steps, evidence, obstacle link, review stamps | R, D | C2 (the obstacle carries WHEN/THEN/RECOVERED) | See B8, D1, D6, D7. |
| C5 | **Insight calculations** as SQL views/functions: occurrence days / assessed days; attainment on occurrence vs non-occurrence days; follow-through rate (partial reported separately); recovery rate with vs without the response; cue attainment used vs unused when available. Each shows both group sizes, logging coverage over elapsed eligible days, backfill count. Closed, non-cancelled, positive-target days only. Unsure/unanswered excluded from denominators. Cross-sprint = each sprint's own comparison listed, grouped by item + version + Area, never pooled; "n ≥ 3 does not establish reliability" stated. Associations, never causes. | D (rules), R (cards) | C1, C2 | Metric is D4. |
| C6 | **Postmortem v2**: verdict, carry-forward decisions, per-Area kit, pinned lesson on Day 1 | R | C1, C5 | See B10. |
| C7 | **Set up tomorrow** block after close | R | — | See B12. |
| C8 | **Journal timeline** rows: closed row summary line (`800 of 715 · showed up: …`), missed row → backfill, future row → inline target edit, summary rows expand | R | C1 for the summary text | See B2. |
| C9 | **Focus cue**: one user-selected cue per sprint whose use is tracked daily, independent of any impediment | D only | C1 | R has nothing of this; the cue-use observation (C1) already tracks every offered cue. See D11. |
| C10 | Optional **mental rehearsal** prompt after saving a cue or impediment | D only | — | Undefined beyond one sentence. Recommend BACKLOG until it has a shape. |
| C11 | **Quality guidance** copy on editors: recognisable trigger, specific response, feasible in context; helper examples covering missing skills, practical constraints, avoidance/forgetting | D | — | Copy only; goes in the editor spec of B6/B7. |

## D. Conflicts — inputs disagree with each other, the PRD, the schema, or a recorded decision

| # | Conflict | Sides | Rec | Your call |
|---|---|---|---|---|
| D1 | **How many visions?** | PRD §2, rule 2, built schema (`visions.area`), and R's own Sprints sidebar ("Vision not written yet" per Area row): **one per Area**. R's Vision tab and its data model (`visionText`, `visionMeta`, singular; "Sprints behind this vision" lists every Area): **one vision total**. D says "Annual Vision" and never mentions Areas. | Keep **one per Area** (PRD, rule 2, schema, and the Sprints sidebar all assume it). The three-step flow runs per Area; the main obstacle is a global impediment, so two Areas may point at the same one. R's Vision sidebar row becomes three rows (one per Area, meta `n of 3` each). This is the decision with the widest blast radius: if you want a single vision, rule 2 and `start_sprint` change. | |
| D2 | **Unbalanced plan** | S3: "informational, does not block". PRD §6 reconciliation, rule 11, SPEC F3, DECISIONS 2026-09-05: **blocked**. R's timeline shows `Planned · Goal · delta` + Done without saying. | Stays blocked. S3 is ignored (see Inputs). | |
| D3 | **Shape of the step-2 questions** | R: multi-pick pill lists per group with **None** and **Unsure** (Unsure clears the list); Response only if the Highest was picked; Recovery only if Response = Yes; Impact only if the Highest showed; hurt/helped gone (`impTop` "legacy display only"). D: a **per-item** yes/no/unsure for every impediment and cue; Response yes/no/**partially**/unsure; Recovery asked **even when the response was unused**; hurt/helped and notes **kept, optional**. | Storage follows D (per-item tri-state rows; that is the only way "unanswered ≠ No" exists). UI follows R (pills render the rows: picked = yes, None = all no, Unsure = all unsure, untouched = unanswered). Four sub-calls: (a) Partially: D's "report partial separately" is cheap — take it. (b) Ask recovery when the response did not run: take D, it is what "recovery with vs without the response" (C5) needs. (c) Impact: R only; take it, optional. (d) Keep hurt/helped as optional questions: **no** — drop them from the flow, keep the tables for history; occurrence + impact replaces "hurt", use replaces "helped". | |
| D4 | **Insight metric** | R: **on-target rate** (% of days at or above target) with vs without; tail in points (`−31 pts`). D: **median daily target attainment** (Actual ÷ Target on positive-target days) with vs without. | Take D's metric, render in R's card shape (two bars = the two medians, tail = the difference in percentage points). Attainment carries more signal than a binary hit rate on a 14-day sample. | |
| D5 | **Cue trigger required?** | R: optional, "add the when under Edit". D: required for **new** cues. | Required in the create editor and the wizard's inline create; nullable in the DB so existing rows and inline quick-adds from Day Close pickers still work. Existing cues show R's italic "add the moment this should fire". | |
| D6 | **Vision step 1 fields** | R: vision text (required) + "What would prove it happened?" (optional). D: desired future, annual deadline, personal meaning, current baseline, observable success criteria — all required — plus a one-line invitation to picture the benefit. | Take R's two fields as required (text + evidence), add **meaning** and **baseline** as optional prompts on the same card, skip a deadline (it is "one year" by definition). Five required fields is the friction your failure condition #1 warns about. | |
| D7 | **Vision review record** | R: one `reviewedISO` stamp, overwritten. D: reviews record dated evidence and **preserve previous entries**. | Take D: a `vision_reviews` table (date, still-true / needs-changes, evidence note). Overwriting a stamp deletes history, which the global rules forbid. | |
| D8 | **Daily Intention** | SPEC (user, twice) + built. Absent from R and D. | See B3. | |
| D9 | **Sprint History table** | SPEC F7 + Part 2 §1 (History **is** the outcome measurement) + PRD §11. R: no table; finished sprints appear only as Reviews rows in the Insights sidebar and as read-only postmortems. | Keep a compact list: R's Reviews sidebar rows already carry Met/Under; add `% of goal` to the row sub-line and the measurement in §1 is satisfied without a new screen. | |
| D10 | **Task completion vs result** insight | SPEC F7. Not in R's four cards or D. | Drop to BACKLOG. Tasks stay (F4); the insight waits. | |
| D11 | **Focus cue** | D only. | Do not take. C1 already observes every offered cue's use each day; a single "focus" flag adds a concept without adding data. Revisit if cue-usefulness cards prove noisy. | |
| D12 | **Archive rules** | S3's weaker rules ("require a replacement before archiving the Highest"). PRD and F2 as built are stricter and atomic. | F2 stands. | |
| D13 | **Sidebar "New Sprint" button** | SPEC F1 (built). R: none. | Take R (B11). | |

## Proposed build order after the decisions

Existing F1–F5 stay as built; their SPEC entries get a one-line "superseded on
screen by F7" note where B2 changes their UI. Old F6–F10 are renumbered. Dependencies
run data → close flow → screen, so the restyle is built once, with its final content.

| New # | Feature | From | Evaluator |
|---|---|---|---|
| (pre) | Enabling pass: inline styles → classes, Tailwind kept or dropped, no visible change | session-context | none (direct build) |
| F6 | Libraries v2: cue trigger, impediment RECOVERED WHEN, relabels, editors with guidance, rule 6/22 extension, day snapshot | B5 B6 B7 C2 C3 C11 | none (additive columns) |
| F7 | Day observations: step-2 question set, tables, `close_day`, legacy handling, "Set up tomorrow" | B4 B12 C1 C7 D3 | yes (user-data tables) |
| F8 | Journal restyle: timeline + rail, 64px, sidebars, 1240px, mantra/streak in rail, intention decision, e2e pins moved | B1 B2 B3 B11 B14 B18 C8 | none |
| F9 | Vision v2: three steps per Area, evidence, obstacle link, overview, reviews, two-tap replace | B8 B16 C4 D1 D6 D7 | yes (user-data table) |
| F10 | Sprint completion + postmortem v2: complete / end early, review gate, verdict, carry-forward, kit, pinned lesson | old F6, B10 B17 C6 | yes |
| F11 | Insights v2: four cards, Reviews + Across sprints, calculations, coverage, history rows | old F7, B9 C5 D4 D9 | none |
| F12 | Circles | old F8 | yes |
| F13 | Evening reminder | old F9 | yes |
| F14 | Pre-release | old F10 | yes |

Amended 2026-09-07 after the spec review (`docs/audits/spec-review-2026-09-07.md`):
the single-sprint calculations (C5) move from F11 into F10, since the postmortem
renders the cards; F8 keeps the journal and the Sprints sidebar only (Vision tab and
sidebar → F9, Insights sidebar → F11); "Set up tomorrow" (B12 / C7) moves from F7
to F8; the day-row snapshot of RECOVERED WHEN moves from F6 to F7; the cue column is
`cue_when`.

Alternative considered: restyle first (F8 before F6/F7). Rejected because the Today
card's "reviewing" state renders the new question set; building it on the old
questions and swapping later is one screen built twice.

## Decisions — 2026-09-06, made row by row in session

The **Your call** cells above are superseded by this list. Rec taken unless stated.

| Row | Call | Departs from Rec? |
|---|---|---|
| D1 | **One vision total**, not one per Area. Rule 2 becomes "a sprint requires the vision"; `visions.area` goes; the Sprints sidebar sub-line reads "Vision not written yet" for every Area until it exists; the main obstacle is one global impediment. | Yes |
| B2 + B1, B11, B14, B17, B18 | Journal layout as drawn: timeline + rail, 64px target, new sidebars, 1240px breakpoint, mantra and streak in the rail, completion in the Celebration card. | — |
| B3 / D8 | Daily Intention stays, as the first line of the Today card under "How do I intend to produce today's target?". | — |
| D3 | Per-item tri-state rows in the DB (yes / no / unsure / unanswered); README pills render them. | — |
| D3 a–c | Partially reported separately; recovery asked whenever the Highest occurred; impact kept, optional. | — |
| D3 d | Hurt/helped questions dropped **and the two tables `day_impediment_hurt` / `day_cue_helped` dropped** (no real sprint exists before release). A table-dropping migration is destructive → evaluator on that feature. | Yes |
| D4 | Median attainment (Actual ÷ Target, positive-target days) in the README card shape. | — |
| D9 | Finished-sprint rows in the Insights sidebar carry % of goal; no history table. | — |
| D5 | Cue trigger (WHEN) **required on every create path**, pickers included; existing rows stay null and show the italic prompt. | Yes |
| D6 | Vision step 1: **three required** — vision text (the desired future), annual deadline, "What would prove it happened? (observable success criteria)"; personal meaning and current baseline optional on the same card. | Yes (deadline added) |
| D7 | `vision_reviews` table; nothing overwritten. | — |
| D10 | Task completion vs result → BACKLOG. | — |
| D11 | **Focus cue in scope**: one user-selected cue per sprint whose use is tracked daily, independent of occurrence, alongside the per-cue use observation. Needs a place in the rail and in step 2; not drawn in R. | Yes |
| C10 | Mental rehearsal prompt → BACKLOG. | — |
| B4, B5, B6, B7, B8, B9, B10, B12, B16 | All taken as recommended. | — |
| B13 | **Palette Dusk** (accent `#5b5bd6`, ink `#1c1b2a`) replaces Lake, **plus a night mode** the user can switch to. No night palette exists in R or P; its tokens are a design input still owed before the restyle feature is specified. Meadow, Sand, Lake: not offered. | Yes |
| B15 | No Load sample, no Reset, and **no data export in v1** (F10's "Export my data" and Part 1's "personal data exportable" move to BACKLOG; Data & export leaves the Vision sidebar). | Yes |
| Order | Enabling pass as a direct build, then F6 Libraries v2 → F7 Observations → F8 Journal restyle → F9 Vision v2 → F10 Completion + postmortem → F11 Insights v2 → F12 Circles → F13 Reminder → F14 Pre-release. | — |

## What happens next

1. These calls are copied into SPEC Part 2 §5 as dated lines; R replaces the v4
   handoff as the mockup of record; S3 is recorded as ignored; F6–F10 are renumbered
   F10–F14 and F6–F9 stubs point here until `/interview` fills each.
2. The enabling pass runs as a direct build.
3. `/interview` (feature mode) per row of the build order, in that order.
