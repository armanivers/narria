/**
 * ElevenLabs Text-to-Speech (REST).
 * @see https://elevenlabs.io/docs/api-reference/text-to-speech/convert
 */

const fs = require("node:fs");
const path = require("node:path");
const { writeCustomFrontSubtitlesJson } = require("./customFrontSubtitles");

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
 * Placeholder: {name} (case-insensitive).
 * @param {string} template
 * @param {string} name
 */
function applyNameTemplate(template, name) {
  const trimmed = String(name || "").trim();
  return String(template || "").replace(/\{name\}/gi, trimmed);
}

/** Safe folder segment for per-user voice assets */
function sanitizeUserVoiceFolderId(parentId) {
  const s = String(parentId || "")
    .replaceAll(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 80);
  return s || "guest";
}

/**
 * Line spoken for the book front / intro (kid name interpolated).
 * Override with ELEVENLABS_CUSTOM_FRONT_TEMPLATE (use {name}).
 * @param {string} childName
 */
function buildCustomFrontLine(childName) {
  const name = String(childName || "").trim();
  const who = name || "friend";
  const envTemplate = process.env.ELEVENLABS_CUSTOM_FRONT_TEMPLATE?.trim();
  if (envTemplate) {
    return applyNameTemplate(envTemplate, who);
  }
  return `Hello, ${who}. Welcome to the world of dragons. Uh, buckle down for the journey`;
}

/**
 * Two ElevenLabs calls per user (both use the stored child name only — not parent account name):
 * - custom_name: spoken text is exactly the child's name (e.g. "Ari")
 * - custom_front: full welcome line (see buildCustomFrontLine)
 * After each successful response, the MP3 is written to disk immediately; custom_front.json is
 * generated right after custom_front.mp3 is saved (same process step, no other work in between).
 *
 * @param {{ apiKey: string; voiceId: string; childName: string; userVoiceDir: string; modelId?: string }} params
 * @returns {Promise<{ customNamePath: string; customFrontPath: string; subtitlesPath: string; texts: { custom_name: string; custom_front: string } }>}
 */
async function synthesizeAndSaveUserVoiceClips({
  apiKey,
  voiceId,
  childName,
  userVoiceDir,
  modelId
}) {
  const trimmed = String(childName || "").trim();
  if (!trimmed) {
    throw new Error("childName is required for personalized voice clips");
  }

  const textCustomName = trimmed;
  const textCustomFront = buildCustomFrontLine(trimmed);

  const dir = path.resolve(userVoiceDir);
  fs.mkdirSync(dir, { recursive: true });
  const customNamePath = path.join(dir, "custom_name.mp3");
  const customFrontPath = path.join(dir, "custom_front.mp3");

  const bufferName = await synthesizeSpeechToMp3Buffer({
    apiKey,
    voiceId,
    text: textCustomName,
    modelId
  });
  fs.writeFileSync(customNamePath, bufferName);

  const bufferFront = await synthesizeSpeechToMp3Buffer({
    apiKey,
    voiceId,
    text: textCustomFront,
    modelId
  });
  fs.writeFileSync(customFrontPath, bufferFront);

  let subtitlesPath = path.join(dir, "custom_front.json");
  try {
    const sub = await writeCustomFrontSubtitlesJson({
      customFrontMp3Path: customFrontPath,
      childName: trimmed,
      spokenText: textCustomFront
    });
    subtitlesPath = sub.outPath;
  } catch (subErr) {
    console.error("[elevenlabs] custom_front subtitles FAILED (same folder as MP3):", subErr?.stack || subErr?.message || subErr);
  }

  return {
    customNamePath,
    customFrontPath,
    subtitlesPath,
    texts: {
      custom_name: textCustomName,
      custom_front: textCustomFront
    }
  };
}

module.exports = {
  synthesizeSpeechToMp3Buffer,
  applyNameTemplate,
  buildCustomFrontLine,
  sanitizeUserVoiceFolderId,
  synthesizeAndSaveUserVoiceClips
};
