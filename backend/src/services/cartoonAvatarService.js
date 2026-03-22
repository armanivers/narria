const fs = require("node:fs");
const path = require("node:path");
const { getGeminiApiKey, getElevenLabsApiKey, getElevenLabsVoiceId } = require("../loadEnv");
const { synthesizeAndSaveKidWelcomeToDataDir } = require("./elevenLabsService");

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

/** @param {string} mime */
function mimeToFileExt(mime) {
  if (!mime) return "png";
  const m = mime.toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("webp")) return "webp";
  return "png";
}

/**
 * Remove any existing cartoon asset for this profile (all supported extensions).
 * @param {string} profilesDir
 * @param {string} safeParentId
 */
function clearCartoonVariants(profilesDir, safeParentId) {
  const base = `${safeParentId}_cartoon`;
  for (const ext of ["png", "jpg", "jpeg", "webp"]) {
    const filePath = path.join(profilesDir, `${base}.${ext}`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

/**
 * Call Gemini image model (Nano Banana family) with the selfie + prompt; return generated image bytes.
 * @param {{ base64: string, mimeType: string }} params
 * @returns {Promise<{ buffer: Buffer, mimeType: string } | null>}
 */
async function generateCartoonFromPhotoBase64({ base64, mimeType }) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    console.log("[gemini] generateContent skipped (GEMINI_API_KEY empty after load)");
    return null;
  }

  const model =
    process.env.GEMINI_IMAGE_MODEL?.trim() || "gemini-2.5-flash-image";
  const prompt =
    process.env.GEMINI_CARTOON_PROMPT?.trim() ||
    "Make a friendly cartoon version of this kid based on the photo. Keep a clear likeness, cheerful children's book illustration style, soft colors, simple background. Output a single portrait suitable as an avatar.";

  const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const requestStarted = Date.now();
  console.log("[gemini] generateContent request START", { model, mimeType });

  const bodyCamel = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType,
              data: base64
            }
          }
        ]
      }
    ],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"]
    }
  };

  const bodySnake = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64
            }
          }
        ]
      }
    ],
    generation_config: {
      response_modalities: ["TEXT", "IMAGE"]
    }
  };

  /** @param {object} body */
  async function postBody(body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  }

  let { res, data } = await postBody(bodyCamel);
  if (!res.ok && res.status === 400) {
    console.log("[gemini] first payload rejected (400), retrying with snake_case body");
    ({ res, data } = await postBody(bodySnake));
  }

  const httpMs = Date.now() - requestStarted;

  if (!res.ok) {
    const msg = data?.error?.message || JSON.stringify(data) || res.statusText;
    console.error("[gemini] generateContent request FAILED", {
      status: res.status,
      ms: httpMs,
      message: msg
    });
    throw new Error(msg);
  }

  console.log("[gemini] generateContent HTTP done", {
    status: res.status,
    ms: httpMs
  });

  const parts = data.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    const inline = part.inlineData || part.inline_data;
    if (inline?.data) {
      const outMime = inline.mimeType || inline.mime_type || "image/png";
      const buffer = Buffer.from(inline.data, "base64");
      console.log("[gemini] generateContent request DONE (image received)", {
        ms: Date.now() - requestStarted,
        outMime,
        bytes: buffer.length
      });
      return {
        buffer,
        mimeType: outMime
      };
    }
  }

  console.warn("[gemini] generateContent request DONE but no image part in response", {
    ms: Date.now() - requestStarted,
    partsCount: parts.length
  });
  return null;
}

/**
 * After a selfie is saved, generate cartoon variant as `<parentId>_cartoon.<ext>` next to the original.
 * When Gemini succeeds and ElevenLabs + child name are available, writes `welcome_<parentId>.mp3` under dataDir.
 * @param {{ profilesDir: string, safeParentId: string, imageBase64: string, mimeType: string, childDisplayName?: string | null, welcomeAudioDataDir?: string }} params
 */
async function generateAndSaveCartoonAvatar({
  profilesDir,
  safeParentId,
  imageBase64,
  mimeType,
  childDisplayName = null,
  welcomeAudioDataDir = null
}) {
  const jobStarted = Date.now();
  console.log("[gemini cartoon] job START", { parentId: safeParentId });

  try {
    const generated = await generateCartoonFromPhotoBase64({
      base64: imageBase64,
      mimeType
    });
    if (!generated) {
      console.log("[gemini cartoon] job END (no file saved)", {
        parentId: safeParentId,
        totalMs: Date.now() - jobStarted,
        reason: "no image from API or API key missing"
      });
      return;
    }

    clearCartoonVariants(profilesDir, safeParentId);
    const ext = mimeToFileExt(generated.mimeType);
    const targetPath = path.join(profilesDir, `${safeParentId}_cartoon.${ext}`);
    fs.writeFileSync(targetPath, generated.buffer);
    console.log("[gemini cartoon] job END (success)", {
      parentId: safeParentId,
      totalMs: Date.now() - jobStarted,
      savedAs: path.basename(targetPath)
    });

    const trimmedName =
      childDisplayName != null ? String(childDisplayName).trim() : "";
    const apiKey = getElevenLabsApiKey();
    const voiceId = getElevenLabsVoiceId();
    const modelId = process.env.ELEVENLABS_MODEL_ID?.trim() || undefined;

    if (!trimmedName) {
      console.log(
        "[elevenlabs] kid welcome skipped (no child name on account yet; create child profile first)"
      );
    } else if (!apiKey || !voiceId) {
      console.log(
        "[elevenlabs] kid welcome skipped — set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID for data/welcome_*.mp3"
      );
    } else if (!welcomeAudioDataDir) {
      console.warn("[elevenlabs] kid welcome skipped (welcomeAudioDataDir not set)");
    } else {
      try {
        const saved = await synthesizeAndSaveKidWelcomeToDataDir({
          apiKey,
          voiceId,
          childName: trimmedName,
          parentId: safeParentId,
          dataDir: welcomeAudioDataDir,
          modelId
        });
        console.log("[elevenlabs] kid welcome saved to data/", {
          parentId: safeParentId,
          fileName: saved.fileName,
          textPreview: `${saved.text.slice(0, 60)}${saved.text.length > 60 ? "…" : ""}`
        });
      } catch (welcomeErr) {
        console.error("[elevenlabs] kid welcome after cartoon failed:", {
          parentId: safeParentId,
          error: welcomeErr?.message || String(welcomeErr)
        });
      }
    }
  } catch (err) {
    console.error("[gemini cartoon] job END (error)", {
      parentId: safeParentId,
      totalMs: Date.now() - jobStarted,
      error: err?.message || String(err)
    });
    throw err;
  }
}

module.exports = {
  generateCartoonFromPhotoBase64,
  generateAndSaveCartoonAvatar,
  clearCartoonVariants,
  mimeToFileExt
};
