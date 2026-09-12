"use client";

/** The THEN → RECOVERED WHEN response inputs, labelled, on one grid (F15: WHEN is the impediment's name). Ids come from `idPrefix`. */
export function ProofInputs({
  idPrefix,
  then,
  recover,
  onThen,
  onRecover,
  placeholderThen = "I immediately…",
  placeholderRecover = "…is true within…",
  className,
  style,
}: {
  idPrefix: string;
  then: string;
  recover: string;
  onThen: (v: string) => void;
  onRecover: (v: string) => void;
  placeholderThen?: string;
  placeholderRecover?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={`proof-grid ${className ?? ""}`} style={style}>
      <label htmlFor={`${idPrefix}-then`} className="label-accent proof-label">
        THEN
      </label>
      <input id={`${idPrefix}-then`} className="input input-compact" value={then} onChange={(e) => onThen(e.target.value)} placeholder={placeholderThen} />
      <label htmlFor={`${idPrefix}-recover`} className="label-accent proof-label">
        RECOVERED WHEN
      </label>
      <input id={`${idPrefix}-recover`} className="input input-compact" value={recover} onChange={(e) => onRecover(e.target.value)} placeholder={placeholderRecover} />
    </div>
  );
}
