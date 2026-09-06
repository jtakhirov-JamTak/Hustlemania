"use client";

import { useState } from "react";
import { saveIntention } from "@/app/(app)/actions/day";
import { callAction } from "@/lib/callAction";

export function IntentionCard({ dayId, initial, locked }: { dayId: string; initial: string; locked: boolean }) {
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [status, setStatus] = useState<{ kind: "idle" | "saving" | "saved" | "error"; text?: string }>({ kind: "idle" });

  async function persist() {
    if (text.trim() === saved.trim()) return;
    setStatus({ kind: "saving" });
    const res = await callAction(() => saveIntention(dayId, text));
    if (res.error) {
      setStatus({ kind: "error", text: res.error });
      return;
    }
    setSaved(text);
    setStatus({ kind: "saved" });
  }

  return (
    <section className="card" style={{ marginTop: 20, padding: "22px 26px" }} data-testid="intention-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <label className="label-accent" htmlFor="intention">
          Daily intention
        </label>
        <span style={{ fontSize: 11, color: status.kind === "error" ? "var(--under)" : "var(--muted)" }}>
          {locked ? "Locked with the closed day" : status.kind === "saving" ? "Saving…" : status.kind === "saved" ? "Saved" : ""}
        </span>
      </div>
      <textarea
        id="intention"
        className="input"
        rows={2}
        value={text}
        disabled={locked}
        onChange={(e) => setText(e.target.value)}
        onBlur={persist}
        placeholder="Today I will…"
        style={{ borderRadius: 14, fontSize: 15, lineHeight: 1.5, resize: "vertical" }}
      />
      {status.kind === "error" ? (
        <div role="alert" className="error-bar" style={{ marginTop: 10 }}>
          <span>{status.text}</span>
          <button type="button" className="link-quiet" style={{ color: "inherit", fontWeight: 600 }} onClick={persist}>
            Retry
          </button>
        </div>
      ) : null}
    </section>
  );
}
