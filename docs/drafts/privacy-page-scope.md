# Privacy notice and terms — scope for the next session (2026-09-13)

Written after the full audit (`docs/audits/full-audit-2026-09-13.md` H6, H7, H8, M13,
M14, M15, M30) so the next session's `/interview` starts from facts, not from the
audit's prose. Nothing here is built. Nothing here is approved.

## Why it is the longest-lead item

The notice cannot be written truthfully until five facts are settled, and four of them
are the owner's, not the code's:

| # | Fact to settle | Who | Where it is read |
| --- | --- | --- | --- |
| 1 | Anthropic: is the API account on default retention or zero-data-retention, and is the training opt-out on? | owner, Anthropic console | audit H8 |
| 2 | Resend: log and content retention for sent reminders; the hosted Supabase Auth mailer (SMTP provider) and its retention | owner, Resend + Supabase dashboards | audit M14 |
| 3 | Dictation audio goes to the browser vendor's speech servers (Chrome → Google, Safari → Apple), not "never leaves the device" as DECISIONS F16 says | code fact, corrected in DECISIONS U9 | audit M13 |
| 4 | The deletion path: who deletes (owner, in the dashboard), what cascades (28/28 FKs to `auth.users`, verified on hosted 2026-09-13), what does not (`auth.audit_log_entries`, the owner-held weekly dump files), and how a request is confirmed done | owner + a runbook | audit H7 |
| 5 | Health-area text is plausibly special-category data (Art. 9): a lawful basis or an explicit consent line, and whether export (Art. 15/20) is offered or refused in v1 | owner decision | audit M15 |

## What the notice has to say (inventory from the code)

**Collected.** The email address (`auth.users`, reminder recipient); the vision (a
picture of the year, a goal, its proof, a confidence and reason, an obstacle) tagged
by area, including *health*; impediments, responses and cues with their situations;
sprint outcomes, targets, actuals, mantras, celebrations, usage of funds; daily
intentions, tasks, notes, day observations; sprint reviews and decisions. All text is
the user's own words.

**Sent to processors.** Every "Sort into parts" (and every dictation that stops)
sends the box's verbatim text to `api.anthropic.com` with no user identifier
(`lib/capture.server.ts`); reminders send the email address plus the area name and
day number to Resend (`lib/reminders/transport.ts`); magic links go through the
hosted Auth mailer; the app and its logs run on Vercel; the database on Supabase (the
project's region is in the dashboard). Dictation audio: the browser vendor (fact 3).

**Kept.** Everything, indefinitely, by design: removal is `archived_at`, never a hard
delete (global rule). Backups: the platform's 7-day window plus four weekly dumps held
on the owner's machine (`docs/RUNBOOK_RESTORE.md`). The parser's `parse_log` holds a
kind and a timestamp per sort, pruned after two days; no text.

**Logs.** Structured events carry ids and error codes, never user text
(`lib/observe.ts`, redaction tested); the query string is stripped from error paths
(U9). Vercel's runtime log retention is a dashboard fact (audit blind spot).

**Cookies.** The Supabase session cookie (not `HttpOnly` — the library's default — and
not `Secure`-flagged by the app; HSTS is Vercel's) and the theme cookie. No analytics,
no third-party scripts (the CSP proves no script host is allowed but the app's own).

**Not offered in v1.** Self-service deletion, export, a reminder opt-out (M30). The
notice must say each plainly and give the contact route for a deletion request.

## Proposed shape (for the interview to confirm)

- Two public routes, `/privacy` and `/terms`, server-rendered from Markdown or JSX,
  outside the proxy's protected set (`proxy.ts` `PROTECTED` covers sprints, vision,
  insights only — no change needed, pin it in a test). Linked from the login page's
  footer and the signed-in header's user block; the reminder email's footer names
  `/privacy`.
- Terms for an invite-only beta: who may use it (invited adults), no warranty, no
  fee, acceptable use, the owner may close an account, governing law (owner's call),
  contact.
- A deletion runbook, `docs/RUNBOOK_DSR.md`: identity check by reply from the
  registered address; dashboard delete; the `auth.audit_log_entries` rows; the dump
  files older than the request purged at the next weekly cycle; a dated line in the
  runbook's log. Drilled once on a throwaway account before the notice goes live.
- A DECISIONS record of facts 1–5 with the date each was read, so the notice's claims
  are traceable.

## Acceptance criteria the interview can start from

- `/privacy` and `/terms` answer 200 signed out (deployed spec + local e2e), carry the
  security headers, and are linked from `/login` and the app header (LINK-RESOLVE in
  the e2e: every link resolves).
- The privacy page names Anthropic, Resend, Supabase, Vercel and the browser speech
  vendor as processors, states retention as "kept until you ask", states that health
  goals are the user's own words processed on their instruction (or the consent line
  fact 5 produces), and gives the deletion contact.
- No claim in the page contradicts DECISIONS (a unit test can grep the page source for
  "never leaves the device").
- Evaluator: none (static pages, no data change) unless fact 5 adds a consent capture
  (then a migration on a user-data table → one run).

## Not in scope

Sentry or any new processor; self-service deletion or export (design decisions, bucket
D); the reminder opt-out (M30); cookie consent banners (no analytics, no third-party
cookies — none needed).
