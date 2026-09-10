import { createHash, timingSafeEqual } from "node:crypto";

export type CronAuth = "ok" | "unauthorized" | "unconfigured";

/**
 * The cron route's only gate: `Authorization: Bearer <CRON_SECRET>`. There is no
 * session and no Origin on a call from pg_net, so the bearer is the whole security
 * model. An unset secret is "unconfigured" (the route answers 503), never "open".
 * Both sides are hashed before the constant-time compare so a wrong length leaks
 * nothing either.
 */
export function authorizeCron(authorization: string | null, secret: string | undefined): CronAuth {
  if (!secret) return "unconfigured";
  const m = /^Bearer\s+(\S+)\s*$/i.exec(authorization ?? "");
  if (!m) return "unauthorized";
  const given = createHash("sha256").update(m[1]).digest();
  const expected = createHash("sha256").update(secret).digest();
  return timingSafeEqual(given, expected) ? "ok" : "unauthorized";
}
