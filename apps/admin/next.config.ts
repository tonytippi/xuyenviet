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
};
export default nextConfig;
