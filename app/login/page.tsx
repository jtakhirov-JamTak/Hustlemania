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
    <main className="page login-page">
      <div className="card login-card">
        <div className="login-brand">
          <span className="brand-dot" />
          <span className="heading brand-name">Hustlemania</span>
        </div>

        {sent ? (
          <div>
            <h1 className="heading page-title">Check your email</h1>
            <p className="lede">
              A sign-in link is on its way to <strong>{email}</strong>. It works once and expires in an hour.
            </p>
            <form action={requestMagicLink} className="mt-18">
              <input type="hidden" name="email" value={email} />
              <button type="submit" className="btn btn-ghost btn-ghost-flush">
                Send another link
              </button>
            </form>
          </div>
        ) : (
          <form action={requestMagicLink}>
            <h1 className="heading page-title">Sign in</h1>
            <p className="lede">Invite-only. Enter your email and we will send a one-time link — no password.</p>
            <label className="label-accent block mt-20" htmlFor="email">
              Email
            </label>
            <input id="email" name="email" type="email" required autoComplete="email" defaultValue={email} className="input mt-6" placeholder="you@example.com" />
            {error ? (
              <div role="alert" className="hint mt-10">
                {ERRORS[error] ?? ERRORS.send_failed}
              </div>
            ) : null}
            <button type="submit" className="btn btn-primary login-submit">
              Email me a sign-in link
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
