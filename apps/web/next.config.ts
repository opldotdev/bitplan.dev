import type { NextConfig } from "next";

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: "base-uri 'self'; frame-ancestors 'none'; object-src 'none'",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), geolocation=(), microphone=(), payment=()",
  },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Link",
    value:
      '</.well-known/ai-catalog.json>; rel="describedby"; type="application/json"',
  },
] as const;

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        headers: [...securityHeaders],
        source: "/:path*",
      },
      {
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex",
          },
        ],
        source: "/d/:path*",
      },
      {
        headers: [
          {
            key: "Access-Control-Allow-Origin",
            value: "*",
          },
        ],
        source: "/.well-known/:path*",
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        hostname: "api.1sat.app",
        pathname: "/1sat/ordfs/image/**",
        protocol: "https",
      },
    ],
  },
  // The share-card routes read these at runtime via process.cwd().
  outputFileTracingIncludes: {
    "/**": ["./assets/og/**"],
  },
  poweredByHeader: false,
};

export default nextConfig;
