"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Book, getBooks, getProfilePhoto } from "@/lib/api";
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
  const [photoCheckDone, setPhotoCheckDone] = useState(false);
  const [hasProfilePhoto, setHasProfilePhoto] = useState(false);

  const hasChildProfile = Boolean(childName?.trim());

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
    setPhotoCheckDone(false);
    getProfilePhoto(parent.id)
      .then((r) => setHasProfilePhoto(Boolean(r.photoUrl?.trim())))
      .catch(() => setHasProfilePhoto(false))
      .finally(() => setPhotoCheckDone(true));

    getBooks()
      .then((response) => {
        setBooks(response.books);
        if (response.books[0]) {
          setSelectedBook(response.books[0].id);
        }
      })
      .catch(() => setBooks([]));
  }, [router]);

  let headerProfileAction: ReactNode = null;
  if (photoCheckDone && hasChildProfile) {
    if (hasProfilePhoto) {
      headerProfileAction = (
        <button
          type="button"
          className="menuBtnSoft menuBtnSoftPrimary"
          onClick={() => router.push("/profile-photo?mode=edit")}
        >
          Edit child profile
        </button>
      );
    } else {
      headerProfileAction = (
        <button
          type="button"
          className="menuBtnSoft menuBtnSoftCoral"
          onClick={() => router.push("/profile-photo?mode=create")}
        >
          New selfie
        </button>
      );
    }
  }

  function startStory() {
    if (!hasChildProfile) return;
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
        <header className="menuTopBarKid">
          <p className="menuGreeting">
            {parentName ? (
              <>
                Hi, <span className="menuGreetingAccent">{parentName}</span> 👋
              </>
            ) : (
              "Welcome 👋"
            )}
          </p>
          <div className="menuHeaderActions">
            {headerProfileAction}
            <button
              type="button"
              className="menuBtnLogout menuBtnLogout--header"
              onClick={() => {
                clearSession();
                router.push("/");
              }}
            >
              Log out
            </button>
          </div>
        </header>

        {hasChildProfile ? (
          <>
            <h1 className="menuHeadline">
              Choose your <span>adventure</span>
            </h1>
            <p className="menuSubline">
              Stories for <strong style={{ color: "#0ea5e9" }}>{childName}</strong> — tap a picture,
              then open the magic book!
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
                    className={`menuStoryCard ${BOOK_THEME_IDS.has(book.id) ? "" : "menuStoryCardDefault"} ${
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
          </>
        ) : (
          <div className="menuStoriesLocked">
            <h1 className="menuHeadline menuHeadline--center">
              Your adventure <span>starts here</span>
            </h1>
            <p className="menuSubline menuSubline--center">
              The first step into exploring personalized stories is adding your child: enter their
              name and age, then take a selfie — all in one place. After that, you can pick books and
              hear their name in the magic book.
            </p>
            <div className="menuLockedActions">
              <button
                type="button"
                className="menuBtnGo"
                onClick={() => router.push("/profile-photo?mode=create")}
              >
                Set up child & selfie
              </button>
            </div>
          </div>
        )}

        {hasChildProfile ? (
          <div className="menuBottomRow">
            <button type="button" className="menuBtnGo" onClick={startStory}>
              Start book story ✨
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
