import type { NextConfig } from "next";
import path from "node:path";
import { rewriteTargetBackendOrigin } from "./src/lib/backendEnv";

/**
 * Vercel sets `outputFileTracingRoot` to the git root; `turbopack.root` must match there or the build warns.
 * Locally, pointing both at the monorepo parent breaks Turbopack dev (missing `@swc/helpers-…` virtual paths).
 * `VERCEL=1` is set automatically on Vercel deploys.
 */
const appRoot = path.resolve(__dirname);
const workspaceRoot = path.resolve(__dirname, "..");
const isVercel = process.env.VERCEL === "1";
const turbopackRoot = isVercel ? workspaceRoot : appRoot;

/** Where Express runs; dev → local; production → `NARRIA_BACKEND_URL` (see `src/lib/backendEnv.ts`). */
const backendOrigin = rewriteTargetBackendOrigin();

const nextConfig: NextConfig = {
  ...(isVercel ? { outputFileTracingRoot: workspaceRoot } : {}),
  turbopack: {
    root: turbopackRoot
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
