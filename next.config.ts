import type { NextConfig } from "next";

// Every response: no framing (the app has a "Close Day" button worth clickjacking), no
// referrer leakage of area paths, no framework banner. A script-src CSP is deliberately
// absent — Next's inline bootstrap needs nonces for that, a separate change.
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  agentRules: false,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
