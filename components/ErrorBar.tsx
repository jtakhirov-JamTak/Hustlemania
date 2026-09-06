"use client";

/** The one-line save error with its recovery action: Retry (a submit or a handler), Reload, Dismiss. */
export function ErrorBar({ children, action, style }: { children: React.ReactNode; action?: { label: string; onClick?: () => void; submit?: boolean }; style?: React.CSSProperties }) {
  return (
    <div role="alert" className="error-bar" style={style}>
      <span>{children}</span>
      {action ? (
        <button type={action.submit ? "submit" : "button"} className="link-quiet" style={{ color: "inherit", fontWeight: 600 }} onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
