"use client";

import { useId, useState } from "react";
import { TWO_TAP_IDLE, twoTapNext } from "@/lib/twoTap";

/**
 * A destructive action that needs two taps: the first shows `armedLabel` (in the under
 * colour), the second calls `onFire`; leaving the button disarms it. State rule in
 * lib/twoTap.ts.
 */
export function TwoTap({
  label,
  armedLabel,
  onFire,
  disabled = false,
  className = "",
  testId,
}: {
  label: string;
  armedLabel: string;
  onFire: () => void;
  disabled?: boolean;
  className?: string;
  testId?: string;
}) {
  const [state, setState] = useState(TWO_TAP_IDLE);
  const step = (event: "tap" | "blur") => {
    const next = twoTapNext(state, event);
    setState(next.state);
    if (next.fire) onFire();
  };
  const liveId = useId();
  return (
    <>
      <button
        type="button"
        className={`${className} ${state.armed ? "two-tap-armed" : ""}`}
        aria-describedby={liveId}
        disabled={disabled}
        onClick={() => step("tap")}
        onBlur={() => step("blur")}
        data-testid={testId}
      >
        {state.armed ? armedLabel : label}
      </button>
      {/* Not `aria-pressed`: this is not a toggle. The armed copy is announced as a status,
          since a name change on a focused control is not reliably read. */}
      <span id={liveId} className="sr-only" aria-live="polite">
        {state.armed ? armedLabel : ""}
      </span>
    </>
  );
}
