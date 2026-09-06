"use client";

/**
 * A page that failed to render inside the app shell. The header and tabs stay, the
 * failure is already reported server-side (instrumentation.ts), and the user gets a
 * retry instead of Next's blank "Application error" page.
 */
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main data-main style={{ flex: 1, minWidth: 0, padding: "30px 40px 100px" }}>
      <div className="card" role="alert" style={{ maxWidth: 560, padding: "28px 30px" }}>
        <h1 className="heading" style={{ fontSize: 26, margin: 0 }}>
          This page could not load
        </h1>
        <p style={{ fontSize: 14.5, lineHeight: 1.55, color: "var(--muted)", marginTop: 10 }}>
          Nothing you saved is lost. Try again; if it keeps failing, sign out and back in.
        </p>
        <button type="button" className="btn btn-primary" style={{ marginTop: 18 }} onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  );
}
