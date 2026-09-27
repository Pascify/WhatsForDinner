import type { NextConfig } from "next";

const BASE_PATH = "/projects/whatsfordinner";

// The portfolio domain that rewrites into this zone. Browsers send it as the Origin.
const PORTFOLIO_HOST = "hammad.vercel.app";

const nextConfig: NextConfig = {
  // Served through the portfolio zone at hammad.vercel.app/projects/whatsfordinner
  basePath: BASE_PATH,

  experimental: {
    serverActions: {
      // Server actions reject an Origin that differs from Host, which every form posted
      // through the multi-zone rewrite does.
      allowedOrigins: [PORTFOLIO_HOST],
    },
  },

  async redirects() {
    return [
      // On its own vercel.app domain the root is outside the base path and would 404.
      { source: "/", destination: BASE_PATH, permanent: false, basePath: false },
    ];
  },
};

export default nextConfig;
