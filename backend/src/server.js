const {
  loadBackendEnvironment,
  getGeminiApiKey,
  getElevenLabsApiKey,
  getElevenLabsVoiceId
} = require("./loadEnv");
loadBackendEnvironment();

const express = require("express");
const cors = require("cors");
const fs = require("node:fs");
const path = require("node:path");
const { getStoryPageImage } = require("./services/imageService");
const {
  generateAndSaveCartoonAvatar,
  clearCartoonVariants
} = require("./services/cartoonAvatarService");
const {
  synthesizeSpeechToMp3Buffer,
  applyNameTemplate
} = require("./services/elevenLabsService");

const app = express();
const PORT = process.env.PORT || 4000;
const ASSETS_ROOT = path.join(__dirname, "..", "public", "assets");
const PROFILE_ASSETS_DIR = path.join(ASSETS_ROOT, "profiles");
const PERSONALIZED_AUDIO_DIR = path.join(ASSETS_ROOT, "audio", "personalized");

app.use(cors());
app.use(express.json({ limit: "15mb" }));
app.use("/assets", express.static(path.join(__dirname, "..", "public", "assets")));
fs.mkdirSync(PROFILE_ASSETS_DIR, { recursive: true });
fs.mkdirSync(PERSONALIZED_AUDIO_DIR, { recursive: true });

const dataPath = (...parts) => path.join(__dirname, "..", "data", ...parts);

