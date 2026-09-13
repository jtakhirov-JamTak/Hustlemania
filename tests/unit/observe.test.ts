import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestError } from "@/instrumentation";
import { redact, report, safeContext } from "@/lib/observe";

/**
 * The operator log must never carry user text. These pin the two enforcement points:
 * the message redaction and the context filter (full review 2026-09-09, #29).
 */
describe("observe: what reaches the log", () => {
  afterEach(() => vi.restoreAllMocks());

  it("a render error on the login round-trip logs the path without its query string (audit 2026-09-13 M16)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await onRequestError(new Error("boom"), { path: "/login?sent=1&email=jane@example.com", method: "GET", headers: {} }, { routerKind: "App Router", routePath: "/login", routeType: "render", revalidateReason: undefined });
    const line = String(spy.mock.calls[0]?.[0]);
    expect(line).toContain('"path":"/login"');
    expect(line).not.toContain("email=");
    expect(line).not.toContain("jane@example.com");
  });

  it("redacts PostgREST's echoed row values and a Postgres failing-row detail", () => {
    expect(redact('duplicate key value violates unique constraint "x" Key (user_id, name)=(abc, My secret plan) already exists')).toBe(
      'duplicate key value violates unique constraint "x" Key (…)=(…) already exists',
    );
    expect(redact("new row violates check constraint. Failing row contains (1, abc, I felt awful today).")).toBe(
      "new row violates check constraint. Failing row contains (…).",
    );
  });

  it("drops a context value long enough to be text, keeps ids and enums", () => {
    const uuid = "e351f701-45ae-41a4-a4b2-dc1dfe4f7e86";
    const text = "Today I skipped the outreach block because a client call ran over and I felt flat.";
    expect(safeContext({ sprintId: uuid, kind: "cue", n: 3, text })).toEqual({ sprintId: uuid, kind: "cue", n: 3 });
  });

  it("the emitted line carries neither the text nor the row values", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    report("action.test", { message: "Key (a)=(secret) exists" }, { dayId: "d1", notes: "x".repeat(80) });
    const line = String(spy.mock.calls[0]?.[0]);
    expect(line).not.toContain("secret");
    expect(line).not.toContain("xxxxxxxx");
    expect(line).toContain('"dayId":"d1"');
  });
});
