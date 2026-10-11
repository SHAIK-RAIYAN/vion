import type { NextConfig } from "next";

const backendUrl = process.env.BACKEND_URL || "http://localhost:5000";

const nextConfig: NextConfig = {
  reactCompiler: true,
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${backendUrl}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
