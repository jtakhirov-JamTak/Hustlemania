"use client";

/**
 * A selection row with a leading square (multi-select) or circle (single-select), as the
 * visual language prescribes instead of native inputs. Keyboard: it is a real button.
 */
export function OptionRow({
  on,
  single = false,
  disabled = false,
  onPick,
  label,
  sub,
  tag,
  testId,
}: {
  on: boolean;
  single?: boolean;
  disabled?: boolean;
  onPick: () => void;
  label: string;
  sub?: string | null;
  tag?: string | null;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role={single ? "radio" : "checkbox"}
      aria-checked={on}
      disabled={disabled}
      onClick={onPick}
      className={`option-row ${on ? "option-row-on" : ""}`}
      data-testid={testId}
    >
      <span className={`option-mark ${single ? "option-mark-circle" : ""}`} aria-hidden="true">
        {on ? (single ? "●" : "✓") : ""}
      </span>
      <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
        <span style={{ display: "block", fontSize: 14, lineHeight: 1.4 }}>{label}</span>
        {sub ? <span style={{ display: "block", fontSize: 12, color: "var(--muted)", marginTop: 2, lineHeight: 1.4 }}>{sub}</span> : null}
      </span>
      {tag ? <span className="option-tag">{tag}</span> : null}
    </button>
  );
}
