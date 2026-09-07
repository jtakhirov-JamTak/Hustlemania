"use client";

/** The WHEN → THEN → RECOVERED WHEN proof-point inputs, labelled, on one grid. Ids come from `idPrefix`. */
export function ProofInputs({
  idPrefix,
  when,
  then,
  recover,
  onWhen,
  onThen,
  onRecover,
  placeholderWhen = "I notice myself…",
  placeholderThen = "I immediately…",
  placeholderRecover = "…is true within…",
  className,
  style,
}: {
  idPrefix: string;
  when: string;
  then: string;
  recover: string;
  onWhen: (v: string) => void;
  onThen: (v: string) => void;
  onRecover: (v: string) => void;
  placeholderWhen?: string;
  placeholderThen?: string;
  placeholderRecover?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={`proof-grid ${className ?? ""}`} style={style}>
      <label htmlFor={`${idPrefix}-when`} className="label-accent proof-label">
        WHEN
      </label>
      <input id={`${idPrefix}-when`} className="input input-compact" value={when} onChange={(e) => onWhen(e.target.value)} placeholder={placeholderWhen} />
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
