"use server";

import { CAPTURE_TEXT_MAX, isCaptureKind, type Parts, stubParse } from "@/lib/capture";
import { hasParserKey, parseWithModel, realParseFn } from "@/lib/capture.server";
import { friendlyError } from "@/lib/errors";
import { report } from "@/lib/observe";
import { requireUser } from "@/lib/supabase/server";

/**
 * F17: sorts one box of words into a kind's parts. Order (engineering conventions,
 * handler order): the session · the per-user cap (`parse_permit`: 10 a minute, 200 a
 * day) · the input's shape · then the stub, the missing-key answer, or the model. The
 * parts come back for correction; nothing is written here.
 *
 * `PARSE_STUB=1` (local and Playwright only; a hosted build refuses it) answers with the
 * deterministic keyword splitter; `fail` and `slow` exercise the two waiting states.
 */
export type ParseErrorCode = "not_authenticated" | "invalid_input" | "parse_empty" | "rate_limited" | "parser_unavailable" | "parser_failed";

export type ParseCaptureResult = { parts: Parts; error?: undefined; code?: undefined } | { error: string; code: ParseErrorCode; parts?: undefined };

// A "use server" module may export only async functions (and types): a constant here
// is a build error that takes every page down (FIX_LOG 2026-09-12). CAPTURE_TEXT_MAX
// lives in lib/capture.ts for that reason; tests/unit/serverActions.test.ts guards it.

const fail = (code: ParseErrorCode): ParseCaptureResult => ({ error: friendlyError(code), code });

export async function parseCapture(kind: unknown, text: unknown): Promise<ParseCaptureResult> {
  const { supabase, user } = await requireUser();
  if (!user) return fail("not_authenticated");
  if (!isCaptureKind(kind)) return fail("invalid_input");

  const permit = await supabase.rpc("parse_permit", { p_kind: kind });
  if (permit.error) {
    report("action.parseCapture.permit", permit.error, { kind });
    return fail("parser_failed");
  }
  if (permit.data === "rate_limited") return fail("rate_limited");

  if (typeof text !== "string" || !text.trim()) return fail("parse_empty");
  if (text.length > CAPTURE_TEXT_MAX) return fail("invalid_input");

  const stub = process.env.PARSE_STUB;
  if (stub) {
    if (stub === "fail") return fail("parser_failed");
    if (stub === "slow") await new Promise((r) => setTimeout(r, 2500));
    return { parts: stubParse(kind, text) };
  }

  const out = await parseWithModel(kind, text, hasParserKey() ? realParseFn : null);
  return out.ok ? { parts: out.parts } : fail(out.code);
}
