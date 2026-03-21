import { Parent } from "./api";

const TOKEN_KEY = "storybook_token";
const PARENT_KEY = "storybook_parent";
const BOOK_KEY = "storybook_selected_book";

export function saveSession(token: string, parent: Parent) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(PARENT_KEY, JSON.stringify(parent));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(PARENT_KEY);
  localStorage.removeItem(BOOK_KEY);
}

export function getParentFromSession(): Parent | null {
  const raw = localStorage.getItem(PARENT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Parent;
  } catch {
    return null;
  }
}

export function saveSelectedBook(bookId: string) {
  localStorage.setItem(BOOK_KEY, bookId);
}

export function getSelectedBook() {
  return localStorage.getItem(BOOK_KEY);
}
