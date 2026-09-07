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
  className,
  style,
}: {
  idPrefix: string;
  when: string;
  then: string;
  onWhen: (v: string) => void;
  onThen: (v: string) => void;
  placeholderWhen?: string;
  placeholderThen?: string;
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
    </div>
  );
}
