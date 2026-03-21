import { Parent } from "./api";

const TOKEN_KEY = "storybook_token";
const PARENT_KEY = "storybook_parent";
const BOOK_KEY = "storybook_selected_book";

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function saveSession(token: string, parent: Parent) {
  const storage = browserStorage();
  if (!storage) return;
  storage.setItem(TOKEN_KEY, token);
  storage.setItem(PARENT_KEY, JSON.stringify(parent));
}

export function clearSession() {
  const storage = browserStorage();
  if (!storage) return;
  storage.removeItem(TOKEN_KEY);
  storage.removeItem(PARENT_KEY);
  storage.removeItem(BOOK_KEY);
}

export function getParentFromSession(): Parent | null {
  const storage = browserStorage();
  if (!storage) return null;
  const raw = storage.getItem(PARENT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Parent;
  } catch {
    return null;
  }
}

export function saveSelectedBook(bookId: string) {
  const storage = browserStorage();
  if (!storage) return;
  storage.setItem(BOOK_KEY, bookId);
}

export function getSelectedBook(): string | null {
  const storage = browserStorage();
  if (!storage) return null;
  return storage.getItem(BOOK_KEY);
}
