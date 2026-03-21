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

type PageResponse = {
  bookId: string;
  pageNumber: number;
  totalPages: number;
  image: {
    kind: "url";
    image: string;
  };
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {})
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
  return request<{ books: Book[] }>("/books");
}

export async function getBookPage(bookId: string, pageNumber: number) {
  return request<PageResponse>(`/books/${bookId}/pages/${pageNumber}`);
}
