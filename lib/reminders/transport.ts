import { emit, redact } from "@/lib/observe";

export type Email = { to: string; subject: string; text: string; html: string };

export type SendResult = { ok: true } | { ok: false; error: string };

export type Transport = { name: "resend" | "log"; send(email: Email): Promise<SendResult> };

const RESEND_URL = "https://api.resend.com/emails";

/**
 * Resend's HTTP API through fetch — no SDK for one endpoint. A non-2xx is a failure
 * with the status and the provider's own message (operator text; the request body,
 * which holds the recipient, is never echoed).
 */
export function resendTransport(apiKey: string, from: string, fetchImpl: typeof fetch = fetch): Transport {
  return {
    name: "resend",
    async send(email) {
      let res: Response;
      try {
        res = await fetchImpl(RESEND_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
        });
      } catch (error) {
        return { ok: false, error: `resend fetch: ${redact((error as Error)?.message) ?? "failed"}` };
      }
      if (res.ok) return { ok: true };
      let message = "";
      try {
        const body = (await res.json()) as { message?: unknown; name?: unknown };
        message = typeof body.message === "string" ? body.message : typeof body.name === "string" ? body.name : "";
      } catch {
        // No JSON body: the status is the message.
      }
      return { ok: false, error: `resend ${res.status}${message ? `: ${redact(message)}` : ""}` };
    },
  };
}

/** Local stack and tests: nothing leaves the machine; one structured event per "send". The recipient is not logged. */
export function logTransport(): Transport {
  return {
    name: "log",
    async send(email) {
      emit("reminder.logged", { subject: email.subject });
      return { ok: true };
    },
  };
}

/**
 * Which transport this process may use. In production both Resend settings must be
 * present or the route refuses to run (503) — it never quietly logs instead of mailing.
 * Anywhere else an absent key means the log transport, so `npm run dev` and the e2e
 * suite send nothing.
 */
export function selectTransport(env: { RESEND_API_KEY?: string; REMINDER_FROM?: string; NODE_ENV?: string }): Transport | null {
  const key = env.RESEND_API_KEY?.trim();
  const from = env.REMINDER_FROM?.trim();
  if (key && from) return resendTransport(key, from);
  if (env.NODE_ENV === "production") return null;
  return logTransport();
}
