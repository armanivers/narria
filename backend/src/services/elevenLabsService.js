/**
 * ElevenLabs Text-to-Speech (REST).
 * @see https://elevenlabs.io/docs/api-reference/text-to-speech/convert
 */

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

module.exports = {
  synthesizeSpeechToMp3Buffer,
  applyNameTemplate
};
