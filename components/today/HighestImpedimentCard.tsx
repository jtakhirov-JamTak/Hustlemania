"use client";

import { ProofInputs } from "@/components/ProofInputs";
import { ErrorBar } from "@/components/ErrorBar";
import { useEffect, useRef, useState, useTransition } from "react";
import { saveProofPoint, setHighestImpediment } from "@/app/(app)/actions/library";
import { ItemPicker } from "@/components/ItemPicker";
import { callAction } from "@/lib/callAction";
import { proofComplete, proofSummary, type SprintItems } from "@/lib/data";

const PROOF_HINT = "WHEN, THEN and the recovery criterion are all required.";

/**
 * Today's Highest Impediment: name, WHEN → THEN → RECOVERED WHEN, "Change" (picker over
 * the sprint's impediments, with proof inputs when the pick is incomplete) and "Edit
 * proof point".
 */
export function HighestImpedimentCard({ sprintId, impediments, locked }: { sprintId: string; impediments: SprintItems["impediments"]; locked: boolean }) {
  const highest = impediments.find((i) => i.is_highest) ?? null;
  const [changing, setChanging] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [when, setWhen] = useState("");
  const [then, setThen] = useState("");
  const [recover, setRecover] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const editButton = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  useEffect(() => {
    if (wasEditing.current && !editing) editButton.current?.focus();
    wasEditing.current = editing;
  }, [editing]);
  const filled = Boolean(when.trim() && then.trim() && recover.trim());
  const proofHint = filled ? null : PROOF_HINT;

  const picked = impediments.find((i) => i.id === pick) ?? null;
  const needsProof = Boolean(picked && !proofComplete(picked));
  const pickHint = !pick ? "Pick one impediment." : needsProof && !filled ? PROOF_HINT : null;

  /** The picker's inputs start from what the pick already has, so only the missing part needs typing. */
  function prefill(i: { proof_when: string | null; proof_then: string | null; proof_recover: string | null } | null) {
    setWhen(i?.proof_when ?? "");
    setThen(i?.proof_then ?? "");
    setRecover(i?.proof_recover ?? "");
  }

  function openChange() {
    setPick(highest?.id ?? null);
    prefill(highest);
    setError(null);
    setChanging(true);
  }

  function openEdit() {
    prefill(highest);
    setError(null);
    setEditing(true);
  }

  function confirmChange() {
    if (!pick || pickHint) return;
    start(async () => {
      const res = await callAction(() => setHighestImpediment(sprintId, pick, needsProof ? { when, then, recover } : undefined));
      if (res.error) {
        setError(res.error);
        return;
      }
      setChanging(false);
    });
  }

  function saveProof() {
    if (!highest || proofHint || pending) return;
    start(async () => {
      const res = await callAction(() => saveProofPoint(highest.id, { when, then, recover }));
      if (res.error) {
        setError(res.error);
        return;
      }
      setEditing(false);
    });
  }

  return (
    <section className="card" style={{ marginTop: 20, padding: "24px 26px" }} data-testid="highest-impediment">
      <h2 className="label-accent" style={{ margin: 0 }}>
        Highest impediment
      </h2>
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
                <span className="label-accent" style={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                  RECOVERED WHEN
                </span>
                {highest.proof_recover ? (
                  <span style={{ fontSize: 15, lineHeight: 1.45 }} data-testid="proof-recover">
                    {highest.proof_recover}
                  </span>
                ) : (
                  <span style={{ fontSize: 13, lineHeight: 1.45, color: "var(--muted)", fontStyle: "italic" }} data-testid="proof-recover-missing">
                    Recovery criterion not set — add it under Edit proof point.
                  </span>
                )}
              </div>
              {!locked ? (
                <button ref={editButton} type="button" className="link-quiet" style={{ paddingTop: 10 }} onClick={openEdit}>
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
              <ProofInputs idPrefix="hi" when={when} then={then} recover={recover} onWhen={setWhen} onThen={setThen} onRecover={setRecover} placeholderWhen="" placeholderThen="" placeholderRecover="" />
              {error ? (
                <ErrorBar style={{ marginTop: 12 }}>{error}</ErrorBar>
              ) : null}
              <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
                <span className="hint" id="hi-hint" aria-live="polite">
                  {proofHint ?? ""}
                </span>
                <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" aria-disabled={pending || Boolean(proofHint)} aria-describedby={proofHint ? "hi-hint" : undefined}>
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
          blurb="The obstacle most likely to cause this sprint to fail. It must carry a WHEN → THEN proof point and a recovery criterion."
          options={impediments.map((i) => ({ id: i.id, label: i.name, sub: proofSummary(i) ?? "No proof point yet", tag: i.is_highest ? "Current" : null }))}
          single
          selected={pick ? [pick] : []}
          onToggle={(id) => {
            setPick(id);
            prefill(impediments.find((i) => i.id === id) ?? null);
          }}
          proof={needsProof ? { when, then, recover, onWhen: setWhen, onThen: setThen, onRecover: setRecover } : null}
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
