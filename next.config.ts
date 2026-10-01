import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Queue drivers use Node.js runtime loading, including optional adapters.
  serverExternalPackages: ["bullmq", "ioredis"],
};

export default nextConfig;
