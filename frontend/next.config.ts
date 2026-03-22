import type { NextConfig } from "next";
import path from "node:path";
import { rewriteTargetBackendOrigin } from "./src/lib/backendEnv";

/** Where Express runs; dev → local; production → `NARRIA_BACKEND_URL` (see `src/lib/backendEnv.ts`). */
const backendOrigin = rewriteTargetBackendOrigin();

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
