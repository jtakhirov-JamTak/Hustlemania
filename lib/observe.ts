/**
 * Operator signal. Every failure on a critical path (auth, a write, a page read) goes
 * through `report`, which writes one line of JSON to stderr — the host's runtime log is
 * the sink until an error tracker exists (docs/DECISIONS.md, audit remediation). When
 * one is added, capture goes behind `shouldCapture` so an outage cannot burn the quota.
 *
 * Never put user content in a report: the row values PostgREST echoes into a message
 * ("Key (user_id, name)=(…)") are redacted, and callers pass ids, never text.
 */

type Ctx = Record<string, string | number | boolean | null | undefined>;

type ErrorLike = { code?: unknown; message?: unknown; name?: unknown; status?: unknown; digest?: unknown };

const MESSAGE_MAX = 200;

/**
 * The longest context value that can be an id or an enum. "Callers pass ids, never
 * text" was a comment; this is the line that enforces it — a journal entry or a lesson
 * passed by mistake is dropped, not logged.
 */
const CTX_VALUE_MAX = 64;

export function redact(message: unknown): string | null {
  if (typeof message !== "string") return null;
  return message
    .replace(/\(([^)]*)\)=\(([^)]*)\)/g, "(…)=(…)")
    .replace(/Failing row contains \([^)]*\)/g, "Failing row contains (…)")
    .slice(0, MESSAGE_MAX);
}

export function safeContext(ctx: Ctx): Ctx {
  return Object.fromEntries(Object.entries(ctx).filter(([, v]) => typeof v !== "string" || v.length <= CTX_VALUE_MAX));
}

/** A structured event for a failure that an operator should be able to find later. */
export function report(kind: string, error: unknown, ctx: Ctx = {}): void {
  const e = (error && typeof error === "object" ? error : { message: String(error) }) as ErrorLike;
  const event = {
    event: kind,
    at: new Date().toISOString(),
    name: typeof e.name === "string" ? e.name : null,
    code: typeof e.code === "string" || typeof e.code === "number" ? String(e.code) : null,
    status: typeof e.status === "number" ? e.status : null,
    digest: typeof e.digest === "string" ? e.digest : null,
    message: redact(e.message),
    ...safeContext(ctx),
  };
  console.error(JSON.stringify(event));
}

const lastCapture = new Map<string, number>();
const CAPTURE_COOLDOWN_MS = 5 * 60_000;

/**
 * True at most once per kind per five minutes. For the error-sink capture that does not
 * exist yet: a fallback hit on every request during an outage must not fire thousands
 * of captures a minute and silence the one alert that would have named the outage.
 */
export function shouldCapture(kind: string, now = Date.now()): boolean {
  const prev = lastCapture.get(kind) ?? 0;
  if (now - prev < CAPTURE_COOLDOWN_MS) return false;
  lastCapture.set(kind, now);
  return true;
}

/**
 * An auth failure that is the service's, not the session's: a network failure or a 5xx
 * from Auth. A signed-out or tampered session is not "unavailable" — it is signed out.
 */
export function isAuthUnavailable(error: unknown): boolean {
  const e = error as ErrorLike | null;
  if (!e) return false;
  if (e.name === "AuthRetryableFetchError") return true;
  return typeof e.status === "number" && e.status >= 500;
}
