"use client";

import { useEffect, useRef } from "react";

/**
 * A modal on the native `<dialog>`: `showModal()` traps focus and makes the page inert,
 * Escape fires `cancel`, and focus goes back to whatever opened it when it unmounts.
 * A tap on the backdrop dismisses only when it both starts and ends there, so a scroll
 * that begins on the scrim is not a dismissal (iOS misfired on `mousedown` alone).
 */
export function Modal({
  labelledBy,
  onDismiss,
  initialFocus,
  maxWidth = 560,
  style,
  children,
}: {
  labelledBy: string;
  /** Escape, the backdrop, or the browser closing the dialog. Absent means neither dismisses. */
  onDismiss?: () => void;
  /** Focused after the dialog opens; otherwise the first focusable element is. */
  initialFocus?: React.RefObject<HTMLElement | null>;
  maxWidth?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const downOnBackdrop = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!el.open) el.showModal();
    initialFocus?.current?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
    // Open once, on mount; the opener is whatever had focus at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={labelledBy}
      style={{ maxWidth, ...style }}
      onCancel={(e) => {
        e.preventDefault();
        onDismiss?.();
      }}
      onClose={() => onDismiss?.()}
      onPointerDown={(e) => {
        downOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (onDismiss && downOnBackdrop.current && e.target === e.currentTarget) onDismiss();
      }}
    >
      {children}
    </dialog>
  );
}
