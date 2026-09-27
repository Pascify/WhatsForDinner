import type { NextConfig } from "next";

const BASE_PATH = "/projects/whatsfordinner";

const nextConfig: NextConfig = {
  // Served through the portfolio zone at hammad.vercel.app/projects/whatsfordinner
  basePath: BASE_PATH,

  async redirects() {
    return [
      // On its own vercel.app domain the root is outside the base path and would 404.
      { source: "/", destination: BASE_PATH, permanent: false, basePath: false },
    ];
  },
};

export default nextConfig;