function readJson(fileName) {
  const file = dataPath(fileName);
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function writeJson(fileName, value) {
  const file = dataPath(fileName);
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function fileExists(relativeAssetPath) {
  const fullPath = path.join(ASSETS_ROOT, relativeAssetPath);
  return fs.existsSync(fullPath);
}

function resolveCoverAudioSrc(bookId, side, rawSrc) {
  if (rawSrc) {
    if (rawSrc.startsWith("/")) return rawSrc;
    return `/assets/audio/covers/${bookId}/${rawSrc}`;
  }

  const fallbackNames = [
    `${side}.mp3`,
    `${side}.wav`,
    `${side}.ogg`,
    `${side}.m4a`
  ];
  const foundName = fallbackNames.find((name) =>
    fileExists(path.join("audio", "covers", bookId, name))
  );
  return foundName ? `/assets/audio/covers/${bookId}/${foundName}` : "";
}

/**
 * Resolve one track: `{ src, startDelayMs }`, or a string filename (e.g. `"part1.mp3"`).
 */
function resolveSinglePageAudioTrack(bookId, item) {
  if (item == null) return null;
  if (typeof item === "string") {
    const src = item.trim();
    if (!src) return null;
    if (src.startsWith("/")) return { src, startDelayMs: 0 };
    return { src: `/assets/audio/pages/${bookId}/${src}`, startDelayMs: 0 };
  }
  if (typeof item !== "object") return null;
  if (!item.src) {
    return { ...item, src: "" };
  }
  if (item.src.startsWith("/")) return item;
  return {
    ...item,
    src: `/assets/audio/pages/${bookId}/${item.src}`
  };
}

/**
 * Page audio: single object or ordered array. Empty / missing src entries are dropped.
 * API always returns an array (may be empty).
 */
function resolvePageAudios(bookId, audio) {
  if (audio == null) return [];
  const list = Array.isArray(audio) ? audio : [audio];
  return list
    .map((item) => resolveSinglePageAudioTrack(bookId, item))
    .filter((item) => item && String(item.src || "").length > 0);
}

function resolvePageImage(bookId, imageFileName, book, pageNumber) {
  if (!imageFileName) {
    return getStoryPageImage({ book, pageNumber });
  }
  const imageUrl = imageFileName.startsWith("/")
    ? imageFileName
    : `/assets/images/${bookId}/${imageFileName}`;
  return { kind: "url", image: imageUrl };
}

function resolveChoiceOutcomes(bookId, choiceOutcomes, book, pageNumber) {
  if (!choiceOutcomes || typeof choiceOutcomes !== "object") return null;
  const entries = Object.entries(choiceOutcomes).map(([option, outcome]) => {
    const safeOutcome = outcome || {};
    return [
      option,
      {
        image: resolvePageImage(bookId, safeOutcome.image || "", book, pageNumber),
        audio: resolvePageAudios(bookId, safeOutcome.audio ?? null)
      }
    ];
  });
  return Object.fromEntries(entries);
}

function resolveCoverAudio(bookId, coverAudio) {
  const safeCover = coverAudio || {
    front: { src: "", startDelayMs: 800 },
    back: { src: "", startDelayMs: 800 }
  };
  const safeFront = safeCover.front || null;
  const safeBack = safeCover.back || null;
  return {
    front: {
      ...(safeFront || undefined),
      src: resolveCoverAudioSrc(bookId, "front", safeFront?.src || "")
    },
    back: {
      ...(safeBack || undefined),
      src: resolveCoverAudioSrc(bookId, "back", safeBack?.src || "")
    }
  };
}

function normalizeBook(rawBook) {
  const pages = Array.isArray(rawBook.pages) ? rawBook.pages : [];
  return {
    id: rawBook.id,
    name: rawBook.name,
    coverAudio: rawBook.coverAudio || {
      front: { src: "", startDelayMs: 800 },
      back: { src: "", startDelayMs: 800 }
    },
    totalPages: pages.length,
    pages
  };
}

function sanitizeProfileId(id) {
  return String(id || "").replaceAll(/[^a-zA-Z0-9_-]/g, "");
}

/** Stable filename for saved welcome MP3: prefer parent id, else slug from name. */
function welcomeAudioFileBase(parentId, name) {
  const fromParent = sanitizeProfileId(parentId);
  if (fromParent) {
    return `welcome_${fromParent}`;
  }
  const fromName = String(name || "")
    .trim()
    .replaceAll(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 40);
  return `welcome_${fromName || "guest"}`;
}

const PROFILE_IMAGE_MIME = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp"
};

function findProfilePhotoVariants(parentId, basenameSuffix = "") {
  const candidates = ["png", "jpg", "jpeg", "webp"];
  const base = `${parentId}${basenameSuffix}`;
  const foundExt = candidates.find((ext) =>
    fs.existsSync(path.join(PROFILE_ASSETS_DIR, `${base}.${ext}`))
  );
  return foundExt ? { ext: foundExt, url: `/assets/profiles/${base}.${foundExt}` } : null;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  const users = readJson("users.json");
  const match = users.find(
    (user) => user.username === username && user.password === password
  );

  if (!match) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  return res.json({
    token: `fake-jwt-${match.id}`,
    parent: {
      id: match.id,
      username: match.username
    }
  });
});

app.post("/auth/register", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  const users = readJson("users.json");
  const existing = users.find((user) => user.username === username);
  if (existing) {
    return res.status(409).json({ error: "Username already exists" });
  }

  const newUser = {
    id: `parent-${Date.now()}`,
    username,
    password
  };
  users.push(newUser);
  writeJson("users.json", users);

  return res.status(201).json({
    token: `fake-jwt-${newUser.id}`,
    parent: {
      id: newUser.id,
      username: newUser.username
    }
  });
});

app.get("/profile/child/:parentId", (req, res) => {
  const { parentId } = req.params;
  const children = readJson("children.json");
  const child = children.find((item) => item.parentId === parentId);
  res.json({ child: child || null });
});

app.post("/profile/child", (req, res) => {
  const { parentId, childName, age } = req.body || {};
  if (!parentId || !childName) {
    return res.status(400).json({ error: "parentId and childName are required" });
  }

  const children = readJson("children.json");
  const existingIndex = children.findIndex((item) => item.parentId === parentId);
  const child = {
    id: `child-${Date.now()}`,
    parentId,
    childName,
    age: age || null
  };

  if (existingIndex >= 0) {
    children[existingIndex] = child;
  } else {
    children.push(child);
  }
  writeJson("children.json", children);

  return res.status(201).json({ child });
});

