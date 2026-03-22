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
  synthesizeAndSaveUserVoiceClips,
  sanitizeUserVoiceFolderId
} = require("./services/elevenLabsService");

const app = express();
const PORT = process.env.PORT || 4000;
const ASSETS_ROOT = path.join(__dirname, "..", "public", "assets");
const PROFILE_ASSETS_DIR = path.join(ASSETS_ROOT, "profiles");
const PERSONALIZED_AUDIO_DIR = path.join(ASSETS_ROOT, "audio", "personalized");
/** Per-user ElevenLabs output: custom_name.mp3, custom_front.mp3 */
const USER_VOICE_DIR = path.join(PERSONALIZED_AUDIO_DIR, "users");

app.use(cors());
app.use(express.json({ limit: "15mb" }));
app.use("/assets", express.static(path.join(__dirname, "..", "public", "assets")));
fs.mkdirSync(PROFILE_ASSETS_DIR, { recursive: true });
fs.mkdirSync(PERSONALIZED_AUDIO_DIR, { recursive: true });
fs.mkdirSync(USER_VOICE_DIR, { recursive: true });

const dataPath = (...parts) => path.join(__dirname, "..", "data", ...parts);

function readJson(fileName) {
  const file = dataPath(fileName);
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function writeJson(fileName, value) {
  const file = dataPath(fileName);
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

/** Child name from users.json / children.json for personalized ElevenLabs clips */
function resolveChildDisplayName(parentId) {
  if (!parentId) return null;
  try {
    const users = readJson("users.json");
    const u = users.find((x) => x.id === parentId);
    const fromUser = u?.childName != null ? String(u.childName).trim() : "";
    if (fromUser) return fromUser;
  } catch {
    /* ignore */
  }
  try {
    const children = readJson("children.json");
    const c = children.find((x) => x.parentId === parentId);
    const n = c?.childName != null ? String(c.childName).trim() : "";
    return n || null;
  } catch {
    return null;
  }
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
 * Resolve one track: `{ src, startDelayMs?, custom? }`, or a string filename.
 * When `custom === true`, `src` is a filename under `/assets/audio/personalized/users/<parentId>/`
 * (requires `parentId` query on GET book / page).
 */
function resolveSinglePageAudioTrack(bookId, item, parentId) {
  const safeParent = sanitizeProfileId(parentId);
  if (item == null) return null;
  if (typeof item === "string") {
    const src = item.trim();
    if (!src) return null;
    if (src.startsWith("/")) return { src, startDelayMs: 0, custom: false };
    return {
      src: `/assets/audio/pages/${bookId}/${src}`,
      startDelayMs: 0,
      custom: false
    };
  }
  if (typeof item !== "object") return null;
  const isCustom = item.custom === true;
  const rawSrc = String(item.src || "").trim();
  if (!rawSrc) {
    return { ...item, src: "", custom: isCustom };
  }
  if (rawSrc.startsWith("/")) {
    return { ...item, src: rawSrc, custom: isCustom };
  }
  if (isCustom) {
    if (!safeParent) {
      return { ...item, src: "", custom: true };
    }
    const fileName = rawSrc.replace(/^\/+/, "");
    if (fileName.includes("..") || fileName.includes("/") || fileName.includes("\\")) {
      return { ...item, src: "", custom: true };
    }
    return {
      ...item,
      src: `/assets/audio/personalized/users/${safeParent}/${fileName}`,
      custom: true
    };
  }
  return {
    ...item,
    src: `/assets/audio/pages/${bookId}/${rawSrc}`,
    custom: false
  };
}

/**
 * Page audio: single object or ordered array. Empty / missing src entries are dropped.
 * API always returns an array (may be empty).
 */
function resolvePageAudios(bookId, audio, parentId) {
  if (audio == null) return [];
  const list = Array.isArray(audio) ? audio : [audio];
  return list
    .map((item) => resolveSinglePageAudioTrack(bookId, item, parentId))
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

function resolveChoiceOutcomes(bookId, choiceOutcomes, book, pageNumber, parentId) {
  if (!choiceOutcomes || typeof choiceOutcomes !== "object") return null;
  const entries = Object.entries(choiceOutcomes).map(([option, outcome]) => {
    const safeOutcome = outcome || {};
    return [
      option,
      {
        image: resolvePageImage(bookId, safeOutcome.image || "", book, pageNumber),
        audio: resolvePageAudios(bookId, safeOutcome.audio ?? null, parentId)
      }
    ];
  });
  return Object.fromEntries(entries);
}

function resolveCoverSideSrc(bookId, side, sideObj, parentId) {
  const safeParent = sanitizeProfileId(parentId);
  const raw = String(sideObj?.src || "").trim();
  const isCustom = sideObj?.custom === true;
  if (isCustom) {
    if (!raw || !safeParent) return "";
    const fileName = raw.replace(/^\/+/, "");
    if (fileName.includes("..") || fileName.includes("/") || fileName.includes("\\")) {
      return "";
    }
    return `/assets/audio/personalized/users/${safeParent}/${fileName}`;
  }
  return resolveCoverAudioSrc(bookId, side, raw);
}

function resolveCoverAudio(bookId, coverAudio, parentId) {
  const safeCover = coverAudio || {
    front: { src: "", startDelayMs: 800 },
    back: { src: "", startDelayMs: 800 }
  };
  const safeFront = safeCover.front || null;
  const safeBack = safeCover.back || null;
  return {
    front: {
      ...(safeFront || undefined),
      custom: safeFront?.custom === true,
      src: resolveCoverSideSrc(bookId, "front", safeFront, parentId)
    },
    back: {
      ...(safeBack || undefined),
      custom: safeBack?.custom === true,
      src: resolveCoverSideSrc(bookId, "back", safeBack, parentId)
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

function normalizeEmail(raw) {
  return String(raw || "").trim().toLowerCase();
}

/** Minimal RFC-style check for hackathon JSON store */
function isValidEmailFormat(s) {
  const t = String(s || "").trim();
  if (!t || t.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

function publicParentFromUser(user, childName, childAge) {
  return {
    id: user.id,
    username: user.username,
    email:
      user.email != null && String(user.email).trim() !== ""
        ? String(user.email).trim()
        : null,
    name:
      user.name != null && String(user.name).trim() !== "" ? String(user.name).trim() : null,
    childName,
    childAge
  };
}

/** Folder under /assets/audio/personalized/users/<id>/ for custom_name.mp3 + custom_front.mp3 */
function userVoiceFolderKey(parentId, displayName) {
  const fromParent = sanitizeUserVoiceFolderId(parentId);
  if (fromParent) return fromParent;
  const fromName = String(displayName || "")
    .trim()
    .replaceAll(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 40);
  return fromName || "guest";
}

function userVoiceClipUrls(folderKey) {
  const base = path.join(USER_VOICE_DIR, folderKey);
  const nameFile = path.join(base, "custom_name.mp3");
  const frontFile = path.join(base, "custom_front.mp3");
  const prefix = `/assets/audio/personalized/users/${folderKey}`;
  return {
    customNameAudioUrl: fs.existsSync(nameFile) ? `${prefix}/custom_name.mp3` : null,
    customFrontAudioUrl: fs.existsSync(frontFile) ? `${prefix}/custom_front.mp3` : null
  };
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
  const identifier = String(username || "").trim();
  const idEmail = normalizeEmail(identifier);
  let users = readJson("users.json");
  const match = users.find((user) => {
    if (user.password !== password) return false;
    const u = String(user.username || "").trim();
    const e = normalizeEmail(user.email);
    return u === identifier || (idEmail && e === idEmail);
  });

  if (!match) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  let childName =
    match.childName != null && String(match.childName).trim() !== ""
      ? String(match.childName).trim()
      : null;

  let childAge =
    match.childAge != null && Number.isFinite(Number(match.childAge))
      ? Number(match.childAge)
      : null;

  if (!childName || childAge == null) {
    const children = readJson("children.json");
    const row = children.find((item) => item.parentId === match.id);
    const idx = users.findIndex((u) => u.id === match.id);
    const patch = {};

    if (!childName && row?.childName) {
      const fromChild = String(row.childName).trim();
      if (fromChild) {
        childName = fromChild;
        patch.childName = fromChild;
      }
    }
    if (childAge == null && row?.age != null && Number.isFinite(Number(row.age))) {
      childAge = Number(row.age);
      patch.childAge = childAge;
    }
    if (idx >= 0 && Object.keys(patch).length > 0) {
      users[idx] = { ...users[idx], ...patch };
      writeJson("users.json", users);
    }
  }

  return res.json({
    token: `fake-jwt-${match.id}`,
    parent: publicParentFromUser(match, childName, childAge)
  });
});

app.post("/auth/register", (req, res) => {
  const { username, password, email, name } = req.body || {};
  const usernameTrim = String(username || "").trim();
  const passwordStr = String(password || "");

  if (!usernameTrim || !passwordStr) {
    return res.status(400).json({ error: "Username and password are required" });
  }
  if (passwordStr.length < 4) {
    return res.status(400).json({ error: "Password must be at least 4 characters" });
  }

  const emailNorm = normalizeEmail(email);
  if (!emailNorm || !isValidEmailFormat(emailNorm)) {
    return res.status(400).json({ error: "A valid email address is required" });
  }

  const displayName = String(name || "").trim() || null;

  const users = readJson("users.json");
  if (users.some((user) => String(user.username || "").trim() === usernameTrim)) {
    return res.status(409).json({ error: "Username already exists" });
  }
  if (users.some((user) => normalizeEmail(user.email) === emailNorm)) {
    return res.status(409).json({ error: "An account with this email already exists" });
  }

  const newUser = {
    id: `parent-${Date.now()}`,
    username: usernameTrim,
    email: emailNorm,
    name: displayName,
    password: passwordStr,
    childName: null,
    childAge: null
  };
  users.push(newUser);
  writeJson("users.json", users);

  return res.status(201).json({
    token: `fake-jwt-${newUser.id}`,
    parent: publicParentFromUser(newUser, null, null)
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
  const trimmedName = String(childName || "").trim();
  if (!parentId || !trimmedName) {
    return res.status(400).json({ error: "parentId and childName are required" });
  }

  const users = readJson("users.json");
  const userIndex = users.findIndex((user) => user.id === parentId);
  if (userIndex < 0) {
    return res.status(404).json({ error: "User account not found" });
  }

  const parsedAge =
    age === undefined || age === null || age === ""
      ? null
      : Number(age);
  const safeAge = Number.isFinite(parsedAge) ? parsedAge : null;

  const children = readJson("children.json");
  const existingIndex = children.findIndex((item) => item.parentId === parentId);
  const child = {
    id: existingIndex >= 0 ? children[existingIndex].id : `child-${Date.now()}`,
    parentId,
    childName: trimmedName,
    age: safeAge
  };

  if (existingIndex >= 0) {
    children[existingIndex] = child;
  } else {
    children.push(child);
  }
  writeJson("children.json", children);

  users[userIndex] = {
    ...users[userIndex],
    childName: trimmedName,
    childAge: safeAge
  };
  writeJson("users.json", users);

  const u = users[userIndex];
  return res.status(201).json({
    child,
    parent: publicParentFromUser(u, trimmedName, safeAge)
  });
});

app.get("/profile/photo/:parentId", (req, res) => {
  const parentId = sanitizeProfileId(req.params.parentId);
  if (!parentId) {
    return res.status(400).json({ error: "Invalid parentId" });
  }

  const original = findProfilePhotoVariants(parentId, "");
  const cartoon = findProfilePhotoVariants(parentId, "_cartoon");
  const voice = userVoiceClipUrls(parentId);

  return res.json({
    photoUrl: original?.url ?? null,
    cartoonPhotoUrl: cartoon?.url ?? null,
    customNameAudioUrl: voice.customNameAudioUrl,
    customFrontAudioUrl: voice.customFrontAudioUrl
  });
});

/**
 * Generate personalized voice clips via ElevenLabs (two API calls).
 * Body: { name: string (required — kid's name, e.g. "Ari"), parentId?: string }
 *
 * Writes:
 * - custom_name.mp3 — spoken text is exactly `name`
 * - custom_front.mp3 — "Hello, {name}. Welcome to the world of dragons. …" (template overridable)
 *
 * Directory: /assets/audio/personalized/users/<parentId|slug>/
 */
app.post("/audio/elevenlabs/welcome", async (req, res) => {
  const apiKey = getElevenLabsApiKey();
  const voiceId = getElevenLabsVoiceId();
  const { name, parentId } = req.body || {};
  const displayName = String(name || "").trim();

  if (!displayName) {
    return res.status(400).json({ error: "name is required (child name, e.g. Ari)" });
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

  const folderKey = userVoiceFolderKey(parentId, displayName);
  const userVoiceDir = path.join(USER_VOICE_DIR, folderKey);
  const modelId = process.env.ELEVENLABS_MODEL_ID?.trim() || undefined;

  try {
    console.log("[elevenlabs] user voice clips request", {
      folderKey,
      custom_name: displayName
    });
    const saved = await synthesizeAndSaveUserVoiceClips({
      apiKey,
      voiceId,
      childName: displayName,
      userVoiceDir,
      modelId
    });
    const prefix = `/assets/audio/personalized/users/${folderKey}`;
    const customNameUrl = `${prefix}/custom_name.mp3`;
    const customFrontUrl = `${prefix}/custom_front.mp3`;
    console.log("[elevenlabs] user voice clips done", {
      customNameUrl,
      customFrontUrl
    });
    return res.status(201).json({
      folderKey,
      customNameUrl,
      customFrontUrl,
      texts: saved.texts
    });
  } catch (err) {
    console.error("[elevenlabs] user voice clips failed:", err?.message || err);
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

  // Always schedule: Gemini runs only if GEMINI_API_KEY is set; ElevenLabs runs afterward if
  // ELEVENLABS_* + child name exist (independent of Gemini — see cartoonAvatarService).
  console.log("[profile photo] scheduling post-upload (cartoon if Gemini key + ElevenLabs voice)", safeParentId);
  void generateAndSaveCartoonAvatar({
    profilesDir: PROFILE_ASSETS_DIR,
    safeParentId,
    imageBase64: imageBase64ForGemini,
    mimeType,
    childDisplayName: resolveChildDisplayName(safeParentId),
    userVoiceDir: path.join(USER_VOICE_DIR, safeParentId)
  }).catch((err) => {
    console.error("[profile photo] post-upload task rejected:", err?.message || err);
  });

  if (!cartoonEnabled) {
    console.log(
      "[profile photo] Gemini cartoon disabled — set GEMINI_API_KEY for cartoon (ElevenLabs still runs if configured)"
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
  const parentId = sanitizeProfileId(req.query.parentId);
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
      coverAudio: resolveCoverAudio(book.id, book.coverAudio, parentId),
      pageConfigs: book.pages.map((page) => ({
        ...page,
        image: resolvePageImage(book.id, page.image || "", book, page.pageNumber),
        audio: resolvePageAudios(book.id, page.audio, parentId),
        choiceOutcomes: resolveChoiceOutcomes(book.id, page.choiceOutcomes, book, page.pageNumber, parentId)
      }))
    }
  });
});

app.get("/books/:bookId/pages/:pageNumber", (req, res) => {
  const parentId = sanitizeProfileId(req.query.parentId);
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
    audio: resolvePageAudios(book.id, pageConfig.audio, parentId),
    choiceOutcomes: resolveChoiceOutcomes(book.id, pageConfig.choiceOutcomes, book, pageNumber, parentId),
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
    `[env] ElevenLabs (custom_name + custom_front): ${elevenReady ? "configured (POST /audio/elevenlabs/welcome)" : "disabled — set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID"}`
  );
});
