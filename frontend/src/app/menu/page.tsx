"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Book, getBooks } from "@/lib/api";
import { clearSession, getParentFromSession, saveSelectedBook } from "@/lib/session";

const BOOK_EMOJI: Record<string, string> = {
  wizards: "🧙",
  dragons: "🐉",
  princess: "👸",
  mermaids: "🧜‍♀️"
};

const BOOK_THEME_IDS = new Set(["wizards", "dragons", "princess", "mermaids"]);

export default function MenuPage() {
  const router = useRouter();
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBook, setSelectedBook] = useState("wizards");
  const [parentName, setParentName] = useState<string | null>(null);
  const [childName, setChildName] = useState<string | null>(null);

  useEffect(() => {
    const parent = getParentFromSession();
    if (!parent) {
      router.replace("/");
      return;
    }
    queueMicrotask(() => {
      setParentName(parent.name?.trim() || parent.username);
      setChildName(parent.childName?.trim() || null);
    });
    getBooks()
      .then((response) => {
        setBooks(response.books);
        if (response.books[0]) {
          setSelectedBook(response.books[0].id);
        }
      })
      .catch(() => setBooks([]));
  }, [router]);

  function startStory() {
    const probe = new Audio();
    probe.muted = true;
    void probe
      .play()
      .then(() => {
        probe.pause();
        probe.currentTime = 0;
      })
      .catch(() => {});

    saveSelectedBook(selectedBook);
    router.push(`/story/${selectedBook}`);
  }

  return (
    <main className="kidPageShell">
      <div className="kidFloatShape kidFloat1" aria-hidden />
      <div className="kidFloatShape kidFloat2" aria-hidden />
      <div className="kidFloatShape kidFloat3" aria-hidden />

      <section className="kidCard">
        <div className="menuTopBarKid">
          <p style={{ margin: 0, fontWeight: 700, color: "#1e3a5f", fontSize: "0.95rem" }}>
            {parentName ? (
              <>
                Hi, <span style={{ color: "#0ea5e9" }}>{parentName}</span> 👋
              </>
            ) : (
              "Welcome 👋"
            )}
          </p>
          <div className="menuTopBtns">
            <button
              type="button"
              className="menuBtnSoft menuBtnSoftPrimary"
              onClick={() => router.push("/profile-photo?mode=edit")}
            >
              Edit profile
            </button>
            <button
              type="button"
              className="menuBtnSoft menuBtnSoftCoral"
              onClick={() => router.push("/profile-photo?mode=create")}
            >
              New selfie
            </button>
          </div>
        </div>

        <h1 className="menuHeadline">
          Choose your <span>adventure</span>
        </h1>
        <p className="menuSubline">
          {childName ? (
            <>
              Stories for <strong style={{ color: "#0ea5e9" }}>{childName}</strong> — tap a picture,
              then open the magic book!
            </>
          ) : (
            <>Tap a story picture, then press the big yellow button to open the magic book!</>
          )}
        </p>

        {books.length === 0 ? (
          <p className="menuLoading">Loading stories…</p>
        ) : (
          <div className="menuStoryGrid">
            {books.map((book) => (
              <button
                key={book.id}
                type="button"
                data-book={book.id}
                className={`menuStoryCard ${!BOOK_THEME_IDS.has(book.id) ? "menuStoryCardDefault" : ""} ${
                  selectedBook === book.id ? "menuStoryCardSelected" : ""
                }`}
                onClick={() => setSelectedBook(book.id)}
              >
                <div className="menuStoryEmoji" aria-hidden>
                  {BOOK_EMOJI[book.id] ?? "📖"}
                </div>
                <h3 className="menuStoryTitle">{book.name}</h3>
                <p className="menuStoryMeta">
                  {Number.isFinite(book.pages) ? book.pages : 0} colorful pages
                </p>
              </button>
            ))}
          </div>
        )}

        <div className="menuBottomRow">
          <button type="button" className="menuBtnGo" onClick={startStory}>
            Start book story ✨
          </button>
          <button
            type="button"
            className="menuBtnLogout"
            onClick={() => {
              clearSession();
              router.push("/");
            }}
          >
            Log out
          </button>
        </div>
      </section>
    </main>
  );
}