app.get("/profile/photo/:parentId", (req, res) => {
  const parentId = sanitizeProfileId(req.params.parentId);
  if (!parentId) {
    return res.status(400).json({ error: "Invalid parentId" });
  }

  const original = findProfilePhotoVariants(parentId, "");
  const cartoon = findProfilePhotoVariants(parentId, "_cartoon");

  return res.json({
    photoUrl: original?.url ?? null,
    cartoonPhotoUrl: cartoon?.url ?? null
  });
});

/**
 * Generate personalized welcome audio via ElevenLabs TTS.
 * Body: { name: string (required), parentId?: string }
 * Saves MP3 under /assets/audio/personalized/welcome_<parentId|slug>.mp3
 */
app.post("/audio/elevenlabs/welcome", async (req, res) => {
  const apiKey = getElevenLabsApiKey();
  const voiceId = getElevenLabsVoiceId();
  const { name, parentId } = req.body || {};
  const displayName = String(name || "").trim();

  if (!displayName) {
    return res.status(400).json({ error: "name is required (child or listener name for the greeting)" });
  }
  if (!apiKey) {
    return res.status(503).json({
      error: "ELEVENLABS_API_KEY is not configured. Add it to backend/.env (see .env.example)."
    });
  }
  if (!voiceId) {
    return res.status(503).json({
      error:
        "ELEVENLABS_VOICE_ID is not configured. Copy a voice id from ElevenLabs (Voices page or API)."
    });
  }

  const template =
    process.env.ELEVENLABS_WELCOME_TEMPLATE?.trim() ||
    "Hey {name}, welcome to Narria! We are so glad you are here.";
  const spokenText = applyNameTemplate(template, displayName);
  const modelId = process.env.ELEVENLABS_MODEL_ID?.trim() || undefined;

  try {
    console.log("[elevenlabs] welcome TTS request", {
      fileBase: welcomeAudioFileBase(parentId, displayName),
      textPreview: `${spokenText.slice(0, 80)}${spokenText.length > 80 ? "…" : ""}`
    });
    const buffer = await synthesizeSpeechToMp3Buffer({
      apiKey,
      voiceId,
      text: spokenText,
      modelId
    });
    const base = welcomeAudioFileBase(parentId, displayName);
    const fileName = `${base}.mp3`;
    const targetPath = path.join(PERSONALIZED_AUDIO_DIR, fileName);
    fs.writeFileSync(targetPath, buffer);
    const audioUrl = `/assets/audio/personalized/${fileName}`;
    console.log("[elevenlabs] welcome TTS done", { audioUrl, bytes: buffer.length });
    return res.status(201).json({
      audioUrl,
      fileName,
      text: spokenText
    });
  } catch (err) {
    console.error("[elevenlabs] welcome TTS failed:", err?.message || err);
    return res.status(502).json({
      error: err?.message || "ElevenLabs request failed"
    });
  }
});

