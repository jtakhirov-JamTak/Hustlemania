"use client";

/**
 * A page that failed to render inside the app shell. The header and tabs stay, the
 * failure is already reported server-side (instrumentation.ts), and the user gets a
 * retry instead of Next's blank "Application error" page.
 */
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="main">
      <div className="card card-page card-narrow" role="alert">
        <h1 className="heading page-title page-title-sm">This page could not load</h1>
        <p className="lede">Nothing you saved is lost. Try again; if it keeps failing, sign out and back in.</p>
        <button type="button" className="btn btn-primary mt-18" onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  );
}
