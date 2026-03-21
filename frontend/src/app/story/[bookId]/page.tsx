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
  const [spreadStart, setSpreadStart] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [leftPageImage, setLeftPageImage] = useState<string | null>(null);
  const [rightPageImage, setRightPageImage] = useState<string | null>(null);
  const [label, setLabel] = useState("Next Page");
  const [flipTick, setFlipTick] = useState(0);
  const [isBusy, setIsBusy] = useState(false);
  const [introFade, setIntroFade] = useState(true);
  const [outroFade, setOutroFade] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIntroFade(false), 1400);
    return () => clearTimeout(timer);
  }, []);

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

  async function loadSpread(startPage: number) {
    const left = await getBookPage(bookId, startPage);
    let rightImage = left.image.image;
    if (startPage + 1 <= totalPages) {
      const right = await getBookPage(bookId, startPage + 1);
      rightImage = right.image.image;
    }

    setLeftPageImage(left.image.image);
    setRightPageImage(rightImage);
    setSpreadStart(startPage);
  }

  async function nextPage() {
    if (isBusy) return;

    if (state === "closed-front") {
      setIsBusy(true);
      setState("opening");
      await loadSpread(1);
      setTimeout(() => {
        setState("open");
        setIsBusy(false);
      }, 700);
      return;
    }

    if (spreadStart + 2 <= totalPages) {
      setIsBusy(true);
      setState("flipping");
      await loadSpread(spreadStart + 2);
      setFlipTick((value) => value + 1);
      setTimeout(() => {
        setState("open");
        setIsBusy(false);
      }, 600);
      return;
    }

    setLabel("Closing...");
    setIsBusy(true);
    setState("closing");
    setTimeout(() => setState("closed-back"), 600);
    setTimeout(() => setOutroFade(true), 700);
    setTimeout(() => router.push("/menu"), 2400);
  }

  return (
    <main className="screen">
      <section className="panel storyContainer storyPanel">
        {introFade ? <div className="storyIntroOverlay" /> : null}
        {outroFade ? <div className="storyOutroOverlay" /> : null}
        <BookScene
          state={state}
          leftPageImage={leftPageImage}
          rightPageImage={rightPageImage}
          flipTick={flipTick}
        />

        <div className="storyControls">
          <p>
            Pages {spreadStart || 0}-{Math.min(spreadStart + 1, totalPages)}/{totalPages}
          </p>
          <button className="menuButton" onClick={nextPage} disabled={isBusy}>
            {label}
          </button>
        </div>
      </section>
    </main>
  );
}
