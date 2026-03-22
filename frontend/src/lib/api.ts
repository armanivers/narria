import { defaultLocalBackendOrigin, narriaUseLocalBackend } from "./backendEnv";
import { emitExternalApiToast, type NarriaExternalService } from "./externalApiToastEvents";

function maybeEmitExternalToastFromErrorBody(data: unknown): void {
  if (!data || typeof data !== "object") return;
  const o = data as { narriaExternal?: string; error?: string };
  const s = o.narriaExternal;
  if (s === "gemini" || s === "elevenlabs" || s === "n8n") {
    emitExternalApiToast({ service: s as NarriaExternalService, message: o.error });
  }
}

/**
 * Base URL for JSON API + `/assets/...` paths.
 * - Development (`NODE_ENV=development` or `NARRIA_ENV=development`): uses local Express (`NARRIA_BACKEND_PORT`), ignores `NARRIA_BACKEND_URL` so a prod URL in `.env` does not break `next dev`.
 * - Production: set `NARRIA_BACKEND_URL` on the host (e.g. Render). Rewrites and SSR use that origin.
 * - `NEXT_PUBLIC_API_BASE_URL` (any mode): if set, always used as the API base (browser + SSR).
 * - Browser without that: same-origin `/api/narria` (rewritten per `next.config.ts`).
 */
export function getApiBase(): string {
  const explicit = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  if (typeof window !== "undefined") {
    return "/api/narria";
  }

  const origin = narriaUseLocalBackend()
    ? defaultLocalBackendOrigin()
    : (process.env.NARRIA_BACKEND_URL?.trim() || defaultLocalBackendOrigin());
  return origin.replace(/\/$/, "");
}

