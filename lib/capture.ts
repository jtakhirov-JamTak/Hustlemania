/**
 * F17: one-box capture. Every structured entry (the goal and its proof, an impediment's
 * WHEN / THEN / RECOVERED WHEN, a cue's WHEN / REMIND, a list of situations, today's
 * intention and tasks) is spoken or typed into one box and sorted into the fields the
 * database already has. The pure parts live here — the part specs, the required-part
 * check, the single funnel every parse passes through (`normalizeParts`), the re-record
 * prefill, and the deterministic keyword splitter the e2e suite runs against
 * (`PARSE_STUB=1`). The model call is in `lib/capture.server.ts`.
 */

export type CaptureKind = "vision_goal" | "impediment" | "response" | "cue" | "situations" | "today";

export const CAPTURE_KINDS: CaptureKind[] = ["vision_goal", "impediment", "response", "cue", "situations", "today"];

export function isCaptureKind(value: unknown): value is CaptureKind {
  return typeof value === "string" && (CAPTURE_KINDS as string[]).includes(value);
}

/** A text part or a list part, keyed by `PartSpec.key`. */
export type Parts = Record<string, string | string[]>;

export type PartSpec = {
  key: string;
  /** The visible label, which is also the input's accessible name. */
  label: string;
  required: boolean;
  list?: boolean;
  placeholder: string;
  /** The hint shown, and the reason Save is refused, while this part is blank. */
  hint: string;
};

/** The parts of each kind, in the order they are shown. */
export const PARTS: Record<CaptureKind, PartSpec[]> = {
  vision_goal: [
    { key: "goal", label: "Goal", required: true, placeholder: "In 12 months, I …", hint: "Say the goal." },
    { key: "proof", label: "Proof", required: true, placeholder: "Something you could point to", hint: "Say what the observable proof will be." },
  ],
  impediment: [
    { key: "when", label: "WHEN", required: true, placeholder: "I notice myself delaying my first work block", hint: "Say the moment you will recognise (WHEN)." },
    { key: "then", label: "THEN", required: false, placeholder: "I start a 10-minute timer on the smallest executable task", hint: "Say what you will do right there (THEN)." },
    { key: "recovered_when", label: "RECOVERED WHEN", required: false, placeholder: "The timer is running within 10 minutes", hint: "Say what you would observe to know you are back on track (RECOVERED WHEN)." },
  ],
  response: [
    { key: "then", label: "THEN", required: true, placeholder: "I start a 10-minute timer on the smallest executable task", hint: "Say what you will do right there (THEN)." },
    { key: "recovered_when", label: "RECOVERED WHEN", required: true, placeholder: "The timer is running within 10 minutes", hint: "Say what you would observe to know you are back on track (RECOVERED WHEN)." },
  ],
  cue: [
    { key: "when", label: "WHEN", required: true, placeholder: "I schedule anything", hint: "Say the moment you will recognise (WHEN)." },
    { key: "remind", label: "REMIND", required: true, placeholder: 'ask "How much does this pay?"', hint: "Say what to remind yourself (REMIND)." },
  ],
  situations: [{ key: "situations", label: "Situation", required: true, list: true, placeholder: "Starting late", hint: "Name at least one situation." }],
  today: [
    { key: "intention", label: "Daily intention", required: true, placeholder: "Today I will…", hint: "Say what you intend to do today." },
    { key: "tasks", label: "Task", required: false, list: true, placeholder: "A task", hint: "" },
  ],
};

/** The one box: its accessible label and placeholder. */
export const CAPTURE_BOX: Record<CaptureKind, { label: string; placeholder: string; dictate: string }> = {
  vision_goal: { label: "Goal and proof", placeholder: "In 12 months, I … The observable proof will be …", dictate: "the goal" },
  impediment: { label: "Impediment", placeholder: "When I … then I … Recovered when …", dictate: "the impediment" },
  response: { label: "Response", placeholder: "Then I … Recovered when …", dictate: "the response" },
  cue: { label: "Execution cue", placeholder: "When I … remind me to …", dictate: "the cue" },
  situations: { label: "Situations", placeholder: "Getting up early, going to bed late, …", dictate: "situations" },
  today: { label: "Today's entry", placeholder: "Today I will … My tasks are …", dictate: "today's entry" },
};

