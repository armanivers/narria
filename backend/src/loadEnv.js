const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");

/**
 * Load `.env` from common locations so GEMINI_API_KEY works whether you run
 * `node src/server.js` from `backend/` or start from the monorepo root.
 */
function loadBackendEnvironment() {
  const backendDir = path.join(__dirname, "..");
  const repoRoot = path.join(backendDir, "..");
  const seen = new Set();

  /** @param {string} envPath */
  function loadIfPresent(envPath) {
    const abs = path.resolve(envPath);
    if (!fs.existsSync(abs) || seen.has(abs)) return;
    seen.add(abs);
    dotenv.config({ path: abs });
    console.log("[env] loaded", abs);
  }

  loadIfPresent(path.join(repoRoot, ".env"));
  loadIfPresent(path.join(process.cwd(), ".env"));
  loadIfPresent(path.join(process.cwd(), "backend", ".env"));

  const backendEnv = path.join(backendDir, ".env");
  const backendAbs = path.resolve(backendEnv);
  if (fs.existsSync(backendAbs)) {
    dotenv.config({ path: backendAbs, override: true });
    console.log("[env] loaded backend .env (overrides same keys from earlier files)", backendAbs);
  }
}

/** @param {string | undefined} raw */
function cleanEnvString(raw) {
  if (raw == null || raw === "") return "";
  return String(raw)
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/^["']|["']$/g, "");
}

/** @returns {string} */
function getGeminiApiKey() {
  return cleanEnvString(process.env.GEMINI_API_KEY);
}

/** @returns {string} */
function getElevenLabsApiKey() {
  return cleanEnvString(process.env.ELEVENLABS_API_KEY);
}

/** @returns {string} */
function getElevenLabsVoiceId() {
  return cleanEnvString(process.env.ELEVENLABS_VOICE_ID);
}

module.exports = {
  loadBackendEnvironment,
  getGeminiApiKey,
  getElevenLabsApiKey,
  getElevenLabsVoiceId
};
