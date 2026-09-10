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

type Fetch = typeof fetch;

export function withSkewRetry(fetchImpl: Fetch = fetch, wait: (ms: number) => Promise<void> = sleep): Fetch {
  return async function skewRetryingFetch(input, init) {
    const first = await fetchImpl(input, init);
    if (!(await isSkewRefusal(first))) return first;
    await wait(SKEW_RETRY_MS);
    return fetchImpl(input, init);
  };
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
