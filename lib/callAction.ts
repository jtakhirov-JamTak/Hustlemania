import { unstable_rethrow } from "next/navigation";
import { GENERIC_SAVE_ERROR } from "@/lib/errors";

/**
 * Calls a server action from a client component. A server action can *throw* rather
 * than return `{ error }` — a deploy between page load and submit ("Failed to find
 * Server Action"), a network failure, a crash before the handler's own try — and inside
 * a transition that throw reaches the nearest error boundary, which replaces the form
 * and discards what the user typed. Here it becomes an ordinary `{ error }` so the form
 * stays mounted with its input. Next's own control-flow throws (redirect) pass through.
 */
export async function callAction<T extends { error?: string }>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    unstable_rethrow(error);
    const e = error as { name?: string; message?: string } | null;
    console.error(JSON.stringify({ event: "action.threw", name: e?.name ?? null, message: String(e?.message ?? "").slice(0, 200) }));
    return { error: GENERIC_SAVE_ERROR } as T;
  }
}
