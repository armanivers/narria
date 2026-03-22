import type { NextConfig } from "next";
import path from "node:path";
import { rewriteTargetBackendOrigin } from "./src/lib/backendEnv";

/** Monorepo root — must match `turbopack.root` so Vercel does not warn about `outputFileTracingRoot`. */
const workspaceRoot = path.resolve(__dirname, "..");

/** Where Express runs; dev → local; production → `NARRIA_BACKEND_URL` (see `src/lib/backendEnv.ts`). */
const backendOrigin = rewriteTargetBackendOrigin();

const nextConfig: NextConfig = {
  outputFileTracingRoot: workspaceRoot,
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
