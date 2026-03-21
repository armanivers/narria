const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

export type Parent = {
  id: string;
  username: string;
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
};

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
  audio: AudioConfig | null;
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

export async function register(username: string, password: string) {
  return request<{ token: string; parent: Parent }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password })
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
  return request<{ child: ChildProfile }>("/profile/child", {
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
      pages: typeof book.pages === "number" ? book.pages : Array.isArray(book.pages) ? book.pages.length : 0
    }))
  };
}

export async function getBook(bookId: string) {
  return request<{ book: BookDetails }>(`/books/${bookId}`);
}

export async function getBookPage(bookId: string, pageNumber: number) {
  return request<PageData>(`/books/${bookId}/pages/${pageNumber}`);
}
