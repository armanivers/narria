const fs = require("node:fs");
const path = require("node:path");
const { getGeminiApiKey, getElevenLabsApiKey, getElevenLabsVoiceId } = require("../loadEnv");
const { synthesizeAndSaveUserVoiceClips } = require("./elevenLabsService");

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

/** Avoid echoing API keys that Google/ElevenLabs sometimes embed in error strings. */
function redactSecrets(text) {
  if (text == null) return "";
  return String(text)
    .replace(/\bAIzaSy[A-Za-z0-9_-]{10,}\b/g, "AIzaSy…[redacted]")
    .replace(/\bsk_[A-Za-z0-9]{20,}\b/g, "sk_…[redacted]");
}

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
    const rawMsg = data?.error?.message || JSON.stringify(data) || res.statusText;
    const msg = redactSecrets(rawMsg);
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
 * After a selfie is saved, generate cartoon variant as `<parentId>_cartoon.<ext>` when Gemini succeeds.
 * ElevenLabs (custom_name + custom_front) runs whenever the child's name + keys + userVoiceDir exist,
 * even if Gemini fails, returns no image, or throws. `childName` must be the kid's name from users/children (not parent display name).
 * @param {{ profilesDir: string, safeParentId: string, imageBase64: string, mimeType: string, childName?: string | null, userVoiceDir?: string | null }} params
 */
async function generateAndSaveCartoonAvatar({
  profilesDir,
  safeParentId,
  imageBase64,
  mimeType,
  childName = null,
  userVoiceDir = null
}) {
  try {
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
      } else {
        clearCartoonVariants(profilesDir, safeParentId);
        const ext = mimeToFileExt(generated.mimeType);
        const targetPath = path.join(profilesDir, `${safeParentId}_cartoon.${ext}`);
        fs.writeFileSync(targetPath, generated.buffer);
        console.log("[gemini cartoon] job END (success)", {
          parentId: safeParentId,
          totalMs: Date.now() - jobStarted,
          savedAs: path.basename(targetPath)
        });
      }
    } catch (err) {
      const errText = redactSecrets(err?.message || String(err));
      console.error("[gemini cartoon] job END (error)", {
        parentId: safeParentId,
        totalMs: Date.now() - jobStarted,
        error: errText
      });
      const hint = String(errText).toLowerCase();
      if (
        hint.includes("suspended") ||
        hint.includes("permission denied") ||
        hint.includes("403") ||
        hint.includes("api key not valid")
      ) {
        console.warn(
          "[gemini cartoon] Fix: your GEMINI_API_KEY is rejected or the Google project consumer is suspended. " +
            "Create a new key at https://aistudio.google.com/app/apikey (or Cloud Console) and update backend/.env. " +
            "Cartoon avatars are optional — ElevenLabs clips and custom_front.json still generate without Gemini."
        );
      }
    }

    const trimmedName = childName != null ? String(childName).trim() : "";
    const apiKey = getElevenLabsApiKey();
    const voiceId = getElevenLabsVoiceId();
    const modelId = process.env.ELEVENLABS_MODEL_ID?.trim() || undefined;

    console.log("[elevenlabs] post-upload check", {
      parentId: safeParentId,
      hasChildName: Boolean(trimmedName),
      hasApiKey: Boolean(apiKey),
      hasVoiceId: Boolean(voiceId),
      hasUserVoiceDir: Boolean(userVoiceDir)
    });

    if (!trimmedName) {
      console.log(
        "[elevenlabs] user voice clips skipped (no child name saved yet — save child name with profile/selfie flow first)"
      );
    } else if (!apiKey || !voiceId) {
      console.log(
        "[elevenlabs] user voice clips skipped — set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID"
      );
    } else if (!userVoiceDir) {
      console.warn("[elevenlabs] user voice clips skipped (userVoiceDir not set)");
    } else {
      try {
        const saved = await synthesizeAndSaveUserVoiceClips({
          apiKey,
          voiceId,
          childName: trimmedName,
          userVoiceDir,
          modelId
        });
        const subPath = saved.subtitlesPath;
        const subOk = subPath && fs.existsSync(subPath);
        console.log("[elevenlabs] user voice clips saved", {
          parentId: safeParentId,
          dir: path.resolve(userVoiceDir),
          custom_front_subtitles_path: subPath,
          custom_front_json_on_disk: subOk,
          custom_name: saved.texts.custom_name,
          custom_front_preview: `${saved.texts.custom_front.slice(0, 72)}${saved.texts.custom_front.length > 72 ? "…" : ""}`
        });
        if (!subOk) {
          console.warn(
            "[elevenlabs] custom_front.json missing after save — check logs for [custom_front subtitles] or [elevenlabs] custom_front subtitles FAILED"
          );
        }
      } catch (voiceErr) {
        console.error("[elevenlabs] user voice clips failed:", {
          parentId: safeParentId,
          error: redactSecrets(voiceErr?.message || String(voiceErr))
        });
      }
    }
  } catch (unexpected) {
    console.error("[post-upload] unexpected error (should not reject promise):", {
      parentId: safeParentId,
      error: redactSecrets(unexpected?.message || String(unexpected))
    });
  }
}

module.exports = {
  generateCartoonFromPhotoBase64,
  generateAndSaveCartoonAvatar,
  clearCartoonVariants,
  mimeToFileExt
};
