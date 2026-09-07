# SPEC review — 2026-09-07, after the v8 re-baseline, before F6 builds

Two independent passes over `docs/SPEC.md` (F6 in full, F7–F14 stubs and re-scope
notes, §4–§8), `docs/RECONCILIATION-2026-09-06.md`, the v8 README, the Insights/Vision
docx, migrations 0001–0008 and the live local schema: the main session's tie-out and a
`staff-reviewer` agent's adversarial read. Both verdicts: no P0; F6 sound after small
edits; seven cross-feature gaps worth a line each now. Every disposition below was
applied to the SPEC the same day with the user's approval.

## Inside F6 (all fixed in the entry)

| # | Finding | Evidence | Disposition |
|---|---|---|---|
| 1 | `start_sprint` writes the inline proof only when WHEN or THEN is given; an impediment already carrying both, started with only RECOVERED WHEN, would fail with all three visible, and the planned test could not see it. | `0005_targets.sql:256-261` | Guard on any of the three; coalesce per column; the recover-only input is an acceptance test. |
| 2 | "Selection rows show `WHEN {trigger}`" also covered the close dialog, whose rows come from `day_offered_items`, which F6 leaves without the new columns. | `CloseFlow.tsx`, `lib/data.ts:229-248`, `0004:524` | Line scoped to the wizard and Today pickers; the close dialog changes in F7. |
| 3 | `set_highest_impediment` assigns both proof columns whenever either is passed; with a third column a partial call would null an existing recover. | `0008:100-105` | Coalesce semantics pinned with a test. |
| 4 | The broadened rule 22 fired on any UPDATE, so `move_item` / `set_item_scope` on a legacy highest lacking recover would be rejected. | `0004:279-300` | Trigger raises only when a proof column changed and a part is null after. |
| 5 | The redefinition list omitted `cues_before_update` and `library_item_before_insert`, which must trim the new columns. | `0004:53, 304` | Added to the list and the pin test. |
| 6 | The day snapshot had no reader in F6 and F7 rewrites `close_day` (signature change) anyway: two of six redefinitions for nothing. | F7 stub | Snapshot moved to F7. |
| 7 | "A response can prevent the situation" promised something F7's questions cannot record (response asked only when the Highest occurred). | README:101-103, docx | Sentence dropped from F6; F7 decides. |
| 8 | Three-state usage line needed a mechanism; a status-filtered count is not a plain embed. | `lib/data.ts:165-174`, DECISIONS F2 | One RLS-scoped view `library_item_usage`, read in parallel. |
| 9 | Scope-chip semantics were an open F2 backlog item on the page F6 rebuilds. | BACKLOG | Exact scope per chip, as the README draws it. |
| 10 | Column name `trigger` vs the impediment's WHEN. Verified `trigger` works in PL/pgSQL. | — | User chose `cue_when`. |
| 11 | Hosted-project legacy-data risk. | DECISIONS 2026-09-05 | Migrations were never pushed; risk removed, noted. |

## Across features (stub notes and renumbering applied)

| # | Finding | Disposition |
|---|---|---|
| 12 | F10's postmortem renders the four insight cards whose calculations sat in F11, built after it (C6 depends on C5). | Single-sprint calculations move into F10; F11 = Across sprints, Suggested kit, How to read this, sidebar rows. |
| 13 | The focus cue (D11) is written in F7 and read by nothing; the docx gives it two answer scales. | F7 must name its questions and one scale (the per-cue row is the observation; a `sprint_cues.is_focus` flag decides emphasis) and F11 its consumer (FOCUS tag, pinned first); removal rules like the highest's. |
| 14 | F8's stub included the Vision and Insights sidebars, whose data arrives in F9/F10/F11; one screen built twice. | F8 = journal + Sprints sidebar; Vision sidebar to F9, Insights sidebar to F11, two-tap actions to their consumers. "Set up tomorrow" (pure UI) moves from F7 to F8. |
| 15 | The renumbering orphaned F10's inherited work: closure timestamp, streak stops at closure (`sprint_streak_at`), backfill after day 14. | Added to F10's re-scope note; BACKLOG and DECISIONS pointers re-aimed. |
| 16 | "Version" used by F7 and F11, defined nowhere. | Version = the (WHEN, THEN, RECOVERED) text tuple snapshotted on the day row at close; observation rows snapshot item wording only (name, and `cue_when` for cues). No counter. |
| 17 | Vision step 3 (README: WHEN and THEN required) conflicts with F6's rule 22 when the obstacle is an active sprint's highest. | F9 requires all three; vision edits reach sprints by reference exactly as library edits do; obstacle link guarded against archived or area-scoped impediments; `visions` INSERT grant revoked once the atomic function exists. |
| 18 | Postmortem proof text read live would be blank after a post-sprint clear (rule 22 no longer protects a non-active sprint). | F10 reads the proof from the sprint's last day snapshot. |
| 19 | README's Response-recovery card asks only the "with" side; D3b/C5 compare with vs without; card strings are for on-target rate, D4 chose median attainment. | F11 rewrites card copy. |
| 20 | Pill semantics for "unanswered" in a multi-pick group undefined. | F7: any pick in a group answers the whole group. |
| 21 | F7's destructive drop should be guarded; backfill snapshots are as-of-close, not as-of-date. | F7: raise if either table holds rows; say the as-of-close rule and let F11's "logged before this question existed" cover it. |
| 22 | Kit pre-fill vs rule 24: a kit item archived between review and next sprint. | F10 filters archived items from the pre-fill. |
| 23 | Stale feature numbers after renumbering (F1, F5, §6, §7, §8); §6 still lists Tailwind and the two tables F7 drops. | Fixed. |
| 24 | Part 1's measurement lists completion type (normal / early / ended early); the sidebar rows carry only Met / Under. | F11 sidebar sub-line carries the completion type. |

## Not verified

The hosted Supabase project was not read; DECISIONS 2026-09-05 records that no
migration has been pushed there, and the review rests on that record and the local
stack (0 sprints). F12–F14 were checked for renumbering drift only.
