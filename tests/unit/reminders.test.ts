import { afterEach, describe, expect, it, vi } from "vitest";
import { authorizeCron } from "@/lib/reminders/authorize";
import { buildReminder } from "@/lib/reminders/message";
import { runReminders, type DueRow, type ReminderDb } from "@/lib/reminders/run";
import { logTransport, resendTransport, selectTransport, type Email, type Transport } from "@/lib/reminders/transport";

/**
 * F13 — the evening reminder's TypeScript side. The SQL side (who is due, claim,
 * mark, the cron job) is tests/db/reminders.test.ts; the HTTP side is
 * e2e/reminders.spec.ts.
 */

describe("authorizeCron: the bearer is the whole gate", () => {
  const SECRET = "a-long-random-cron-secret-value";

  it("an unset secret is unconfigured, even with a plausible header", () => {
    expect(authorizeCron(`Bearer ${SECRET}`, undefined)).toBe("unconfigured");
    expect(authorizeCron(`Bearer ${SECRET}`, "")).toBe("unconfigured");
  });

  it("no header, a non-bearer scheme, or the wrong value is unauthorized", () => {
    expect(authorizeCron(null, SECRET)).toBe("unauthorized");
    expect(authorizeCron("", SECRET)).toBe("unauthorized");
    expect(authorizeCron(`Basic ${SECRET}`, SECRET)).toBe("unauthorized");
    expect(authorizeCron("Bearer nope", SECRET)).toBe("unauthorized");
    expect(authorizeCron(`Bearer ${SECRET}x`, SECRET)).toBe("unauthorized");
    expect(authorizeCron(`Bearer ${SECRET.slice(0, -1)}`, SECRET)).toBe("unauthorized");
  });

  it("the right value is ok, whatever the case of the scheme", () => {
    expect(authorizeCron(`Bearer ${SECRET}`, SECRET)).toBe("ok");
    expect(authorizeCron(`bearer ${SECRET}`, SECRET)).toBe("ok");
  });
});

describe("buildReminder: Area and day number only", () => {
  // A row shaped like a whole sprint: everything private is present so the assertion
  // that none of it reaches the email can fail.
  const sprint = {
    area: "health",
    day_index: 6,
    outcome: "Run every morning for the marathon",
    mantra: "Boring consistency is the whole trick.",
    amount: 800_000,
    target: 57_143,
    actual: 12_000,
    intention: "Long run before breakfast",
    notes: "Felt flat after the client call.",
  };
  const PRIVATE = [sprint.outcome, sprint.mantra, "800000", "800,000", "57143", "12000", sprint.intention, sprint.notes, "8,000"];

  it("one open day: the subject names it and the body has the link and nothing private", () => {
    const m = buildReminder([sprint], "https://sprint.example.com/");
    expect(m.subject).toBe("Health · Day 6 is still open");
    expect(m.text).toContain("Health · Day 6 is still open.");
    expect(m.text).toContain("https://sprint.example.com/sprints");
    expect(m.html).toContain('href="https://sprint.example.com/sprints"');
    for (const s of PRIVATE) {
      expect(m.subject).not.toContain(s);
      expect(m.text).not.toContain(s);
      expect(m.html).not.toContain(s);
    }
  });

  it("two open days: one subject, both lines, sorted by label", () => {
    const m = buildReminder([{ ...sprint, area: "wealth", day_index: 3 }, sprint], "http://localhost:3000");
    expect(m.subject).toBe("2 sprint days are still open");
    expect(m.text.indexOf("Health · Day 6")).toBeLessThan(m.text.indexOf("Wealth · Day 3"));
    expect(m.text).toContain("Wealth · Day 3 is still open.");
    expect(m.html).toContain("<strong>Wealth · Day 3</strong>");
  });

  it("an unknown area key is shown as-is, never crashes the run", () => {
    expect(buildReminder([{ area: "garden", day_index: 1 }], "http://x").subject).toBe("garden · Day 1 is still open");
  });
});

describe("transports", () => {
  afterEach(() => vi.restoreAllMocks());

  const email: Email = { to: "someone@example.com", subject: "Health · Day 6 is still open", text: "t", html: "<p>h</p>" };

  it("resend: posts the message with the bearer and reports 2xx as sent", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ id: "x" }), { status: 200 });
    }) as typeof fetch;
    const t = resendTransport("re_key", "Sprint <sprint@example.com>", fetchImpl);
    expect(t.name).toBe("resend");
    expect(await t.send(email)).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.resend.com/emails");
    expect(calls[0].init.method).toBe("POST");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer re_key");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      from: "Sprint <sprint@example.com>",
      to: ["someone@example.com"],
      subject: email.subject,
      text: "t",
      html: "<p>h</p>",
    });
  });

  it("resend: a non-2xx is a failure carrying the status and the provider's message", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ message: "Invalid `from` field" }), { status: 422 })) as typeof fetch;
    const r = await resendTransport("k", "f", fetchImpl).send(email);
    expect(r).toEqual({ ok: false, error: "resend 422: Invalid `from` field" });
  });

  it("resend: a thrown fetch is a failure, not a crash", async () => {
    const fetchImpl = (async () => {
      throw new Error("getaddrinfo ENOTFOUND api.resend.com");
    }) as typeof fetch;
    const r = await resendTransport("k", "f", fetchImpl).send(email);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("ENOTFOUND");
  });

  it("log: succeeds and logs the subject but never the recipient", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await logTransport().send(email)).toEqual({ ok: true });
    const line = String(spy.mock.calls[0]?.[0]);
    expect(line).toContain('"event":"reminder.logged"');
    expect(line).toContain(email.subject);
    expect(line).not.toContain("someone@example.com");
  });

  it("selectTransport: resend when both settings exist; log outside production; null in production", () => {
    expect(selectTransport({ RESEND_API_KEY: "k", REMINDER_FROM: "f", NODE_ENV: "production" })?.name).toBe("resend");
    expect(selectTransport({ NODE_ENV: "development" })?.name).toBe("log");
    expect(selectTransport({ NODE_ENV: "test" })?.name).toBe("log");
    expect(selectTransport({ NODE_ENV: "production" })).toBeNull();
    expect(selectTransport({ RESEND_API_KEY: "k", NODE_ENV: "production" })).toBeNull();
    expect(selectTransport({ RESEND_API_KEY: " ", REMINDER_FROM: "f", NODE_ENV: "development" })?.name).toBe("log");
  });
});

