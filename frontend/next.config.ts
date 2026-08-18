import type { NextConfig } from "next";
import { getBackendUrl } from "./src/lib/api-config";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    const backendUrl = getBackendUrl();
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