app.post("/profile/photo", (req, res) => {
  const { parentId, imageDataUrl } = req.body || {};
  const safeParentId = sanitizeProfileId(parentId);
  if (!safeParentId || !imageDataUrl) {
    return res.status(400).json({ error: "parentId and imageDataUrl are required" });
  }

  const match = /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/.exec(String(imageDataUrl));
  if (!match) {
    return res.status(400).json({ error: "Invalid image format" });
  }

  const ext = match[1] === "jpeg" ? "jpg" : match[1];
  const buffer = Buffer.from(match[2], "base64");
  const targetPath = path.join(PROFILE_ASSETS_DIR, `${safeParentId}.${ext}`);

  clearCartoonVariants(PROFILE_ASSETS_DIR, safeParentId);

  ["png", "jpg", "jpeg", "webp"]
    .filter((candidate) => candidate !== ext)
    .forEach((candidate) => {
      const oldPath = path.join(PROFILE_ASSETS_DIR, `${safeParentId}.${candidate}`);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    });

  fs.writeFileSync(targetPath, buffer);

  const mimeType = PROFILE_IMAGE_MIME[ext] || "image/jpeg";
  // Use bytes from disk so Gemini always gets exactly what was saved (avoids any base64 edge cases).
  const imageBase64ForGemini = fs.readFileSync(targetPath).toString("base64");
  const geminiKey = getGeminiApiKey();
  const cartoonEnabled = Boolean(geminiKey);

  if (cartoonEnabled) {
    console.log("[profile photo] scheduling Gemini cartoon for", safeParentId);
    void generateAndSaveCartoonAvatar({
      profilesDir: PROFILE_ASSETS_DIR,
      safeParentId,
      imageBase64: imageBase64ForGemini,
      mimeType
    }).catch((err) => {
      console.error("[profile photo] cartoon task rejected:", err?.message || err);
    });
  } else {
    console.log(
      "[profile photo] Gemini cartoon skipped — set GEMINI_API_KEY in backend/.env or repo-root .env (see backend/.env.example)"
    );
  }

  return res.status(201).json({
    photoUrl: `/assets/profiles/${safeParentId}.${ext}`,
    cartoonPending: cartoonEnabled,
    cartoonPhotoUrl: null
  });
});

app.get("/books", (_req, res) => {
  const books = readJson("books.json").map(normalizeBook).map((book) => ({
    id: book.id,
    name: book.name,
    pages: book.totalPages
  }));
  res.json({ books });
});

app.get("/books/:bookId", (req, res) => {
  const books = readJson("books.json").map(normalizeBook);
  const book = books.find((item) => item.id === req.params.bookId);
  if (!book) {
    return res.status(404).json({ error: "Book not found" });
  }
  return res.json({
    book: {
      id: book.id,
      name: book.name,
      pages: book.totalPages,
      coverAudio: resolveCoverAudio(book.id, book.coverAudio),
      pageConfigs: book.pages.map((page) => ({
        ...page,
        image: resolvePageImage(book.id, page.image || "", book, page.pageNumber),
        audio: resolvePageAudios(book.id, page.audio),
        choiceOutcomes: resolveChoiceOutcomes(book.id, page.choiceOutcomes, book, page.pageNumber)
      }))
    }
  });
});

app.get("/books/:bookId/pages/:pageNumber", (req, res) => {
  const books = readJson("books.json").map(normalizeBook);
  const book = books.find((item) => item.id === req.params.bookId);
  const pageNumber = Number(req.params.pageNumber);

  if (!book) {
    return res.status(404).json({ error: "Book not found" });
  }
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > book.totalPages) {
    return res.status(400).json({ error: "Page out of range" });
  }

  const pageConfig = book.pages.find((page) => page.pageNumber === pageNumber);
  if (!pageConfig) {
    return res.status(404).json({ error: "Page config not found" });
  }

  const imagePayload = resolvePageImage(book.id, pageConfig.image || "", book, pageNumber);
  return res.json({
    bookId: book.id,
    bookName: book.name,
    pageNumber,
    totalPages: book.totalPages,
    image: imagePayload,
    audio: resolvePageAudios(book.id, pageConfig.audio),
    choiceOutcomes: resolveChoiceOutcomes(book.id, pageConfig.choiceOutcomes, book, pageNumber),
    hasDialogChoice: Boolean(pageConfig.hasDialogChoice),
    dialog: pageConfig.dialog || null
  });
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  console.log(
    `[env] Gemini cartoon: ${getGeminiApiKey() ? "enabled (GEMINI_API_KEY loaded)" : "disabled — add GEMINI_API_KEY to .env"}`
  );
  const elevenReady = Boolean(getElevenLabsApiKey() && getElevenLabsVoiceId());
  console.log(
    `[env] ElevenLabs welcome TTS: ${elevenReady ? "configured (POST /audio/elevenlabs/welcome)" : "disabled — set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID"}`
  );
});