describe("runReminders: one email per user, claim before send, outcome recorded", () => {
  afterEach(() => vi.restoreAllMocks());

  const row = (user: string, area: string, day: number, id: string): DueRow => ({
    user_id: user,
    email: `${user}@example.com`,
    sprint_id: `s-${user}-${area}`,
    sprint_day_id: id,
    area,
    day_index: day,
    tz: "UTC",
  });
  const DUE = [row("a", "health", 6, "d1"), row("a", "wealth", 3, "d2"), row("b", "health", 2, "d3")];

  function fakeDb(claim: (ids: string[]) => string[] = (ids) => ids) {
    const marks: [string[], string | null][] = [];
    const claims: string[][] = [];
    const db: ReminderDb = {
      async due() {
        return DUE;
      },
      async claim(ids) {
        claims.push(ids);
        return claim(ids);
      },
      async mark(ids, error) {
        marks.push([ids, error]);
      },
    };
    return { db, marks, claims };
  }

  function recorder(fail: (email: Email) => string | null = () => null) {
    const sent: Email[] = [];
    const transport: Transport = {
      name: "log",
      async send(email) {
        sent.push(email);
        const error = fail(email);
        return error ? { ok: false, error } : { ok: true };
      },
    };
    return { transport, sent };
  }

  it("groups a user's days into one email and marks them sent", async () => {
    const { db, marks, claims } = fakeDb();
    const { transport, sent } = recorder();
    const summary = await runReminders(db, transport, "http://localhost:3000");
    expect(summary).toEqual({ due: 3, users: 2, sent: 2, failed: 0 });
    expect(claims).toEqual([["d1", "d2"], ["d3"]]);
    expect(sent.map((e) => e.to)).toEqual(["a@example.com", "b@example.com"]);
    expect(sent[0].subject).toBe("2 sprint days are still open");
    expect(sent[1].subject).toBe("Health · Day 2 is still open");
    expect(marks).toEqual([
      [["d1", "d2"], null],
      [["d3"], null],
    ]);
  });

  it("a user whose claim comes back empty is skipped: no email, no mark, not a failure", async () => {
    const { db, marks } = fakeDb((ids) => ids.filter((id) => id !== "d3"));
    const { transport, sent } = recorder();
    const summary = await runReminders(db, transport, "http://localhost:3000");
    expect(summary).toEqual({ due: 3, users: 2, sent: 1, failed: 0 });
    expect(sent.map((e) => e.to)).toEqual(["a@example.com"]);
    expect(marks).toEqual([[["d1", "d2"], null]]);
  });

  it("a partial claim mails only the claimed days", async () => {
    const { db, marks } = fakeDb((ids) => ids.filter((id) => id !== "d1"));
    const { transport, sent } = recorder();
    await runReminders(db, transport, "http://localhost:3000");
    expect(sent[0].subject).toBe("Wealth · Day 3 is still open");
    expect(marks[0]).toEqual([["d2"], null]);
  });

  it("a failed send stores the error on those days, reports it with ids only, and counts as failed", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { db, marks } = fakeDb();
    const { transport } = recorder((e) => (e.to === "a@example.com" ? "resend 422: Invalid `from` field" : null));
    const summary = await runReminders(db, transport, "http://localhost:3000");
    expect(summary).toEqual({ due: 3, users: 2, sent: 1, failed: 1 });
    expect(marks).toEqual([
      [["d1", "d2"], "resend 422: Invalid `from` field"],
      [["d3"], null],
    ]);
    const line = String(spy.mock.calls.find((c) => String(c[0]).includes("reminder.send_failed"))?.[0]);
    expect(line).toContain('"userId":"a"');
    expect(line).not.toContain("a@example.com");
  });

  it("nothing due: no claims, no sends, zero counts", async () => {
    const db: ReminderDb = {
      async due() {
        return [];
      },
      async claim() {
        throw new Error("must not claim");
      },
      async mark() {
        throw new Error("must not mark");
      },
    };
    const { transport, sent } = recorder();
    expect(await runReminders(db, transport, "http://x")).toEqual({ due: 0, users: 0, sent: 0, failed: 0 });
    expect(sent).toEqual([]);
  });
});
