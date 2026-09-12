import { describe, expect, it } from "vitest";
import { dictationSupport, mergeTranscript } from "@/lib/dictation";

describe("dictation: mergeTranscript", () => {
  it("joins base, final and interim with one space and skips empty parts", () => {
    expect(mergeTranscript("", "hello", "")).toBe("hello");
    expect(mergeTranscript("Already typed.", "hello", "wor")).toBe("Already typed. hello wor");
    expect(mergeTranscript("Already typed.", "", "wor")).toBe("Already typed. wor");
    expect(mergeTranscript("", "", "")).toBe("");
  });

  it("trims each part, so a browser's leading spaces and a trailing newline do not stack", () => {
    expect(mergeTranscript("typed \n", " hello", " world ")).toBe("typed hello world");
    expect(mergeTranscript("   ", "  ", " x ")).toBe("x");
  });

  it("replaces the interim words on each event instead of appending them", () => {
    const base = "typed";
    const first = mergeTranscript(base, "", "hel");
    const second = mergeTranscript(base, "", "hello");
    const done = mergeTranscript(base, "hello", "");
    expect(first).toBe("typed hel");
    expect(second).toBe("typed hello");
    expect(done).toBe("typed hello");
  });
});

describe("dictation: dictationSupport", () => {
  it("is unsupported with no window or a bare window, supported with either constructor", () => {
    expect(dictationSupport(null)).toBe("unsupported");
    expect(dictationSupport({})).toBe("unsupported");
    expect(dictationSupport({ SpeechRecognition: undefined })).toBe("unsupported");
    expect(dictationSupport({ webkitSpeechRecognition: class {} })).toBe("supported");
    expect(dictationSupport({ SpeechRecognition: class {} })).toBe("supported");
  });
});
