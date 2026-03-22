import type { NextConfig } from "next";
import path from "node:path";
import { rewriteTargetBackendOrigin } from "./src/lib/backendEnv";

/** Monorepo root — matches Vercel `outputFileTracingRoot` and silences turbopack/root mismatch warnings. */
const workspaceRoot = path.join(__dirname, "..");

/** Where Express runs; dev → local; production → `NARRIA_BACKEND_URL` (see `src/lib/backendEnv.ts`). */
const backendOrigin = rewriteTargetBackendOrigin();

const nextConfig: NextConfig = {
  turbopack: {
    root: workspaceRoot
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
