import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  distDir: process.env.SHIPPING_BUDDY_DIST_DIR || ".next",
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
