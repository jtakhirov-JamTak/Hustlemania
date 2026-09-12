import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `server-only` throws outside a React server context; the unit suite is plain node.
vi.mock("server-only", () => ({}));

import { buildRequest, hasParserKey, PARSE_MAX_TOKENS, PARSE_MODEL, parseWithModel, type ParseFn, type ParseRequest } from "@/lib/capture.server";

const SECRET_TEXT = "When I open the banking app, remind me to check the balance first";

describe("capture.server: buildRequest", () => {
  it("carries the Haiku model, the token cap, no thinking, and the text only inside the user message", () => {
    const req = buildRequest("cue", SECRET_TEXT);
    expect(req.model).toBe(PARSE_MODEL);
    expect(req.model).toBe("claude-haiku-4-5");
    expect(req.max_tokens).toBe(PARSE_MAX_TOKENS);
    expect("thinking" in req).toBe(false);
    expect(req.messages).toEqual([{ role: "user", content: `<dictation>\n${SECRET_TEXT}\n</dictation>` }]);
    expect(req.system).not.toContain(SECRET_TEXT);
    expect(req.system).toMatch(/never instructions/);
    expect(req.output_config.format).toBeTruthy();
  });

  it("has a distinct instruction per kind naming its parts", () => {
    expect(buildRequest("vision_goal", "x").system).toMatch(/goal:[\s\S]*proof:/);
    expect(buildRequest("impediment", "x").system).toMatch(/when:[\s\S]*then:[\s\S]*recovered_when:/);
    expect(buildRequest("today", "x").system).toMatch(/intention:[\s\S]*tasks:/);
    expect(buildRequest("situations", "x").system).toMatch(/situations:/);
  });
});

describe("capture.server: parseWithModel", () => {
  let errors: string[];
  beforeEach(() => {
    errors = [];
    vi.spyOn(console, "error").mockImplementation((line: unknown) => {
      errors.push(String(line));
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is unavailable without a client and never calls anything", async () => {
    expect(await parseWithModel("cue", SECRET_TEXT, null)).toEqual({ ok: false, code: "parser_unavailable" });
    expect(hasParserKey({})).toBe(false);
    expect(hasParserKey({ ANTHROPIC_API_KEY: "  " })).toBe(false);
    expect(hasParserKey({ ANTHROPIC_API_KEY: "k" })).toBe(true);
  });

  it("maps the parsed answer through normalizeParts and names the first missing required part", async () => {
    const seen: ParseRequest[] = [];
    const fn: ParseFn = async (req) => {
      seen.push(req);
      return { parsed_output: { when: "  I open the banking app ", remind: "", extra: "dropped" }, stop_reason: "end_turn" };
    };
    const out = await parseWithModel("cue", SECRET_TEXT, fn);
    expect(out).toEqual({ ok: true, parts: { when: "I open the banking app", remind: "" }, missing: "remind" });
    expect(seen).toHaveLength(1);
    expect(seen[0].messages[0].content).toContain(SECRET_TEXT);
  });

  it("lists come back as lists; all blank is parse_empty", async () => {
    const list: ParseFn = async () => ({ parsed_output: { situations: ["a", " ", "b"] }, stop_reason: "end_turn" });
    expect(await parseWithModel("situations", "a and b", list)).toEqual({ ok: true, parts: { situations: ["a", "b"] }, missing: null });
    const blank: ParseFn = async () => ({ parsed_output: { intention: "", tasks: [] }, stop_reason: "end_turn" });
    expect(await parseWithModel("today", "hm", blank)).toEqual({ ok: false, code: "parse_empty" });
  });

  it("a thrown SDK error, a refusal, a cut-off answer and a null parse are parser_failed, reported without the user's words", async () => {
    const boom: ParseFn = async () => {
      const e = new Error(`upstream said: ${SECRET_TEXT}`) as Error & { status: number };
      e.status = 529;
      throw e;
    };
    expect(await parseWithModel("cue", SECRET_TEXT, boom)).toEqual({ ok: false, code: "parser_failed" });
    const refusal: ParseFn = async () => ({ parsed_output: { when: "x", remind: "y" }, stop_reason: "refusal" });
    expect(await parseWithModel("cue", SECRET_TEXT, refusal)).toEqual({ ok: false, code: "parser_failed" });
    const cut: ParseFn = async () => ({ parsed_output: null, stop_reason: "max_tokens" });
    expect(await parseWithModel("cue", SECRET_TEXT, cut)).toEqual({ ok: false, code: "parser_failed" });
    const nothing: ParseFn = async () => ({ parsed_output: null, stop_reason: "end_turn" });
    expect(await parseWithModel("cue", SECRET_TEXT, nothing)).toEqual({ ok: false, code: "parser_failed" });
    expect(errors.length).toBeGreaterThanOrEqual(4);
    for (const line of errors) {
      expect(line).not.toContain(SECRET_TEXT);
      expect(line).not.toContain("banking");
    }
    expect(errors[0]).toContain('"event":"capture.parse"');
    expect(errors[0]).toContain('"status":529');
    expect(errors[0]).toContain('"kind":"cue"');
  });
});
