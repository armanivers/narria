/**
 * ElevenLabs Text-to-Speech (REST).
 * @see https://elevenlabs.io/docs/api-reference/text-to-speech/convert
 */

const fs = require("node:fs");
const path = require("node:path");

/**
 * @param {{ apiKey: string; voiceId: string; text: string; modelId?: string }} params
 * @returns {Promise<Buffer>}
 */
async function synthesizeSpeechToMp3Buffer({
  apiKey,
  voiceId,
  text,
  modelId
}) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg"
    },
    body: JSON.stringify({
      text,
      model_id: modelId || "eleven_multilingual_v2"
    })
  });

  if (!res.ok) {
    let detail = await res.text();
    try {
      const j = JSON.parse(detail);
      detail = j.detail?.message || j.detail || JSON.stringify(j);
    } catch {
      /* keep text */
    }
    throw new Error(`ElevenLabs HTTP ${res.status}: ${detail}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

/**
 * Build spoken line from template. Placeholder: {name} (case-insensitive).
 * @param {string} template
 * @param {string} name
 */
function applyNameTemplate(template, name) {
  const trimmed = String(name || "").trim();
  return String(template || "").replace(/\{name\}/gi, trimmed);
}

/** Safe basename segment for welcome MP3 in data/ */
function sanitizeWelcomeFileBase(parentId) {
  const s = String(parentId || "")
    .replaceAll(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 80);
  return s || "guest";
}

/**
 * Spoken line after cartoon avatar is ready (kid name from profile).
 * @param {string} childName
 */
function buildKidWelcomeLine(childName) {
  const name = String(childName || "").trim();
  const who = name || "friend";
  return `Hello ${who}, welcome to the crazy world`;
}

/**
 * Generate MP3 via ElevenLabs and write under backend/data (e.g. welcome_parent-admin.mp3).
 * @param {{ apiKey: string; voiceId: string; childName: string; parentId: string; dataDir: string; modelId?: string }} params
 * @returns {Promise<{ fileName: string; filePath: string; text: string }>}
 */
async function synthesizeAndSaveKidWelcomeToDataDir({
  apiKey,
  voiceId,
  childName,
  parentId,
  dataDir,
  modelId
}) {
  const text = buildKidWelcomeLine(childName);
  const buffer = await synthesizeSpeechToMp3Buffer({
    apiKey,
    voiceId,
    text,
    modelId
  });
  const base = sanitizeWelcomeFileBase(parentId);
  const fileName = `welcome_${base}.mp3`;
  const dir = path.resolve(dataDir);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, buffer);
  return { fileName, filePath, text };
}

module.exports = {
  synthesizeSpeechToMp3Buffer,
  applyNameTemplate,
  buildKidWelcomeLine,
  synthesizeAndSaveKidWelcomeToDataDir
};
