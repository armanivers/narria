/** Local Express origin when not using a deployed API. Port via `NARRIA_BACKEND_PORT` (default 4000). */
export function defaultLocalBackendOrigin(): string {
  const port = process.env.NARRIA_BACKEND_PORT?.trim() || "4000";
  return `http://127.0.0.1:${port}`;
}

/**
 * When true, ignore `NARRIA_BACKEND_URL` and target local Express (same as before split-deploy).
 * - Unset `NARRIA_ENV`: follows `NODE_ENV` (`next dev` → local, `next build` / `next start` → production rules).
 * - `NARRIA_ENV=development` or `dev`: always local.
 * - `NARRIA_ENV=production` or `prod`: always use external `NARRIA_BACKEND_URL` when resolving SSR / rewrites.
 */
export function narriaUseLocalBackend(): boolean {
  const v = process.env.NARRIA_ENV?.trim().toLowerCase();
  if (v === "development" || v === "dev") return true;
  if (v === "production" || v === "prod") return false;
  return process.env.NODE_ENV === "development";
}

/** Origin for `next.config` rewrites: local in development, `NARRIA_BACKEND_URL` in production. */
export function rewriteTargetBackendOrigin(): string {
  if (narriaUseLocalBackend()) return defaultLocalBackendOrigin().replace(/\/$/, "");
  const url = process.env.NARRIA_BACKEND_URL?.trim();
  return (url || defaultLocalBackendOrigin()).replace(/\/$/, "");
}
