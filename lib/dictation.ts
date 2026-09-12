/**
 * F16: dictation through the browser's Web Speech API. The pure parts live here so
 * they can be unit-tested; `components/Dictate.tsx` owns the recogniser.
 */

export type DictationSupport = "supported" | "unsupported";

type MaybeWindow = { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown } | null | undefined;

/** Whether this window can recognise speech (Chrome, Edge, Safari; not Firefox). */
export function dictationSupport(w: MaybeWindow): DictationSupport {
  if (!w) return "unsupported";
  return typeof w.SpeechRecognition === "function" || typeof w.webkitSpeechRecognition === "function" ? "supported" : "unsupported";
}

/**
 * The field's value while a dictation runs: what was there when the mic opened, then
 * the recognised text so far, then the words still being recognised — each part
 * trimmed, joined by one space, empty parts skipped. Called on every recognition
 * event, so the interim words are always replaced, never appended twice.
 */
export function mergeTranscript(base: string, finalText: string, interim: string): string {
  return [base, finalText, interim]
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .join(" ");
}
