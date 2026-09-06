"use client";

/** The root layout itself failed: no shell to keep, so a bare page with a retry. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f7fbfd", color: "#16242e" }}>
        <main role="alert" style={{ maxWidth: 560, margin: "80px auto", padding: "0 16px" }}>
          <h1 style={{ fontSize: 26, margin: 0 }}>Hustlemania could not load</h1>
          <p style={{ fontSize: 15, lineHeight: 1.55, marginTop: 10 }}>Nothing you saved is lost. Try again in a moment.</p>
          <button type="button" onClick={reset} style={{ marginTop: 18, padding: "12px 18px", fontSize: 15, borderRadius: 12, border: "none", background: "#2b7ea8", color: "#fff" }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
