export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

/** Backend serves `/assets/...`; use this for <img src> in the browser */
export function resolveBackendAssetUrl(path: string | null | undefined): string | null {
  if (path == null || path === "") return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const base = API_BASE_URL.replace(/\/$/, "");
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

export type DialogChoice = {
  question: string;
  options: string[];
};

export type PageData = {
  bookId: string;
  bookName: string;
  pageNumber: number;
  totalPages: number;
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
  coverAudio: {
    front: AudioConfig;
    back: AudioConfig;
  };
  pageConfigs: unknown[];
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    }
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || "Request failed");
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

export async function getProfilePhoto(parentId: string) {
  return request<{
    photoUrl: string | null;
    cartoonPhotoUrl: string | null;
    customNameAudioUrl: string | null;
    customFrontAudioUrl: string | null;
  }>(`/profile/photo/${parentId}`);
}

export async function saveProfilePhoto(parentId: string, imageDataUrl: string) {
  return request<{
    photoUrl: string;
    cartoonPending?: boolean;
    cartoonPhotoUrl: string | null;
  }>("/profile/photo", {
    method: "POST",
    body: JSON.stringify({ parentId, imageDataUrl })
  });
}

/** ElevenLabs: two clips — custom_name (name only) + custom_front (welcome line); saved under /assets/audio/personalized/users/<id>/ */
export async function requestElevenLabsWelcomeAudio(input: {
  name: string;
  parentId?: string;
}) {
  return request<{
    folderKey: string;
    customNameUrl: string;
    customFrontUrl: string;
    texts: { custom_name: string; custom_front: string };
  }>("/audio/elevenlabs/welcome", {
    method: "POST",
    body: JSON.stringify(input)
  });
}
