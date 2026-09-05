"use client";

import { useState, useTransition } from "react";
import { saveVision } from "@/app/(app)/actions";
import type { AreaKey } from "@/lib/areas";

export function VisionForm({ area, initialBody, savedAt }: { area: AreaKey; initialBody: string; savedAt: string | null }) {
  const [body, setBody] = useState(initialBody);
  const [savedBody, setSavedBody] = useState(initialBody);
  const [status, setStatus] = useState<{ kind: "idle" | "saved" | "error"; text?: string }>({ kind: "idle" });
  const [pending, start] = useTransition();
  const dirty = body.trim() !== savedBody.trim();

  return (
    <form
      className="card"
      style={{ marginTop: 22, padding: "24px 26px" }}
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await saveVision(area, body);
          if (res.error) {
            setStatus({ kind: "error", text: res.error });
            return;
          }
          setSavedBody(body);
          setStatus({ kind: "saved" });
        });
      }}
    >
      <label className="label-accent" htmlFor="vision-body">
        The vision
      </label>
      <textarea
        id="vision-body"
        className="input"
        rows={7}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="In one year…"
        style={{ marginTop: 8, borderRadius: 16, fontSize: 15.5, lineHeight: 1.55 }}
      />
      {status.kind === "error" ? (
        <div role="alert" className="error-bar" style={{ marginTop: 12 }}>
          <span>{status.text}</span>
          <button type="submit" className="link-quiet" style={{ color: "inherit", fontWeight: 600 }}>
            Retry
          </button>
        </div>
      ) : null}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 16, flexWrap: "wrap" }}>
        <button type="submit" className="btn btn-primary" disabled={pending || !body.trim() || !dirty}>
          {pending ? "Saving…" : "Save vision"}
        </button>
        {!body.trim() ? <span className="hint">Write something first.</span> : null}
        {status.kind === "saved" && !dirty ? (
          <span style={{ fontSize: 12, color: "var(--success)", fontWeight: 600 }}>Saved</span>
        ) : savedAt && !dirty ? (
          <span style={{ fontSize: 11.5, color: "var(--muted)" }}>Saved {new Date(savedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
        ) : null}
      </div>
    </form>
  );
}
