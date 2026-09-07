"use client";

/** The one-line save error with its recovery action: Retry (a submit or a handler), Reload, Dismiss. */
export function ErrorBar({
  children,
  action,
  className,
  style,
}: {
  children: React.ReactNode;
  action?: { label: string; onClick?: () => void; submit?: boolean };
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div role="alert" className={`error-bar ${className ?? ""}`} style={style}>
      <span>{children}</span>
      {action ? (
        <button type={action.submit ? "submit" : "button"} className="link-quiet error-bar-action" onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
