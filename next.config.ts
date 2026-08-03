import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "img.icons8.com" }],
  },
  async rewrites() {
    if (process.env.NODE_ENV !== "development") {
      return [];
    }

    // Development-only same-origin transport forwarding. Nest remains the
    // authentication and domain endpoint; Next only relays the request.
    return [
      { source: "/v1/:path*", destination: "http://127.0.0.1:3001/v1/:path*" },
      { source: "/auth/:path*", destination: "http://127.0.0.1:3001/auth/:path*" },
    ];
  },
};

export default nextConfig;
