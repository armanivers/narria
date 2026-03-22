const fs = require("node:fs");
const path = require("node:path");

const NOTICES_PATH = path.join(__dirname, "..", "..", "data", "integration-notices.json");

/** @typedef {"gemini" | "elevenlabs" | "n8n"} IntegrationService */

function readStore() {
  try {
    const raw = fs.readFileSync(NOTICES_PATH, "utf8");
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

function writeStore(obj) {
  const dir = path.dirname(NOTICES_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(NOTICES_PATH, JSON.stringify(obj, null, 2), "utf8");
}

/**
 * Remember a one-shot UI notice for a parent (async jobs, n8n webhook failures).
 * @param {string} parentId
 * @param {IntegrationService} service
 * @param {string} message
 */
function recordIntegrationNotice(parentId, service, message) {
  const id = String(parentId || "").trim();
  if (!id || !service) return;
  let text = String(message || "").trim();
  if (text.length > 220) text = `${text.slice(0, 217)}…`;
  const store = readStore();
  store[id] = { service, message: text || `${service} request failed`, ts: Date.now() };
  writeStore(store);
}

/**
 * Pop notice for parent (at most one). Used by GET /profile/photo/:id.
 * @param {string} parentId
 * @returns {{ service: IntegrationService, message: string } | null}
 */
function takeIntegrationNotice(parentId) {
  const id = String(parentId || "").trim();
  if (!id) return null;
  const store = readStore();
  const row = store[id];
  if (!row || !row.service) return null;
  delete store[id];
  writeStore(store);
  return {
    service: row.service,
    message: String(row.message || "").trim() || `${row.service} request failed`
  };
}

module.exports = {
  recordIntegrationNotice,
  takeIntegrationNotice
};
