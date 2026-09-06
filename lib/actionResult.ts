import { friendlyError } from "@/lib/errors";
import { report } from "@/lib/observe";

/** What every server action returns: `{}` or `{ error }` plus whatever the action adds. */
export type Result<T = object> = ({ error: string } & Partial<T>) | ({ error?: undefined } & T);

type DbError = { message?: string | null; code?: string | null; details?: string | null; hint?: string | null };

/**
 * The one exit for a failed write: the operator gets a structured event naming the
 * action and the DB code, the user gets the friendly copy. Context holds ids only.
 */
export function failed(action: string, error: DbError, ctx: Record<string, string | number | boolean | null | undefined> = {}): { error: string } {
  report(`action.${action}`, error, ctx);
  return { error: friendlyError(error.message) };
}
