import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@react-pdf/renderer"],
  turbopack: { root: __dirname },
  devIndicators: false,
};

export default nextConfig;
