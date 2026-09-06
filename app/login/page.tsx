import type { Metadata } from "next";
import { requestMagicLink } from "./actions";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  invalid: "Enter the email address you were invited with.",
  not_invited: "This email is not on the invite list.",
  send_failed: "The link could not be sent. Try again in a minute.",
  link: "That link has expired or was already used. Request a new one.",
  unavailable: "Sign-in is unavailable right now. Nothing is lost — try again in a few minutes.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; sent?: string; error?: string }>;
}) {
  const { email = "", sent, error } = await searchParams;

  return (
    <main className="page" style={{ alignItems: "center", justifyContent: "center", padding: "40px 16px" }}>
      <div className="card" style={{ width: "100%", maxWidth: 440, padding: "30px 32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: "var(--accent)", display: "inline-block" }} />
          <span className="heading" style={{ fontSize: 16, letterSpacing: "0.06em" }}>
            Hustlemania
          </span>
        </div>

        {sent ? (
          <div>
            <h1 className="heading" style={{ fontSize: 30, margin: 0 }}>
              Check your email
            </h1>
            <p style={{ fontSize: 14.5, lineHeight: 1.55, color: "var(--muted)", marginTop: 10 }}>
              A sign-in link is on its way to <strong style={{ color: "var(--ink)", fontWeight: 600 }}>{email}</strong>. It
              works once and expires in an hour.
            </p>
            <form action={requestMagicLink} style={{ marginTop: 18 }}>
              <input type="hidden" name="email" value={email} />
              <button type="submit" className="btn btn-ghost" style={{ padding: "6px 0" }}>
                Send another link
              </button>
            </form>
          </div>
        ) : (
          <form action={requestMagicLink}>
            <h1 className="heading" style={{ fontSize: 30, margin: 0 }}>
              Sign in
            </h1>
            <p style={{ fontSize: 14.5, lineHeight: 1.55, color: "var(--muted)", marginTop: 10 }}>
              Invite-only. Enter your email and we will send a one-time link — no password.
            </p>
            <label className="label-accent" htmlFor="email" style={{ display: "block", marginTop: 20 }}>
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              defaultValue={email}
              className="input"
              style={{ marginTop: 6 }}
              placeholder="you@example.com"
            />
            {error ? (
              <div role="alert" className="hint" style={{ marginTop: 10 }}>
                {ERRORS[error] ?? ERRORS.send_failed}
              </div>
            ) : null}
            <button type="submit" className="btn btn-primary" style={{ marginTop: 18, width: "100%" }}>
              Email me a sign-in link
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
