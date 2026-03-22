import type { NextConfig } from "next";
import path from "node:path";

/** Where Express runs; used to proxy `/api/narria/*` → backend (avoids 404 when the browser talks to Next on :3000). */
const backendOrigin = (process.env.NARRIA_BACKEND_URL || "http://127.0.0.1:4000").replace(/\/$/, "");

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname)
  },
  async rewrites() {
    return [
      {
        source: "/api/narria/:path*",
        destination: `${backendOrigin}/:path*`
      }
    ];
  }
};

export default nextConfig;
