"use client";

import { useEffect, useRef } from "react";

/**
 * A page heading that takes focus when it appears with nothing else focused. When a
 * server action replaces the current view in place (the Journal becomes the review gate,
 * the postmortem becomes its reviewed copy), the pressed button unmounts and focus falls
 * to <body>; nothing announces the change. The heading picks focus up in exactly that
 * case, and never on an ordinary page load where focus sits where the browser put it
 * (full review 2026-09-09, #7 / #8; SC 4.1.3, 2.4.3).
 */
export function AnnounceHeading({ className, children, testId }: { className?: string; children: React.ReactNode; testId?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (document.activeElement === document.body) ref.current?.focus();
  }, []);
  return (
    <h1 ref={ref} tabIndex={-1} className={className} data-testid={testId}>
      {children}
    </h1>
  );
}
