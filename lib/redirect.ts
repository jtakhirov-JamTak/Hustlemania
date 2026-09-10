/**
 * A post-action return target is accepted only as a same-origin relative path: one
 * leading slash, no second slash, no backslash (browsers fold `/\evil.com` to
 * `//evil.com`), no control characters (header and log injection). REDIRECT-VALIDATE.
 */
export function isSameOriginPath(next: string): boolean {
  return /^\/(?!\/)/.test(next) && !/[\\\x00-\x1f\x7f]/.test(next);
}
