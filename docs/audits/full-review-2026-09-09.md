# Full review — 2026-09-09

`/full-review` over the committed range `db40dee..HEAD` (clean tree at `9cd1325`): the v8
UI re-baseline that dropped Tailwind, then F6 libraries v2, F7 day observations, F8 journal
restyle, F9 vision v2, F10 sprint completion / postmortem, F11 Across sprints — everything
since the 2026-09-05 audit remediation. Preceded by `/review-changes` on `9cd1325` alone.
Nine report-only reviewers (adversarial, correctness, security, mobile, a11y, performance,
privacy, simplification, architecture) plus a live catalog read of the local stack. The
first launch died on a spend limit before producing anything; only the performance report
survived it and the other eight were re-run. `docs/` was out of scope; `.claude/exceptions.md`
does not exist, so nothing was suppressed.

**Verdict at the start: STOP (2 CRITICAL).** Both CRITICALs and the four F11 findings were
fixed first (FIX_LOG 2026-09-09, migration 0016). The user then chose to fix every open
HIGH and MEDIUM (#5–#29); that second pass is migration 0017 plus the component, CSS and
loader changes recorded in FIX_LOG 2026-09-09 ("Every Across / Vision number…", "Ending a
sprint before it ran…", "Second-pass fixes…"). **After the second pass every CRITICAL,
HIGH and MEDIUM below is fixed**, with two MEDIUM sub-items deferred to BACKLOG as design
calls (`--divider` contrast, host-zone timestamp formatting). The LOWs remain open.

## Phase 1 — verification gate

`npm run verify` green on the committed tree before any review: typecheck, lint, hooks
60 / 21+23 / 6+5, unit 114, DB 270, e2e 10 on desktop + phone. Two `destination stream
closed early` lines in the dev-server log during e2e teardown (known, BACKLOG).

## CRITICAL — both VERIFIED live, both FIXED

1. **Remove an item mid-sprint, add it back, and the review can never be finished.**
   `remove_sprint_item` keeps the row as history and `add_sprint_item` inserts a new one;
   `finish_review` wrote one decision per membership row and hit the (review, kind, item)
   unique key, rolled back, and the client read the generic "try again" forever. Rule 26
   then locked the Area. The same duplicate doubled every count in `insight_impediment_impact`
   and `insight_cue_usefulness` and rendered two decision rows. Probe: two rows, `used_days 2`
   from one closed day, `duplicate key value violates unique constraint`. — grill C1 + H1.
2. **Promote a different highest impediment after the first one occurred, and the postmortem
   demands a verdict the UI never offers.** `finish_review` tested any `was_highest`
   observation; the follow-through function and `verdictApplies` read only the current
   highest. Probe: follow-through `occurrences 0`, `finish_review(null) → verdict_required`,
   `finish_review('worked') → OK`. — correctness H1, architecture #1, grill C2.

## HIGH

3. **F11 — recovery note contradicted the rate beside it** (FIXED). `lib/across.ts` voted
   from the with/without buckets; the SQL's rate includes unsure-response days. Executed:
   `67% recovered` beside `0 of 1 sprint`.
4. **F11 — the Suggested kit quoted another impediment's recovery rate** (FIXED).
   Executed: "Starting late … recovers 60%" where 60% was Doomscrolling's.
5. **Silent truncation at PostgREST's 1000-row cap.** `loadAcross` and `loadReviewStats`
   read `sprint_days_effective` with no filter or limit (`lib/data.ts:794, 844`); the cap
   lands at ~72 fully-closed sprints (≈11 months of three-area use). After it, closed days,
   on-target, every coverage denominator and the rail's goals-met are wrong with no signal.
   `loadVisionSprints` (`:148`) reads every closed `sprint_days` row behind the vision and
   truncates inside year one (1,092 rows/yr at three areas), turning a met sprint "Under".
   Nothing in code names the cap (`config.toml:18` only). — perf H1, H2, M4; security L6.
   Fix: a `security_invoker` view `sprint_totals(sprint_id, effective_days, on_target,
   total)` read with `.in("sprint_id", …)` from all three loaders.
6. **`/insights` issues 5N+4 requests per render.** The layout fans out N
   `sprint_review_summary` and the page 4N insight RPCs; only `loadFinishedSprints` is
   deduped by `cache()`. The SPEC's "N < 10 for years" is off by 10× for three-area use
   (≈78 sprints/yr → ≈394 concurrent requests against a 20-connection pool). — perf H3,
   architecture #2. Fix: `uuid[]`-taking invoker wrappers over the existing definer
   functions (4N → 4) and the same for the summary; revisit trigger N ≈ 20.
7. **Closing a day is silent to assistive tech.** The `Reviewing` form unmounts, focus
   falls to `<body>`, the `Closed` view mounts with no live region or focus target
   (`TodayCard.tsx:117-139`). — a11y H1 (SC 4.1.3, 2.4.3). Pattern: `CloseFlow`'s result
   screen already focuses its heading; do the same.
8. **Five in-place replacements after a server action lose focus and announce nothing:**
   Complete sprint, End sprint early (`Rail.tsx`), Finish the sprint (`FinishSprint.tsx`),
   Finish review (`Postmortem.tsx:290`), Replace vision (`VisionOverview.tsx:95`). — a11y H2.
9. **Tap floor failures on primary or destructive controls** (mobile, VERIFIED from CSS):
   wizard vision-alignment checkbox row 21px (`.wz-align`); "End sprint early" TwoTap
   17px (`.r-foot-link`); vision "Replace" TwoTap 19px (`.v-replace`); theme toggle 32px at
   ≤940 (`.theme-toggle`); text-only links "add" / "edit" / "hide" / "Back" 22–30px wide
   (`.j-link`, `.t-back`, `.t-add-task`) — "add" is the only entry to backfill a missed
   day. — mobile H1–H4, H6.
10. **Backfill modal step 1: "Continue" probably sits under the iOS numeric keypad**
    (auto-focused hero input, no Return key on the number pad, dialog geometry computed
    from CSS, not observed). — mobile H5, PLAUSIBLE.
11. **No account-deletion or data-export path exists.** The cascade from `auth.users` is
    complete on all 13 tables (verified live), so deletion is one `delete from auth.users`
    behind a confirm; export is one RPC over the 13 tables. — privacy H1; a pre-launch
    must-have for an app storing journals, visions and obstacles.

## MEDIUM

12. **F11 — postmortem coverage denominator disagreed with the Across page** (FIXED).
13. **F11 — chips under 44px on a coarse pointer above 940px** (FIXED: the touch-target
    block now applies under `(max-width: 940px), (pointer: coarse)`).
14. `app/(app)/actions/theme.ts:18` — REDIRECT-VALIDATE: `/\evil.com` and control
    characters pass the `next` guard (VERIFIED). Reach is limited by Next's server-action
    Origin check. Fix: `/^\/(?!\/)/.test(next) && !/[\\\x00-\x1f\x7f]/.test(next)`.
    — security M1, correctness M4, grill M2.
15. `lib/data.ts:864` — the rail's `goalsMet` sums `sprint_days_effective` (zero-target
    days out) while `sprint_review_summary.met` sums every closed day; a zero-target day
    closed with `actual > 0` reads "0 of 1 goals met" beside a "Met" result card.
    — correctness M2. Fix: take `met` from the summary rows `loadMeasuredSprints` already has.
16. Client "today" computed during render from the device zone (`VisionOverview.tsx:44`,
    `NewSprintWizard.tsx:126`, `VisionSetup.tsx:35`) → hydration mismatch for hours a day;
    the wizard also memoises `today` at mount, so across midnight it submits yesterday and
    Retry re-sends it. — correctness M3, grill M7.
17. `VisionOverview.tsx:230` ×2 — timestamps formatted in the host zone outside
    `stampDate`; the class now has three instances. — correctness M5.
18. "% of goal" / met computed four ways (`Journal.tsx:57`, `CloseFlow.tsx:296`,
    `lib/data.ts:163`, SQL). — correctness M6.
19. `lib/data.ts:144-168` — `loadVisionSprints` never reads `status`: a sprint ended early
    shows as running on the Vision tab until its `end_date` passes. — grill M1.
20. End early / Complete cancel today's still-open day and block every earlier backfill;
    the armed copy does not say so. — grill M3.
21. Re-clicking the already-selected Area chip on wizard step 1 replaces the step-4 picks
    with the kit prefill. — grill M4. Fix: prefill only when the area changes.
22. `finish_review` defaults removed members to `keep`, so the next sprint's kit
    resurrects what the user pruned. — grill M5.
23. Direct-table actions (`saveIntention`, `updateItem`, `saveProofPoint`, `saveMantra`,
    `updateTask`/`removeTask`, `deleteItem`) return the generic "try again" when the
    session is gone, because RLS returns 0 rows rather than an error; RPC actions say
    "sign in again". — grill M6.
24. A close submitted from a tab whose highest was changed elsewhere fails with
    `response_not_applicable` copy that contradicts the form. — grill M8.
25. A sprint ended before day 1 still demands a "key lesson" (rule 26). — grill M9.
26. Sequential round trips: `loadAreaKit` is 4 serial reads and `/sprints/new` runs it for
    three areas; `loadActiveSprint` is awaited alone before a batch that does not need it;
    `loadPostmortem` reads the sprint row alone before its 8-way batch. — perf M1–M3.
27. Accessibility (a11y M1–M9): backfill focus returns to a disabled/unmounted button;
    wizard "Step n of 4" is an `aria-label` on a plain div; `role="radiogroup"` buttons
    without arrow keys (`DayQuestions`, `LibraryPage`); the sidebar is an unlabelled
    `<aside>` and hides `.side-sub` with `display:none` at ≤940 (the "Needs review" reason
    vanishes from AT); theme toggle's accessible name omits its visible text; `aria-label`s
    override visible `htmlFor` labels in VisionSetup/VisionOverview; Remove/Delete/Archive
    buttons unmount the focused control; TwoTap's `aria-pressed` reads as a toggle; no
    h2/h3 below the h1 on Journal, Postmortem, Insights.
28. Mobile (M1–M10 + 3 summarised): `.v-mini-action` / `.poster-link` / `.pm-days summary`
    18–19px; plan inputs 35px; task/intention/notes inputs 34–36px; usage-row "×" 28px wide;
    Dusk on-accent text at opacity .85/.8 = 4.36 / 4.06:1; `.option-sub` on a selected row
    4.35:1; `input::placeholder` 3.81:1; `--control-border` 2.86:1; `--divider` 1.3:1 as the
    only boundary of chips/option rows; `manifest.ts` `theme_color` hard-coded to Dusk;
    CloseFlow step 2 notes textarea likely hides the pinned footer under the keyboard; no
    `overflow-wrap` on user text (`.r-proof`, `.v-mini-body`, `.pm-rule`, `.kit-list`,
    `.j-title`).
29. Privacy (M2, M3): `lib/observe.ts` `Ctx` accepts any string — "callers pass ids, never
    text" is a comment, not a type; the message redaction is one regex with no test feeding
    it a `Failing row contains (…)` line.

## LOW (listed once, summarised)

Security: F10 entry points and `sprint_days_effective` are granted to `authenticated` only
while earlier ones also grant `service_role` (drift; `grants.test.ts` pins neither); no
runtime shape validation of action arguments; no text-length CHECKs anywhere; a non-UUID
`sprintId` 500s instead of 404. Correctness: `friendlyError` collisions — `item_not_in_sprint`
shadowed by `not_in_sprint` (known), `no_vision_obstacle` vs `vision_obstacle` safe only by
order; four live codes have no copy; the post-window focus day is `15` in Journal and `14`
on the page; `followThrough[0]` / `recovery[0]` assumed single-row. Grill: deleting an
impediment that is an archived vision's obstacle fails with copy that cannot be followed; a
kit highest with a partial proof point forces retyping; `1e17` money passes every check and
bounces off `bigint`; four fast TwoTap taps fire twice (VERIFIED); backfill modal stays open
after Reload; intention blur-save racing a close is dropped silently; wizard "Pre-filled"
banner shows with an empty kit; a concurrent backfill during `finish_sprint` decides
ended/completed on a stale sum. Perf: `loadVision` third serial hop; `loadClosedDays` two
hops; gate branch awaits sequentially; Today serialises both full libraries into the client
`Journal`; five explicit font weights on a variable font (not verified). A11y: inline
`popIn` beats `prefers-reduced-motion`; login error not tied to the field; met/under by
colour only in three places; mantra button named by its quote; no skip link; eight more.
Mobile: `100vh` on `.page`; sub-8px gaps between adjacent targets; edge padding 10–14px in
the sidebar and header; `.option-row` 43.6px; no `:active` feedback with tap-highlight
removed; `body:has(dialog[open])` scroll lock inert on iOS; maskable icon uncropped;
`global-error.tsx` off-palette; `enterKeyHint` absent. Privacy: `select("*")` on sprints
and sprint_days flows unrendered columns to client components; theme cookie lacks
`secure`/`httpOnly`; email round-tripped through `?email=`. Architecture: `database.types.ts`
is stale (view columns) and wrong (nullability) and the `as unknown as` casts hide it;
`voteDelta` recomputes the delta with `Math.round` vs SQL `round` (sign can differ at
exactly −0.5 pt); three definitions of "finished"; `allOrThrow`'s stated rationale is wrong.

## Simplification (quality, no severity)

Top five by value: (1) one `loadInsightRows` for the four RPCs duplicated in `loadPostmortem`
and `loadAcross`, merge `loadSprintItems`/`loadSprintMembers`, let `loadReviewStats` reuse
`loadFinishedSprints` (~−47 lines); (2) a `useCloseDay` hook shared by the close modal and
the inline card plus `ErrorBar` at both sites (~−90); (3) strip `PlanGrid`'s dead backfill
branch and props (~−50 TSX, −20 CSS); (4) one generic `group()` in `lib/across.ts` (~−55);
(5) the small helpers re-typed at 30+ sites — `plural`, `shortDate`, `measuredOf`,
`useDeviceTz`, `useRestoreFocus`, `type Library` (~−50). Dead: `observationsOf`,
`isWeekend`, `shouldCapture` and five CSS classes (34 lines); 38 exports used only in their
own file; six CSS rule bodies duplicated across 15 selectors (~40 lines).

## Architecture verdict

RETHINK: sound for a one-user pre-launch app and true to its own bias (SQL owns invariants,
the view as the seam, no new definer surface without an evaluator), but one rule was decided
in two places and disagreed on a reachable input (#2, fixed) and the F11 scale claim is off
by 10× for the product's own intended use (#6). Also worth a guard: a dead-selector test
for `globals.css` (3,879 lines, four separate 940px blocks, cascade order now the spec), and
per-feature e2e specs with a shared `seedVision` instead of one serial golden path.

## Checks that HELD (so a clean area is distinguishable from an unexamined one)

Every server action is fail-closed for anonymous callers; `anon` holds no table or function
privilege (live); all 23 policies are `(select auth.uid()) = user_id`, none `true`; foreign
ids raise the same `*_not_found` as missing ones; no client-visible error echoes Postgres
text; Next's Origin check applies to every action; all 44 functions set `search_path = ''`;
both views are `security_invoker`; RLS is enabled on all 13 tables and each cascades from
`auth.users` (live); 0013 matches `grants.test.ts`; the theme cookie is allow-listed; the
login page has no redirect parameter. DB-ERROR-CHECK: every Supabase call inspects `.error`.
LINK-RESOLVE: all 20 internal targets resolve. Every input renders at ≥16px; the ≤940px
block floors `.btn/.chip/.disclosure/.link-quiet/.task-remove/.j-link/.side-link` at 44px;
Night passes every text-contrast pair. Native controls everywhere; dialogs use `showModal`,
Escape, initial focus and focus return; one h1 per page; `aria-current` on nav. Every new
predicate has a covering index; the insight SQL is microseconds per call; `cache()` dedupes
every layout/page pair; no client dependency was added. No error sink exists; stderr logging
carries ids and redacted messages only; the seed script cannot reach a non-local host.

## Totals (after dedupe across reviewers)

| Severity | Found | Fixed this session | Open |
|---|---|---|---|
| CRITICAL | 2 | 2 | 0 |
| HIGH | 11 | 2 (F11) | 9 (#5–#11; #5 and #6 are one migration) |
| MEDIUM | 18 groups | 2 (F11) | 16 (#14–#29) |
| LOW | ~55 | 0 | summarised above |
