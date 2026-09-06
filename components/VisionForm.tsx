"use client";

import { ErrorBar } from "@/components/ErrorBar";
import { useState, useTransition } from "react";
import { saveVision } from "@/app/(app)/actions/vision";
import type { AreaKey } from "@/lib/areas";
import { callAction } from "@/lib/callAction";

export function VisionForm({ area, initialBody, savedAt }: { area: AreaKey; initialBody: string; savedAt: string | null }) {
  const [body, setBody] = useState(initialBody);
  const [savedBody, setSavedBody] = useState(initialBody);
  const [status, setStatus] = useState<{ kind: "idle" | "saved" | "error"; text?: string }>({ kind: "idle" });
  const [pending, start] = useTransition();
  const dirty = body.trim() !== savedBody.trim();
  const blocked = pending || !body.trim() || !dirty;

  return (
    <form
      className="card"
      style={{ marginTop: 22, padding: "24px 26px" }}
      onSubmit={(e) => {
        e.preventDefault();
        if (blocked) return;
        start(async () => {
          const res = await callAction(() => saveVision(area, body));
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
        style={{ marginTop: 8, borderRadius: 16, lineHeight: 1.55 }}
      />
      {status.kind === "error" ? (
        <ErrorBar style={{ marginTop: 12 }} action={{ label: "Retry", submit: true }}>{status.text}</ErrorBar>
      ) : null}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 16, flexWrap: "wrap" }}>
        <button type="submit" className="btn btn-primary" aria-disabled={blocked} aria-describedby={body.trim() ? undefined : "vision-hint"}>
          {pending ? "Saving…" : "Save vision"}
        </button>
        <span className="hint" id="vision-hint" aria-live="polite">
          {body.trim() ? "" : "Write something first."}
        </span>
        <span aria-live="polite">
          {status.kind === "saved" && !dirty ? (
            <span style={{ fontSize: 12, color: "var(--success)", fontWeight: 600 }}>Saved</span>
          ) : savedAt && !dirty ? (
            <span style={{ fontSize: 11.5, color: "var(--muted)" }}>Saved {new Date(savedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
          ) : null}
        </span>
      </div>
    </form>
  );
}
