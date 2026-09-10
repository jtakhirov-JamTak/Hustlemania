import { describe, expect, it, vi } from "vitest";
import { SKEW_MESSAGE, SKEW_RETRY_MS, withSkewRetry } from "@/lib/supabase/skew";

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
    expect(h.fetchImpl.mock.calls[1]).toEqual(h.fetchImpl.mock.calls[0]);
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
