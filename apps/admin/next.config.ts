import type { NextConfig } from "next";
import { resolve } from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@xuyenviet/config", "@xuyenviet/contracts"],
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@xuyenviet/config": resolve(process.cwd(), "../../packages/config/src/index.ts"),
      "@xuyenviet/contracts": resolve(process.cwd(), "../../packages/contracts/src/index.ts"),
    };
    return config;
  },
};
export default nextConfig;
