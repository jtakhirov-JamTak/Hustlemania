"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { dictationSupport, mergeTranscript } from "@/lib/dictation";

// The Web Speech API is not in lib.dom for every target; the shape used here is
// declared locally and looked up at runtime, so the server render never touches it.
type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEvent = { results: ArrayLike<RecognitionResult> };
type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type RecognitionCtor = new () => Recognition;

/** One box listens at a time: opening a second mic stops the first. */
let active: Recognition | null = null;

/**
 * F16: a Dictate button for one text box. Rendered only after mount and only where the
 * browser recognises speech (hidden otherwise; the phone keyboard mic still works).
 * Continuous with interim results: the words land in the box as they are recognised,
 * after whatever was already typed. A denied microphone shows a one-line note.
 */
export function Dictate({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  // Support is a property of the browser, not of React state: the server snapshot says
  // "no" so the markup matches on hydration, the client snapshot asks the window.
  const supported = useSyncExternalStore(
    () => () => {},
    () => dictationSupport(window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }) === "supported",
    () => false,
  );
  const [listening, setListening] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const base = useRef("");

  useEffect(() => {
    const current = rec;
    return () => {
      current.current?.abort();
      if (active === current.current) active = null;
    };
  }, []);

  function start() {
    const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    active?.stop();
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = navigator.language || "en-US";
    // `start` is an event handler, so `value` here is the box's value at the tap.
    base.current = value;
    r.onresult = (e) => {
      let finalText = "";
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interim += t;
      }
      onChange(mergeTranscript(base.current, finalText, interim));
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") setBlocked(true);
      setListening(false);
    };
    r.onend = () => {
      setListening(false);
      if (active === r) active = null;
    };
    rec.current = r;
    active = r;
    setBlocked(false);
    setListening(true);
    try {
      r.start();
    } catch {
      setListening(false);
    }
  }

  function stop() {
    rec.current?.stop();
    setListening(false);
  }

  if (!supported) return null;
  return (
    <div className="dictate">
      <button
        type="button"
        className={`dictate-btn ${listening ? "dictate-on" : ""}`}
        aria-label={`Dictate ${label}`}
        aria-pressed={listening}
        disabled={disabled}
        onClick={listening ? stop : start}
      >
        <span className="dictate-dot" aria-hidden="true" />
        <span>{listening ? "Listening… tap to stop" : "Dictate"}</span>
      </button>
      {blocked ? (
        <span className="dictate-note" role="status">
          Microphone blocked in this browser. Allow it or type.
        </span>
      ) : null}
    </div>
  );
}
