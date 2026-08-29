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
        destination: "https://ordfs.network/:path*",
        source: "/ordfs/:path*",
      },
    ];
  },
};

export default nextConfig;
