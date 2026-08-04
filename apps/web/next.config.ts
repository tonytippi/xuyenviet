import type { NextConfig } from "next";
import { resolve } from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@xuyenviet/contracts"],
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@xuyenviet/contracts": resolve(process.cwd(), "../../packages/contracts/src/index.ts"),
    };
    return config;
  },
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    return [
      { source: "/v1/:path*", destination: "http://127.0.0.1:3001/v1/:path*" },
      { source: "/auth/:path*", destination: "http://127.0.0.1:3001/auth/:path*" },
    ];
  },
};

export default nextConfig;