/** The longest box the parser accepts: dictation-sized, a few sentences, never a page. */
export const CAPTURE_TEXT_MAX = 2000;
/** The longest text part kept after a sort. */
export const PART_MAX = 2000;
export const LIST_ITEM_MAX = 500;
export const LIST_MAX = 40;

export function emptyParts(kind: CaptureKind): Parts {
  const out: Parts = {};
  for (const spec of PARTS[kind]) out[spec.key] = spec.list ? [] : "";
  return out;
}

export function partText(parts: Parts, key: string): string {
  const v = parts[key];
  return typeof v === "string" ? v : "";
}

export function partList(parts: Parts, key: string): string[] {
  const v = parts[key];
  return Array.isArray(v) ? v : [];
}

/** The first required part that is blank, with its hint; null when every required part is present. */
export function missingPart(kind: CaptureKind, parts: Parts): { key: string; hint: string } | null {
  for (const spec of PARTS[kind]) {
    if (!spec.required) continue;
    const present = spec.list ? partList(parts, spec.key).some((s) => s.trim()) : Boolean(partText(parts, spec.key).trim());
    if (!present) return { key: spec.key, hint: spec.hint };
  }
  return null;
}

const clean = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "");

/**
 * The single funnel: whatever the model, the stub or a hand edit produced becomes a
 * `Parts` of exactly the kind's keys — unknown keys dropped, strings trimmed and capped,
 * lists coerced (a string becomes a one-item list), blanks removed, at most `LIST_MAX`.
 */
export function normalizeParts(kind: CaptureKind, raw: unknown): Parts {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: Parts = {};
  for (const spec of PARTS[kind]) {
    const v = src[spec.key];
    if (spec.list) {
      const items = Array.isArray(v) ? v : typeof v === "string" && v.trim() ? [v] : [];
      out[spec.key] = items
        .map((x) => clean(x, LIST_ITEM_MAX))
        .filter((x) => x.length > 0)
        .slice(0, LIST_MAX);
    } else {
      out[spec.key] = clean(v, PART_MAX);
    }
  }
  return out;
}

/** The parts read back as one sentence, for the box when the user chooses Re-record. */
export function joinParts(kind: CaptureKind, parts: Parts): string {
  const t = (k: string) => partText(parts, k).trim();
  const list = (k: string) => partList(parts, k).map((s) => s.trim()).filter(Boolean);
  const sentence = (pieces: string[]) => pieces.filter(Boolean).join(" ");
  switch (kind) {
    case "vision_goal":
      return sentence([t("goal") && `In 12 months, I ${dot(t("goal"))}`, t("proof") && `The observable proof will be ${dot(t("proof"))}`]);
    case "impediment":
      return sentence([t("when") && `When ${t("when")},`, t("then") && `then ${dot(t("then"))}`, t("recovered_when") && `Recovered when ${dot(t("recovered_when"))}`]);
    case "response":
      return sentence([t("then") && `Then ${dot(t("then"))}`, t("recovered_when") && `Recovered when ${dot(t("recovered_when"))}`]);
    case "cue":
      return sentence([t("when") && `When ${t("when")},`, t("remind") && `remind me to ${dot(t("remind"))}`]);
    case "situations":
      return list("situations").join(", ");
    case "today":
      return sentence([t("intention") && `Today I will ${dot(t("intention"))}`, list("tasks").length ? `My tasks are ${dot(list("tasks").join(", "))}` : ""]);
  }
}

function dot(s: string): string {
  return /[.!?]$/.test(s) ? s : `${s}.`;
}

