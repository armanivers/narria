"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import BookScene from "@/components/book/BookScene";
import { AudioConfig, getBook, getBookPage, PageData } from "@/lib/api";
import { getParentFromSession } from "@/lib/session";

type BookState = "closed-front" | "opening" | "open" | "flipping" | "closing" | "closed-back";

export default function StoryPage() {
  const router = useRouter();
  const params = useParams<{ bookId: string }>();
  const bookId = useMemo(() => params.bookId, [params.bookId]);
  const [state, setState] = useState<BookState>("closed-front");
  const [focusedPage, setFocusedPage] = useState(0);
  const [spreadStart, setSpreadStart] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [bookName, setBookName] = useState("");
  const [coverAudio, setCoverAudio] = useState<{
    front: AudioConfig;
    back: AudioConfig;
  } | null>(null);
  const [leftPageImage, setLeftPageImage] = useState<string | null>(null);
  const [rightPageImage, setRightPageImage] = useState<string | null>(null);
  const [label, setLabel] = useState("Next Page");
  const [flipTick, setFlipTick] = useState(0);
  const [isBusy, setIsBusy] = useState(false);
  const [introFade, setIntroFade] = useState(true);
  const [outroFade, setOutroFade] = useState(false);
  const [pagesByNumber, setPagesByNumber] = useState<Record<number, PageData>>({});
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [audioUnlockNeeded, setAudioUnlockNeeded] = useState(false);
  const [autoFlipSecondsLeft, setAutoFlipSecondsLeft] = useState<number | null>(null);
  const [dismissedDialogPage, setDismissedDialogPage] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioDelayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasPlayedFrontRef = useRef(false);
  const hasPlayedBackRef = useRef(false);
  const skipNextAutoPageAudioRef = useRef<number | null>(null);
  const autoFlipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoFlipIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const advancePageRef = useRef<(() => Promise<void>) | null>(null);
  const pendingAudioRef = useRef<{
    config: AudioConfig;
    onEnded?: () => void;
    options?: { overrideDelayMs?: number; shouldAutoAdvanceOnEnd?: boolean };
  } | null>(null);

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

    getBook(bookId).then((response) => {
      if (!response.book) {
        router.replace("/menu");
        return;
      }
      setBookName(response.book.name);
      setTotalPages(response.book.pages);
      setCoverAudio(response.book.coverAudio || null);
    });
  }, [bookId, router]);

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

  const resolveAudioUrl = useCallback(
    (src?: string) => {
      if (!src) return "";
      if (src.startsWith("http://") || src.startsWith("https://")) return src;
      if (src.startsWith("/")) return `${apiBaseUrl}${src}`;
      return `${apiBaseUrl}/assets/audio/pages/${bookId}/${src}`;
    },
    [apiBaseUrl, bookId]
  );

  const stopAudioPlayback = useCallback(() => {
    if (audioDelayTimeoutRef.current) clearTimeout(audioDelayTimeoutRef.current);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsAudioPlaying(false);
  }, []);

  const clearAutoFlipCountdown = useCallback(() => {
    if (autoFlipTimeoutRef.current) clearTimeout(autoFlipTimeoutRef.current);
    if (autoFlipIntervalRef.current) clearInterval(autoFlipIntervalRef.current);
    setAutoFlipSecondsLeft(null);
  }, []);

  const startAutoFlipCountdown = useCallback(
    (onDone: () => void) => {
      clearAutoFlipCountdown();
      setAutoFlipSecondsLeft(3);
      let seconds = 3;
      autoFlipIntervalRef.current = setInterval(() => {
        seconds -= 1;
        setAutoFlipSecondsLeft(Math.max(0, seconds));
      }, 1000);
      autoFlipTimeoutRef.current = setTimeout(() => {
        clearAutoFlipCountdown();
        onDone();
      }, 3000);
    },
    [clearAutoFlipCountdown]
  );

  const scheduleAudioPlayback = useCallback(
    (
      audioConfig: AudioConfig | null | undefined,
      onEnded?: () => void,
      options?: { overrideDelayMs?: number; shouldAutoAdvanceOnEnd?: boolean }
    ) => {
      const src = resolveAudioUrl(audioConfig?.src);
      if (!src) return;
      stopAudioPlayback();

      const delay = options?.overrideDelayMs ?? audioConfig?.startDelayMs ?? 1000;
      const shouldAutoAdvanceOnEnd = options?.shouldAutoAdvanceOnEnd ?? false;
      audioDelayTimeoutRef.current = setTimeout(() => {
        const audio = new Audio(src);
        audioRef.current = audio;
        audio.onplay = () => setIsAudioPlaying(true);
        audio.onpause = () => setIsAudioPlaying(false);
        audio.onended = () => {
          setIsAudioPlaying(false);
          if (shouldAutoAdvanceOnEnd) {
            startAutoFlipCountdown(() => {
              const triggerNext = advancePageRef.current;
              if (triggerNext) {
                void triggerNext();
              }
            });
            return;
          }
          if (onEnded) {
            onEnded();
          }
        };
        audio.play().catch(() => {
          // Browser autoplay policies can block sound; require one-click unlock.
          setIsAudioPlaying(false);
          setAudioUnlockNeeded(true);
          pendingAudioRef.current = audioConfig ? { config: audioConfig, onEnded, options } : null;
        });
      }, delay);
    },
    [resolveAudioUrl, startAutoFlipCountdown, stopAudioPlayback]
  );

  const unlockAudioAndResume = useCallback(async () => {
    try {
      const probe = new Audio();
      probe.muted = true;
      await probe.play();
      probe.pause();
    } catch {
      // If this still fails, keep the button visible.
      return;
    }

    setAudioUnlockNeeded(false);
    const pending = pendingAudioRef.current;
    pendingAudioRef.current = null;
    if (pending) {
      scheduleAudioPlayback(pending.config, pending.onEnded, pending.options);
    }
  }, [scheduleAudioPlayback]);

  useEffect(() => {
    return () => {
      stopAudioPlayback();
      clearAutoFlipCountdown();
    };
  }, [clearAutoFlipCountdown, stopAudioPlayback]);

  const loadPage = useCallback(
    async (pageNumber: number) => {
      if (pagesByNumber[pageNumber]) return pagesByNumber[pageNumber];
      const pageData = await getBookPage(bookId, pageNumber);
      setPagesByNumber((prev) => ({ ...prev, [pageNumber]: pageData }));
      return pageData;
    },
    [bookId, pagesByNumber]
  );

  const loadSpread = useCallback(
    async (startPage: number) => {
      const left = await loadPage(startPage);
      let right = left;
      if (startPage + 1 <= totalPages) {
        right = await loadPage(startPage + 1);
      }

      setLeftPageImage(left.image.image);
      setRightPageImage(right.image.image);
      setSpreadStart(startPage);
    },
    [loadPage, totalPages]
  );

  const finishBook = useCallback(() => {
    setLabel("Closing...");
    setIsBusy(true);
    setState("closing");
    setTimeout(() => setState("closed-back"), 600);
    setTimeout(() => setOutroFade(true), 700);
    setTimeout(() => router.push("/menu"), 2400);
  }, [router]);

  const advancePage = useCallback(async () => {
    if (isBusy) return;
    stopAudioPlayback();
    clearAutoFlipCountdown();

    if (state === "closed-front") {
      setIsBusy(true);
      setState("opening");
      await loadSpread(1);
      setFocusedPage(1);
      const pageOneData = await loadPage(1);
      if (pageOneData?.audio?.src) {
        // User gesture path: play immediately on first next click.
        skipNextAutoPageAudioRef.current = 1;
        scheduleAudioPlayback(pageOneData.audio, undefined, {
          overrideDelayMs: 0,
          shouldAutoAdvanceOnEnd: true
        });
      }
      setTimeout(() => {
        setState("open");
        setIsBusy(false);
      }, 700);
      return;
    }

    if (focusedPage >= totalPages) {
      finishBook();
      return;
    }

    const nextPage = focusedPage + 1;
    if (nextPage % 2 === 0) {
      setFocusedPage(nextPage);
      return;
    }

    setIsBusy(true);
    setState("flipping");
    await loadSpread(nextPage);
    setFlipTick((value) => value + 1);
    setFocusedPage(nextPage);
    setTimeout(() => {
      setState("open");
      setIsBusy(false);
    }, 600);
  }, [clearAutoFlipCountdown, finishBook, focusedPage, isBusy, loadPage, loadSpread, scheduleAudioPlayback, state, stopAudioPlayback, totalPages]);

  useEffect(() => {
    advancePageRef.current = advancePage;
  }, [advancePage]);

  useEffect(() => {
    if (state !== "open" || focusedPage < 1) return;
    if (skipNextAutoPageAudioRef.current === focusedPage) {
      skipNextAutoPageAudioRef.current = null;
      return;
    }
    const pageData = pagesByNumber[focusedPage];
    if (!pageData?.audio) return;

    const run = setTimeout(() => {
      scheduleAudioPlayback(pageData.audio, undefined, { shouldAutoAdvanceOnEnd: true });
    }, 0);

    return () => {
      clearTimeout(run);
      stopAudioPlayback();
    };
  }, [advancePage, focusedPage, pagesByNumber, scheduleAudioPlayback, state, stopAudioPlayback]);

  useEffect(() => {
    if (introFade || !coverAudio?.front || hasPlayedFrontRef.current) return;
    if (state !== "closed-front") return;

    hasPlayedFrontRef.current = true;
    const run = setTimeout(() => {
      scheduleAudioPlayback(coverAudio.front, undefined, { shouldAutoAdvanceOnEnd: true });
    }, 0);
    return () => clearTimeout(run);
  }, [coverAudio, introFade, scheduleAudioPlayback, state]);

  useEffect(() => {
    if (!coverAudio?.back || hasPlayedBackRef.current) return;
    if (state !== "closed-back") return;

    hasPlayedBackRef.current = true;
    const run = setTimeout(() => {
      scheduleAudioPlayback(coverAudio.back);
    }, 0);
    return () => clearTimeout(run);
  }, [coverAudio, scheduleAudioPlayback, state]);

  const currentPageData = focusedPage > 0 ? pagesByNumber[focusedPage] : null;
  const rightPageNumber = spreadStart + 1 <= totalPages ? spreadStart + 1 : null;
  const showDialogModal = Boolean(
    currentPageData?.hasDialogChoice &&
      currentPageData?.dialog &&
      dismissedDialogPage !== focusedPage
  );

  return (
    <main className="screen">
      <section className="panel storyContainer storyPanel">
        {introFade ? <div className="storyIntroOverlay" /> : null}
        {outroFade ? <div className="storyOutroOverlay" /> : null}
        {autoFlipSecondsLeft !== null ? (
          <div className="autoFlipIndicator">
            <span className="autoFlipCircle">{autoFlipSecondsLeft}</span>
          </div>
        ) : null}
        <BookScene
          state={state}
          leftPageImage={leftPageImage}
          rightPageImage={rightPageImage}
          flipTick={flipTick}
          leftPageNumber={spreadStart}
          rightPageNumber={rightPageNumber}
          focusedPage={focusedPage}
        />

        <div className="storyControls">
          <p>
            {bookName} - Focus page {focusedPage || 0}/{totalPages}
          </p>
          {isAudioPlaying ? <div className="audioPlayingBadge">🔊 Playing</div> : null}
          <button className="menuButton" onClick={advancePage} disabled={isBusy}>
            {label}
          </button>
        </div>

        {audioUnlockNeeded ? (
          <div className="audioUnlockOverlay">
            <button className="menuButton" onClick={unlockAudioAndResume}>
              Tap to enable sound
            </button>
          </div>
        ) : null}

        {showDialogModal ? (
          <div className="dialogModalOverlay" onClick={() => setDismissedDialogPage(focusedPage)}>
            <div className="dialogModalCard" onClick={(event) => event.stopPropagation()}>
              <p className="dialogQuestion">{currentPageData?.dialog?.question}</p>
              <div className="dialogOptions">
                {currentPageData?.dialog?.options.slice(0, 3).map((option) => (
                  <button
                    key={option}
                    className="menuButton secondaryButton"
                    type="button"
                    onClick={() => setDismissedDialogPage(focusedPage)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
