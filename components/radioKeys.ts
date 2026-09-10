import type { KeyboardEvent } from "react";

/**
 * Arrow-key movement inside a `role="radiogroup"` of button radios: the next radio takes
 * focus and is picked, wrapping at the ends, as a native radio group behaves. Every
 * custom radio in the app shares this so none of them promises a role it does not honour.
 */
export function onRadioArrowKeys(e: KeyboardEvent<HTMLButtonElement>): void {
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
