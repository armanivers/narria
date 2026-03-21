"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Book, getBooks } from "@/lib/api";
import { clearSession, getParentFromSession, saveSelectedBook } from "@/lib/session";

export default function MenuPage() {
  const router = useRouter();
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBook, setSelectedBook] = useState("wizards");

  useEffect(() => {
    const parent = getParentFromSession();
    if (!parent) {
      router.replace("/");
      return;
    }
    getBooks()
      .then((response) => {
        setBooks(response.books);
        if (response.books[0]) {
          setSelectedBook(response.books[0].id);
        }
      })
      .catch(() => setBooks([]));
  }, [router]);

  async function startStory() {
    try {
      // Unlock media playback from this explicit user gesture.
      const probe = new Audio();
      probe.muted = true;
      await probe.play();
      probe.pause();
      probe.currentTime = 0;
    } catch {
      // If unlock fails, story page fallback overlay will still handle it.
    }

    saveSelectedBook(selectedBook);
    router.push(`/story/${selectedBook}`);
  }

  return (
    <main className="screen">
      <section className="panel">
        <h1 className="title">Main Menu</h1>
        <p className="subtitle">Pick a story card, then start the book story.</p>

        <div className="cardsGrid">
          {books.map((book) => (
            <button
              key={book.id}
              className={`card ${selectedBook === book.id ? "selected" : ""}`}
              onClick={() => setSelectedBook(book.id)}
            >
              <h3>{book.name}</h3>
              <p style={{ marginTop: 8, color: "#cabce8" }}>
                {Number.isFinite(book.pages) ? book.pages : 0} pages
              </p>
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button className="menuButton" onClick={startStory}>
            Start Book Story
          </button>
          <button
            className="menuButton secondaryButton"
            onClick={() => {
              clearSession();
              router.push("/");
            }}
          >
            Logout
          </button>
        </div>
      </section>
    </main>
  );
}
