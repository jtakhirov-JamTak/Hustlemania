/**
 * Clock skew between Supabase Auth and the data API: a session minted at second T can
 * be refused by PostgREST for the next request with `401 JWT issued at future` when
 * its clock is a beat behind — seen on the first `/sprints` render after the owner's
 * first production sign-in (FIX_LOG 2026-09-10). The token is valid; the world just has
 * to catch up. So: one retry, after one second, for exactly that answer. Everything
 * else passes through untouched, including a second skew answer.
 */
export const SKEW_MESSAGE = "JWT issued at future";
export const SKEW_RETRY_MS = 1000;
export const SKEW_RETRY_HEADER = "x-skew-retry";

type Fetch = typeof fetch;

export function withSkewRetry(fetchImpl: Fetch = fetch, wait: (ms: number) => Promise<void> = sleep): Fetch {
  return async function skewRetryingFetch(input, init) {
    const first = await fetchImpl(input, init);
    if (!(await isSkewRefusal(first))) return first;
    await wait(SKEW_RETRY_MS);
    return fetchImpl(input, { ...init, headers: retryHeaders(input, init) });
  };
}

/**
 * The retry is not the same request. Inside a server render Next.js dedupes identical
 * GETs (method + headers + URL, `next/dist/server/lib/dedupe-fetch.js`) and hands the
 * second caller a clone of the first response, so an unmarked retry got the same 401
 * back without touching the network (FIX_LOG 2026-09-11). The marker header changes the
 * key; nothing downstream reads it.
 */
function retryHeaders(input: RequestInfo | URL, init?: RequestInit): Headers {
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  headers.set(SKEW_RETRY_HEADER, "1");
  return headers;
}

async function isSkewRefusal(res: Response): Promise<boolean> {
  if (res.status !== 401) return false;
  try {
    return (await res.clone().text()).includes(SKEW_MESSAGE);
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
