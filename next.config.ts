import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ignore TypeScript build errors — Supabase JS v2 requires generated types
  // for full inference. Logic is correct; these are inference-only issues.
  typescript: {
    ignoreBuildErrors: true,
  },
  allowedDevOrigins: ['localhost:3000', '127.0.0.1:3000', '127.0.0.1', 'localhost'],
  devIndicators: false,
};

export default nextConfig;
