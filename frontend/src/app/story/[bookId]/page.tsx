"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import BookScene from "@/components/book/BookScene";
import { getBookPage, getBooks } from "@/lib/api";
import { getParentFromSession } from "@/lib/session";

type BookState = "closed-front" | "opening" | "open" | "flipping" | "closing" | "closed-back";

export default function StoryPage() {
  const router = useRouter();
  const params = useParams<{ bookId: string }>();
  const bookId = useMemo(() => params.bookId, [params.bookId]);
  const [state, setState] = useState<BookState>("closed-front");
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [pageImage, setPageImage] = useState<string | null>(null);
  const [label, setLabel] = useState("Next Page");

  useEffect(() => {
    const parent = getParentFromSession();
    if (!parent) {
      router.replace("/");
      return;
    }

    getBooks().then((response) => {
      const current = response.books.find((book) => book.id === bookId);
      if (!current) {
        router.replace("/menu");
        return;
      }
      setTotalPages(current.pages);
    });
  }, [bookId, router]);

  async function loadPage(pageNumber: number) {
    const response = await getBookPage(bookId, pageNumber);
    setPageImage(response.image.image);
    setCurrentPage(response.pageNumber);
  }

  async function nextPage() {
    if (state === "closed-front") {
      setState("opening");
      await loadPage(1);
      setTimeout(() => setState("open"), 650);
      return;
    }

    if (currentPage < totalPages) {
      setState("flipping");
      const next = currentPage + 1;
      await loadPage(next);
      setTimeout(() => setState("open"), 550);
      return;
    }

    setLabel("Closing...");
    setState("closing");
    setTimeout(() => setState("closed-back"), 600);
    setTimeout(() => router.push("/menu"), 1300);
  }

  return (
    <main className="screen">
      <section className="panel storyContainer">
        <BookScene state={state} pageImage={pageImage} />

        <div className="storyControls">
          <p>
            Page {currentPage || 0}/{totalPages}
          </p>
          <button className="menuButton" onClick={nextPage}>
            {label}
          </button>
        </div>
      </section>
    </main>
  );
}