// ---------------------------------------------------------------------------
// The stub: a keyword splitter. It is what the e2e suite exercises (the model is not
// called under PARSE_STUB=1), so it must sort the golden-path sentences the way the
// model would, and leave a part empty when its keyword is absent.
// ---------------------------------------------------------------------------

const strip = (s: string) =>
  s
    .replace(/^[\s,.;:—-]+/, "")
    .replace(/[\s,.;:—-]+$/, "")
    .replace(/^(?:and|then)\s+/i, "")
    .trim();

/** Splits `text` at the LAST match of `re`; null when it does not match. */
function splitLast(text: string, re: RegExp): [string, string] | null {
  const global = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  let last: RegExpExecArray | null = null;
  for (let m = global.exec(text); m; m = global.exec(text)) last = m;
  if (!last) return null;
  return [text.slice(0, last.index), text.slice(last.index + last[0].length)];
}

/** Splits `text` at the FIRST match of `re`; null when it does not match. */
function splitFirst(text: string, re: RegExp): [string, string] | null {
  const m = re.exec(text);
  if (!m || m.index === undefined) return null;
  return [text.slice(0, m.index), text.slice(m.index + m[0].length)];
}

// Commas, semicolons, new lines, "and", "then" and a spoken "number one / number two"
// separate items. Bare ordinals ("first", "next") do not: "first paragraph" is a task.
const LIST_SEP = /\s*(?:,|;|\n|\band\b|\bthen\b|\bnumber\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b)\s*/i;

function splitList(text: string): string[] {
  return text
    .split(LIST_SEP)
    .map(strip)
    .filter((s) => s.length > 0);
}

export function stubParse(kind: CaptureKind, text: string): Parts {
  const src = text.replace(/\s+/g, " ").trim();
  switch (kind) {
    case "vision_goal": {
      const cut = splitLast(src, /\b(?:the\s+)?(?:observable\s+)?proof\s+(?:will\s+be|is|would\s+be)\b/i);
      // The label's own lead-in ("In 12 months, I …", also what Re-record prefills) is not part of the goal.
      const goal = strip((cut ? cut[0] : src).replace(/^\s*in\s+(?:12|twelve)\s+months,?\s+i\s+/i, ""));
      return normalizeParts(kind, { goal, proof: cut ? strip(cut[1]) : "" });
    }
    case "impediment": {
      const rec = splitLast(src, /\brecovered\s+when\b/i);
      const head = rec ? rec[0] : src;
      const then = splitFirst(head, /\bthen\b/i);
      const when = strip((then ? then[0] : head).replace(/^\s*when\s+/i, ""));
      return normalizeParts(kind, { when, then: then ? strip(then[1]) : "", recovered_when: rec ? strip(rec[1]) : "" });
    }
    case "response": {
      const rec = splitLast(src, /\brecovered\s+when\b/i);
      const head = rec ? rec[0] : src;
      return normalizeParts(kind, { then: strip(head.replace(/^\s*then\s+/i, "")), recovered_when: rec ? strip(rec[1]) : "" });
    }
    case "cue": {
      const cut = splitFirst(src, /\b(?:remind(?:\s+me)?(?:\s+to)?|ask\s+myself)\b/i);
      const when = strip((cut ? cut[0] : src).replace(/^\s*when\s+/i, ""));
      return normalizeParts(kind, { when, remind: cut ? strip(cut[1]) : "" });
    }
    case "situations":
      return normalizeParts(kind, { situations: splitList(src.replace(/^\s*(?:the\s+)?situations?\s*(?:are|is|:)?\s*/i, "")) });
    case "today": {
      const cut = splitLast(src, /\b(?:my\s+)?tasks?\s*(?:are|is|:)\s*/i);
      const intention = strip((cut ? cut[0] : src).replace(/^\s*today\s+i\s+will\s+/i, ""));
      return normalizeParts(kind, { intention, tasks: cut ? splitList(cut[1]) : [] });
    }
  }
}
