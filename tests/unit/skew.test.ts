import { describe, expect, it, vi } from "vitest";
import { SKEW_MESSAGE, SKEW_RETRY_HEADER, SKEW_RETRY_MS, withSkewRetry } from "@/lib/supabase/skew";

const skew = () => new Response(JSON.stringify({ code: "PGRST301", message: SKEW_MESSAGE }), { status: 401 });
const ok = () => new Response("[]", { status: 200 });

function harness(responses: Response[]) {
  const fetchImpl = vi.fn(async () => responses.shift()!);
  const wait = vi.fn(async () => {});
  return { fetchImpl, wait, fetch: withSkewRetry(fetchImpl as unknown as typeof fetch, wait) };
}

describe("withSkewRetry", () => {
  it("retries once, after the skew delay, when the data API refuses a token as issued in the future", async () => {
    const h = harness([skew(), ok()]);
    const res = await h.fetch("https://x.supabase.co/rest/v1/sprint_totals", { method: "GET", headers: { apikey: "k" } });
    expect(res.status).toBe(200);
    expect(h.fetchImpl).toHaveBeenCalledTimes(2);
    expect(h.wait).toHaveBeenCalledTimes(1);
    expect(h.wait).toHaveBeenCalledWith(SKEW_RETRY_MS);
    // The retry is the same request, not a rewritten one.
    const [first, retry] = h.fetchImpl.mock.calls as unknown as [string, RequestInit][];
    expect(retry[0]).toBe(first[0]);
    const init = retry[1];
    expect(new Headers(init.headers).get(SKEW_RETRY_HEADER)).toBe("1");
  });

  it("returns a second skew refusal as-is: one retry, never a loop", async () => {
    const h = harness([skew(), skew(), ok()]);
    const res = await h.fetch("https://x.supabase.co/rest/v1/visions");
    expect(res.status).toBe(401);
    expect(h.fetchImpl).toHaveBeenCalledTimes(2);
    expect(h.wait).toHaveBeenCalledTimes(1);
  });

  it("does not retry any other 401", async () => {
    const h = harness([new Response(JSON.stringify({ message: "JWT expired" }), { status: 401 }), ok()]);
    const res = await h.fetch("https://x.supabase.co/rest/v1/visions");
    expect(res.status).toBe(401);
    expect(h.fetchImpl).toHaveBeenCalledTimes(1);
    expect(h.wait).not.toHaveBeenCalled();
  });

  it("passes a success straight through with its body intact", async () => {
    const h = harness([new Response('[{"id":1}]', { status: 200 }), skew()]);
    const res = await h.fetch("https://x.supabase.co/rest/v1/visions");
    expect(await res.json()).toEqual([{ id: 1 }]);
    expect(h.fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("leaves the refused response readable when it is returned", async () => {
    const h = harness([skew(), skew()]);
    const res = await h.fetch("https://x.supabase.co/rest/v1/visions");
    expect((await res.json()).message).toBe(SKEW_MESSAGE);
  });
});

describe("withSkewRetry under a deduping fetch", () => {
  /**
   * Next.js dedupes identical GETs within one server render: same method, headers and
   * URL → the first response's clone, no network. This fake keys the same way, so a retry
   * that is byte-for-byte the first request gets the memoised 401 back (FIX_LOG 2026-09-11).
   */
  const dedupingFetch = (responses: Response[]) => {
    const seen = new Map<string, Response>();
    const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const key = JSON.stringify([String(input), init?.method ?? "GET", [...new Headers(init?.headers).entries()]]);
      const hit = seen.get(key);
      if (hit) return hit.clone();
      const res = responses.shift()!;
      seen.set(key, res);
      return res.clone();
    });
    return { impl, fetch: withSkewRetry(impl as unknown as typeof fetch, async () => {}) };
  };

  it("reaches the network on the retry instead of the memoised refusal", async () => {
    const d = dedupingFetch([skew(), ok()]);
    const res = await d.fetch("https://db/rest/v1/sprints", { method: "GET", headers: { apikey: "k" } });
    expect(res.status).toBe(200);
    expect(d.impl).toHaveBeenCalledTimes(2);
  });

  it("keeps the original headers on the retry", async () => {
    const d = dedupingFetch([skew(), ok()]);
    await d.fetch("https://db/rest/v1/sprints", { method: "GET", headers: { apikey: "k", authorization: "Bearer t" } });
    const retryInit = d.impl.mock.calls[1][1] as RequestInit;
    const h = new Headers(retryInit.headers);
    expect([h.get("apikey"), h.get("authorization"), h.get(SKEW_RETRY_HEADER)]).toEqual(["k", "Bearer t", "1"]);
  });
});
