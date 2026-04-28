import type { NextConfig } from "next";

const basePath = process.env.NEXT_BASE_PATH || "";

const nextConfig: NextConfig = {
  output: "standalone",
  basePath: basePath || undefined,
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Allow the app to run behind a proxy (e.g., domain.com/app)
  assetPrefix: basePath || undefined,
  env: {
    NEXT_BASE_PATH: basePath,
  },
  async rewrites() {
    if (!basePath) return [];
    return [
      {
        source: "/callback/:path*",
        destination: "/api/auth/callback/:path*",
      },
    ];
  },
};

export default nextConfig;
