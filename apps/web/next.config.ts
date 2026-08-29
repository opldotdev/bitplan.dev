import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex",
          },
        ],
        source: "/d/:path*",
      },
    ];
  },
  async rewrites() {
    return [
      {
        destination: "https://api.1sat.app/:path*",
        source: "/ordfs/:path*",
      },
    ];
  },
};

export default nextConfig;