/** Backend serves `/assets/...`; use this for `<img src>` / audio URLs in the browser */
export function resolveBackendAssetUrl(path: string | null | undefined): string | null {
  if (path == null || path === "") return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const base = getApiBase().replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

export type Parent = {
  id: string;
  username: string;
  /** Account email (stored in users.json) */
  email?: string | null;
  /** Parent / account display name */
  name?: string | null;
  /** Mirrored from users.json when the child profile is set */
  childName?: string | null;
  /** Child's age in years; mirrored from users.json */
  childAge?: number | null;
};

export type ChildProfile = {
  id: string;
  parentId: string;
  childName: string;
  age: number | null;
};

export type Book = {
  id: string;
  name: string;
  pages: number;
};

export type AudioConfig = {
  src: string;
  startDelayMs?: number;
  /**
   * When true, backend resolves `src` as a filename under the logged-in parent’s folder:
   * `/assets/audio/personalized/users/<parentId>/`. Subtitles use the same base path (.json).
   */
  custom?: boolean;
};

function withParentQuery(path: string, parentId?: string | null) {
  const id = parentId?.trim();
  if (!id) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}parentId=${encodeURIComponent(id)}`;
}

/** Backend may send one clip, several, or string filenames; normalize to an ordered list. */
export function normalizePageAudios(
  audio: AudioConfig | AudioConfig[] | string | string[] | null | undefined
): AudioConfig[] {
  if (audio == null) return [];
  const list = Array.isArray(audio) ? audio : [audio];
  return list
    .map((item) => {
      if (typeof item === "string") {
        const src = item.trim();
        return src ? { src, startDelayMs: 0, custom: false } : null;
      }
      if (item && String(item.src || "").trim().length > 0) {
        return {
          ...item,
          custom: item.custom === true
        } as AudioConfig;
      }
      return null;
    })
    .filter((t): t is AudioConfig => t != null);
}

export type DialogOption = {
  label: string;
  tags: string[];
};

export type DialogChoice = {
  question: string;
  /** Backend normalizes legacy string options to `{ label, tags }`. */
  options: DialogOption[];
};

export type PageData = {
  bookId: string;
  bookName: string;
  storyId?: string;
  storyTitle?: string;
  narrator?: string | null;
  pageNumber: number;
  totalPages: number;
  /** 1-based chapter index when this page is a story choice beat */
  choiceChapter?: number | null;
  image: {
    kind: "url";
    image: string;
  };
  /** Ordered clips for this page; played one after another. */
  audio: AudioConfig[];
  choiceOutcomes: Record<
    string,
    {
      image: { kind: "url"; image: string };
      audio: AudioConfig[];
    }
  > | null;
  hasDialogChoice: boolean;
  dialog: DialogChoice | null;
};

export type BookDetails = Book & {
  storyId?: string;
  storyTitle?: string;
  narrator?: string | null;
  /** All tags used on choice options in this book (for outcome `signals` zeros). */
  signalCatalog?: string[];
  coverAudio: {
    front: AudioConfig;
    back: AudioConfig;
  };
  pageConfigs: unknown[];
};

export type StoryChoiceRecord = {
  chapter: number;
  choiceLabel: string;
  tags: string[];
};

export type StoryOutcomePayload = {
  parentId: string;
  parentEmail?: string;
  childName?: string;
  childAge?: number | null;
  storyId: string;
  storyTitle: string;
  narrator?: string;
  choiceCount: number;
  choices: StoryChoiceRecord[];
  signals: Record<string, number>;
};

/** Initialize all catalog tags to 0, then +1 per tag on each selected choice. */
export function buildSignalsFromChoices(
  catalog: string[],
  choices: { tags: string[] }[]
): Record<string, number> {
  const signals: Record<string, number> = {};
  for (const t of catalog) {
    signals[t] = 0;
  }
  for (const c of choices) {
    for (const raw of c.tags) {
      const t = String(raw).trim();
      if (!t) continue;
      signals[t] = (signals[t] ?? 0) + 1;
    }
  }
  return signals;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBase()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    }
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      error?: string;
      narriaExternal?: string;
    } | null;
    maybeEmitExternalToastFromErrorBody(data);
    const detail = data?.error?.trim();
    const statusBit = `${response.status} ${response.statusText || ""}`.trim();
    throw new Error(detail || `Request failed (${statusBit})`);
  }
  return response.json();
}

export async function login(username: string, password: string) {
  return request<{ token: string; parent: Parent }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
}

export async function register(input: {
  username: string;
  password: string;
  email: string;
  name?: string;
}) {
  return request<{ token: string; parent: Parent }>("/auth/register", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function getChildProfile(parentId: string) {
  return request<{ child: ChildProfile | null }>(`/profile/child/${parentId}`);
}

export async function createChildProfile(input: {
  parentId: string;
  childName: string;
  age?: number;
}) {
  return request<{ child: ChildProfile; parent: Parent }>("/profile/child", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function getBooks() {
  const response = await request<{
    books: Array<{ id: string; name: string; pages: number | unknown[] | null }>;
  }>("/books");

  return {
    books: response.books.map((book) => ({
      id: book.id,
      name: book.name,
      pages:
        typeof book.pages === "number"
          ? book.pages
          : Array.isArray(book.pages)
            ? book.pages.length
            : 0
    }))
  };
}

export async function getBook(bookId: string, parentId?: string | null) {
  return request<{ book: BookDetails }>(withParentQuery(`/books/${bookId}`, parentId));
}

export async function getBookPage(bookId: string, pageNumber: number, parentId?: string | null) {
  return request<PageData>(withParentQuery(`/books/${bookId}/pages/${pageNumber}`, parentId));
}

export async function submitStoryOutcome(payload: StoryOutcomePayload) {
  return request<{ id: string; ok: boolean }>("/story-outcomes", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export type ProfileIntegrationNotice = {
  service: NarriaExternalService;
  message: string;
};

export async function getProfilePhoto(parentId: string) {
  const data = await request<{
    photoUrl: string | null;
    cartoonPhotoUrl: string | null;
    customNameAudioUrl: string | null;
    customFrontAudioUrl: string | null;
    /** Present when custom_front.json exists next to custom_front.mp3 for this parentId */
    customFrontSubtitlesUrl?: string | null;
    /** One-shot notice from async Gemini/ElevenLabs/n8n (consumed on this response). */
    integrationNotice?: ProfileIntegrationNotice | null;
  }>(`/profile/photo/${parentId}`);

  const n = data.integrationNotice;
  if (n && (n.service === "gemini" || n.service === "elevenlabs" || n.service === "n8n")) {
    emitExternalApiToast({ service: n.service, message: n.message });
  }
  return data;
}

export async function saveProfilePhoto(
  parentId: string,
  imageDataUrl: string,
  opts?: { childName?: string; age?: number | null }
) {
  const body: Record<string, unknown> = { parentId, imageDataUrl };
  const cn = opts?.childName?.trim();
  if (cn) body.childName = cn;
  if (opts?.age != null && Number.isFinite(Number(opts.age))) {
    body.age = Number(opts.age);
  }
  return request<{
    photoUrl: string;
    cartoonPending?: boolean;
    cartoonPhotoUrl: string | null;
  }>("/profile/photo", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

/** ElevenLabs: two clips — custom_name (child's name only) + custom_front (welcome line); saved under /assets/audio/personalized/users/<id>/ */
export async function requestElevenLabsWelcomeAudio(input: {
  childName: string;
  parentId?: string;
}) {
  return request<{
    folderKey: string;
    customNameUrl: string;
    customFrontUrl: string;
    texts: { custom_name: string; custom_front: string };
  }>("/audio/elevenlabs/welcome", {
    method: "POST",
    body: JSON.stringify({ childName: input.childName.trim(), parentId: input.parentId })
  });
}
