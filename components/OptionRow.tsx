"use client";

/**
 * A selection row with a leading square (multi-select) or circle (single-select), as the
 * visual language prescribes instead of native inputs. Keyboard: it is a real button;
 * in single mode the arrow keys move along the radiogroup and pick as they go.
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
      onKeyDown={
        single
          ? (e) => {
              const delta = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
              if (!delta) return;
              const group = e.currentTarget.closest('[role="radiogroup"]');
              const radios = Array.from(group?.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)') ?? []);
              const next = radios[(radios.indexOf(e.currentTarget) + delta + radios.length) % radios.length];
              if (!next) return;
              e.preventDefault();
              next.focus();
              next.click();
            }
          : undefined
      }
      className={`option-row ${on ? "option-row-on" : ""}`}
      data-testid={testId}
    >
      <span className={`option-mark ${single ? "option-mark-circle" : ""}`} aria-hidden="true">
        {on ? (single ? "●" : "✓") : ""}
      </span>
      <span className="option-body">
        <span className="option-label">{label}</span>
        {sub ? <span className="option-sub">{sub}</span> : null}
      </span>
      {tag ? <span className="option-tag">{tag}</span> : null}
    </button>
  );
}
