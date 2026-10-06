import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Queue drivers use Node.js runtime loading, including optional adapters.
  serverExternalPackages: ["bullmq", "ioredis"],
  async headers() {
    return [
      { source: "/:path*", headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
      ] },
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
      { source: "/projects/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
      { source: "/movies", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
    ];
  },
};

export default nextConfig;
