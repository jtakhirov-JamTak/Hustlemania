"use client";

import { useState, useTransition } from "react";
import { saveProofPoint, setHighestImpediment } from "@/app/(app)/actions";
import { ItemPicker } from "@/components/ItemPicker";
import type { SprintItems } from "@/lib/data";

/**
 * Today's Highest Impediment: name, WHEN → THEN, "Change" (picker over the sprint's
 * impediments, with proof inputs when the pick has none) and "Edit proof point".
 */
export function HighestImpedimentCard({ sprintId, impediments, locked }: { sprintId: string; impediments: SprintItems["impediments"]; locked: boolean }) {
  const highest = impediments.find((i) => i.is_highest) ?? null;
  const [changing, setChanging] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [when, setWhen] = useState("");
  const [then, setThen] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const picked = impediments.find((i) => i.id === pick) ?? null;
  const needsProof = Boolean(picked && !(picked.proof_when && picked.proof_then));
  const pickHint = !pick ? "Pick one impediment." : needsProof && !(when.trim() && then.trim()) ? "The highest impediment needs a WHEN → THEN." : null;

  function openChange() {
    setPick(highest?.id ?? null);
    setWhen("");
    setThen("");
    setError(null);
    setChanging(true);
  }

  function openEdit() {
    setWhen(highest?.proof_when ?? "");
    setThen(highest?.proof_then ?? "");
    setError(null);
    setEditing(true);
  }

  function confirmChange() {
    if (!pick || pickHint) return;
    start(async () => {
      const res = await setHighestImpediment(sprintId, pick, needsProof ? { when, then } : undefined);
      if (res.error) {
        setError(res.error);
        return;
      }
      setChanging(false);
    });
  }

  function saveProof() {
    if (!highest || !when.trim() || !then.trim()) return;
    start(async () => {
      const res = await saveProofPoint(highest.id, when, then);
      if (res.error) {
        setError(res.error);
        return;
      }
      setEditing(false);
    });
  }

  return (
    <section className="card" style={{ marginTop: 20, padding: "24px 26px" }} data-testid="highest-impediment">
      <div className="label-accent">Highest impediment</div>
      {highest ? (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginTop: 6 }}>
            <div className="heading" style={{ fontSize: 22, letterSpacing: "-0.01em" }} data-testid="highest-name">
              {highest.name}
            </div>
            {!locked ? (
              <button type="button" className="link-quiet" onClick={openChange}>
                Change
              </button>
            ) : null}
          </div>
          {!editing ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 14px", marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--divider)", alignItems: "baseline" }}>
                <span className="label-accent" style={{ fontWeight: 700 }}>
                  WHEN
                </span>
                <span style={{ fontSize: 15, lineHeight: 1.45 }} data-testid="proof-when">
                  {highest.proof_when}
                </span>
                <span className="label-accent" style={{ fontWeight: 700 }}>
                  THEN
                </span>
                <span style={{ fontSize: 15, lineHeight: 1.45 }} data-testid="proof-then">
                  {highest.proof_then}
                </span>
              </div>
              {!locked ? (
                <button type="button" className="link-quiet" style={{ paddingTop: 10 }} onClick={openEdit}>
                  Edit proof point
                </button>
              ) : null}
            </>
          ) : (
            <form
              style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--divider)" }}
              onSubmit={(e) => {
                e.preventDefault();
                saveProof();
              }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "9px 12px", alignItems: "center" }}>
                <label htmlFor="hi-when" className="label-accent" style={{ fontWeight: 700 }}>
                  WHEN
                </label>
                <input id="hi-when" className="input" value={when} onChange={(e) => setWhen(e.target.value)} style={{ fontSize: 13.5, padding: "10px 13px" }} />
                <label htmlFor="hi-then" className="label-accent" style={{ fontWeight: 700 }}>
                  THEN
                </label>
                <input id="hi-then" className="input" value={then} onChange={(e) => setThen(e.target.value)} style={{ fontSize: 13.5, padding: "10px 13px" }} />
              </div>
              {error ? (
                <div role="alert" className="error-bar" style={{ marginTop: 12 }}>
                  <span>{error}</span>
                </div>
              ) : null}
              <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, marginTop: 12 }}>
                {!(when.trim() && then.trim()) ? <span className="hint">Both WHEN and THEN are required.</span> : null}
                <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={pending || !(when.trim() && then.trim())}>
                  {pending ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          )}
        </>
      ) : (
        <div style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 6 }}>No highest impediment is set for this sprint.</div>
      )}

      {changing ? (
        <ItemPicker
          title="Change the highest impediment"
          blurb="The obstacle most likely to cause this sprint to fail. It must carry a WHEN → THEN proof point."
          options={impediments.map((i) => ({ id: i.id, label: i.name, sub: i.proof_when && i.proof_then ? `WHEN ${i.proof_when} · THEN ${i.proof_then}` : "No proof point yet", tag: i.is_highest ? "Current" : null }))}
          single
          selected={pick ? [pick] : []}
          onToggle={(id) => {
            setPick(id);
            setWhen("");
            setThen("");
          }}
          proof={needsProof ? { when, then, onWhen: setWhen, onThen: setThen } : null}
          hint={pickHint}
          error={error}
          doneLabel="Set as highest"
          pending={pending}
          onDone={confirmChange}
          onCancel={() => setChanging(false)}
        />
      ) : null}
    </section>
  );
}
