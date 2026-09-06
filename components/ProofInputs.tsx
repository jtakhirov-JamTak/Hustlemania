"use client";

/** The WHEN → THEN proof-point pair, labelled, on one grid. Ids come from `idPrefix`. */
export function ProofInputs({
  idPrefix,
  when,
  then,
  onWhen,
  onThen,
  placeholderWhen = "I notice myself…",
  placeholderThen = "I immediately…",
  style,
}: {
  idPrefix: string;
  when: string;
  then: string;
  onWhen: (v: string) => void;
  onThen: (v: string) => void;
  placeholderWhen?: string;
  placeholderThen?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "9px 12px", alignItems: "center", ...style }}>
      <label htmlFor={`${idPrefix}-when`} className="label-accent" style={{ fontWeight: 700 }}>
        WHEN
      </label>
      <input id={`${idPrefix}-when`} className="input" value={when} onChange={(e) => onWhen(e.target.value)} placeholder={placeholderWhen} style={{ padding: "10px 13px" }} />
      <label htmlFor={`${idPrefix}-then`} className="label-accent" style={{ fontWeight: 700 }}>
        THEN
      </label>
      <input id={`${idPrefix}-then`} className="input" value={then} onChange={(e) => onThen(e.target.value)} placeholder={placeholderThen} style={{ padding: "10px 13px" }} />
    </div>
  );
}
