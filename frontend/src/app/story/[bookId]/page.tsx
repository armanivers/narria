"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import BookScene from "@/components/book/BookScene";
import { AudioConfig, getBook, getBookPage, PageData } from "@/lib/api";
import { getParentFromSession } from "@/lib/session";

type BookState = "closed-front" | "opening" | "open" | "flipping" | "closing" | "closed-back";
type SubtitleWord = { text: string; start_time: number; end_time: number };
type SubtitleSegment = {
  text: string;
  start_time: number;
  end_time: number;
  words: SubtitleWord[];
};
type SubtitleTrack = { segments: SubtitleSegment[] };

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
  const [isAudioPaused, setIsAudioPaused] = useState(false);
  const [audioUnlockNeeded, setAudioUnlockNeeded] = useState(false);
  const [autoFlipSecondsLeft, setAutoFlipSecondsLeft] = useState<number | null>(null);
  const [dialogPromptPage, setDialogPromptPage] = useState<number | null>(null);
  const [selectedChoiceByPage, setSelectedChoiceByPage] = useState<Record<number, string>>({});
  const [choiceMediaOverrideByPage, setChoiceMediaOverrideByPage] = useState<
    Record<number, { image: string; audio: AudioConfig | null }>
  >({});
  const [subtitleWords, setSubtitleWords] = useState<SubtitleWord[]>([]);
  const [activeSubtitleWordIndex, setActiveSubtitleWordIndex] = useState<number>(-1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioDelayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subtitleHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasPlayedFrontRef = useRef(false);
  const hasPlayedBackRef = useRef(false);
  const skipNextAutoPageAudioRef = useRef<number | null>(null);
  const autoFlipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoFlipIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const advancePageRef = useRef<(() => Promise<void>) | null>(null);
  const continueFromChoiceRef = useRef(false);
  const pendingChoiceOverrideRef = useRef<{
    pageNumber: number;
    image: string;
    audio: AudioConfig | null;
  } | null>(null);
  const pendingAudioRef = useRef<{
    config: AudioConfig;
    onEnded?: () => void;
    options?: { overrideDelayMs?: number; shouldAutoAdvanceOnEnd?: boolean };
  } | null>(null);
  const subtitleTrackRef = useRef<SubtitleTrack | null>(null);
  const subtitleSegmentIndexRef = useRef<number>(-1);
  const subtitleWordIndexRef = useRef<number>(-1);
  /** Short SFX for spread change; separate from narration `audioRef`. */
  const pageFlipSfxRef = useRef<HTMLAudioElement | null>(null);

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

  const resolveImageUrl = useCallback(
    (src?: string) => {
      if (!src) return "";
      if (src.startsWith("http://") || src.startsWith("https://")) return src;
      if (src.startsWith("/")) return `${apiBaseUrl}${src}`;
      return `${apiBaseUrl}/assets/images/${bookId}/${src}`;
    },
    [apiBaseUrl, bookId]
  );

  const stopAudioPlayback = useCallback(() => {
    if (audioDelayTimeoutRef.current) clearTimeout(audioDelayTimeoutRef.current);
    if (subtitleHideTimeoutRef.current) clearTimeout(subtitleHideTimeoutRef.current);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsAudioPlaying(false);
    setIsAudioPaused(false);
    subtitleTrackRef.current = null;
    subtitleSegmentIndexRef.current = -1;
    subtitleWordIndexRef.current = -1;
    setSubtitleWords([]);
    setActiveSubtitleWordIndex(-1);
  }, []);

  const subtitleUrlForAudio = useCallback((audioUrl: string) => {
    return audioUrl.replace(/\.(mp3|wav|ogg|m4a)(\?.*)?$/i, ".json");
  }, []);

  const loadSubtitleTrack = useCallback(async (audioUrl: string) => {
    const subtitleUrl = subtitleUrlForAudio(audioUrl);
    try {
      const response = await fetch(subtitleUrl);
      if (!response.ok) {
        subtitleTrackRef.current = null;
        return;
      }
      const data = (await response.json()) as SubtitleTrack;
      subtitleTrackRef.current = Array.isArray(data?.segments) ? data : null;
    } catch {
      subtitleTrackRef.current = null;
    }
  }, [subtitleUrlForAudio]);

  const scheduleSubtitleHide = useCallback((delayMs = 1200) => {
    if (subtitleHideTimeoutRef.current) clearTimeout(subtitleHideTimeoutRef.current);
    subtitleHideTimeoutRef.current = setTimeout(() => {
      subtitleSegmentIndexRef.current = -1;
      subtitleWordIndexRef.current = -1;
      setSubtitleWords([]);
      setActiveSubtitleWordIndex(-1);
    }, delayMs);
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
        void loadSubtitleTrack(src);
        audio.onplay = () => {
          setIsAudioPlaying(true);
          setIsAudioPaused(false);
        };
        audio.onpause = () => {
          setIsAudioPlaying(false);
          if (!audio.ended && audio.currentTime > 0) {
            setIsAudioPaused(true);
          }
        };
        audio.ontimeupdate = () => {
          const track = subtitleTrackRef.current;
          if (!track) return;
          const now = audio.currentTime;
          const segmentIndex = track.segments.findIndex(
            (segment) => now >= segment.start_time && now <= segment.end_time
          );

          if (segmentIndex === -1) {
            if (subtitleSegmentIndexRef.current !== -1) {
              // Keep previous subtitle briefly after spoken segment ends.
              scheduleSubtitleHide(1200);
            }
            return;
          }

          if (subtitleHideTimeoutRef.current) {
            clearTimeout(subtitleHideTimeoutRef.current);
            subtitleHideTimeoutRef.current = null;
          }

          const segment = track.segments[segmentIndex];
          if (subtitleSegmentIndexRef.current !== segmentIndex) {
            subtitleSegmentIndexRef.current = segmentIndex;
            subtitleWordIndexRef.current = -1;
            setSubtitleWords(segment.words || []);
            setActiveSubtitleWordIndex(-1);
          }

          const wordIndex = (segment.words || []).findIndex(
            (word) => now >= word.start_time && now <= word.end_time
          );
          if (wordIndex !== -1 && wordIndex !== subtitleWordIndexRef.current) {
            subtitleWordIndexRef.current = wordIndex;
            setActiveSubtitleWordIndex(wordIndex);
          }
        };
        audio.onended = () => {
          setIsAudioPlaying(false);
          setIsAudioPaused(false);
          subtitleSegmentIndexRef.current = -1;
          subtitleWordIndexRef.current = -1;
          setSubtitleWords([]);
          setActiveSubtitleWordIndex(-1);
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
          setIsAudioPaused(false);
          setAudioUnlockNeeded(true);
          pendingAudioRef.current = audioConfig ? { config: audioConfig, onEnded, options } : null;
        });
      }, delay);
    },
    [loadSubtitleTrack, resolveAudioUrl, scheduleSubtitleHide, startAutoFlipCountdown, stopAudioPlayback]
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

  const toggleAudioPlayback = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    void audio.play().catch(() => {
      setAudioUnlockNeeded(true);
    });
  }, []);

  const playPageFlipSound = useCallback(() => {
    try {
      if (!pageFlipSfxRef.current) {
        const el = new Audio("/pageflip.mp3");
        el.preload = "auto";
        pageFlipSfxRef.current = el;
      }
      const sfx = pageFlipSfxRef.current;
      sfx.volume = 0.7;
      sfx.currentTime = 0;
      void sfx.play().catch(() => {
        /* Autoplay or missing file — ignore */
      });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    return () => {
      stopAudioPlayback();
      clearAutoFlipCountdown();
      if (pageFlipSfxRef.current) {
        pageFlipSfxRef.current.pause();
        pageFlipSfxRef.current.currentTime = 0;
      }
    };
  }, [clearAutoFlipCountdown, stopAudioPlayback]);

  const loadPage = useCallback(
    async (pageNumber: number) => {
      if (pagesByNumber[pageNumber]) return pagesByNumber[pageNumber];
      const raw = await getBookPage(bookId, pageNumber);
      const rawPageData: PageData = {
        ...raw,
        image: {
          ...raw.image,
          image: resolveImageUrl(raw.image?.image)
        },
        choiceOutcomes: raw.choiceOutcomes
          ? Object.fromEntries(
              Object.entries(raw.choiceOutcomes).map(([option, outcome]) => [
                option,
                {
                  ...outcome,
                  image: {
                    ...outcome.image,
                    image: resolveImageUrl(outcome.image?.image)
                  }
                }
              ])
            )
          : null
      };
      let pageData = rawPageData;

      // If previous page had a dialog choice, apply its selected branch as
      // dynamic media for this next page.
      const previousPage = rawPageData.pageNumber > 1 ? pagesByNumber[rawPageData.pageNumber - 1] : null;
      const selectedChoice = previousPage ? selectedChoiceByPage[previousPage.pageNumber] : null;
      const outcome =
        previousPage && selectedChoice ? previousPage.choiceOutcomes?.[selectedChoice] || null : null;
      if (outcome) {
        pageData = {
          ...rawPageData,
          image: outcome.image || rawPageData.image,
          audio: outcome.audio || rawPageData.audio
        };
      }

      setPagesByNumber((prev) => ({ ...prev, [pageNumber]: pageData }));
      return pageData;
    },
    [bookId, pagesByNumber, resolveImageUrl, selectedChoiceByPage]
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

  const continueAfterChoice = useCallback(() => {
    continueFromChoiceRef.current = true;
    const triggerNext = advancePageRef.current;
    if (triggerNext) {
      void triggerNext();
    }
  }, []);

  const handlePageAudioEnded = useCallback(
    (pageNumber: number) => {
      const pageData = pagesByNumber[pageNumber];
      if (!pageData) return;
      if (pageData.hasDialogChoice && !selectedChoiceByPage[pageNumber]) {
        setDialogPromptPage(pageNumber);
        return;
      }
      startAutoFlipCountdown(() => {
        const triggerNext = advancePageRef.current;
        if (triggerNext) {
          void triggerNext();
        }
      });
    },
    [pagesByNumber, selectedChoiceByPage, startAutoFlipCountdown]
  );

  const advancePage = useCallback(async () => {
    if (isBusy) return;
    stopAudioPlayback();
    clearAutoFlipCountdown();
    const fromChoice = continueFromChoiceRef.current;
    continueFromChoiceRef.current = false;

    if (!fromChoice && state === "open" && focusedPage >= 1) {
      const current = pagesByNumber[focusedPage];
      if (current?.hasDialogChoice && !selectedChoiceByPage[focusedPage]) {
        setDialogPromptPage(focusedPage);
        return;
      }
    }

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
      if (fromChoice) {
        const nextPageData = await loadPage(nextPage);
        const pendingOverride =
          pendingChoiceOverrideRef.current?.pageNumber === nextPage
            ? pendingChoiceOverrideRef.current
            : null;
        const nextAudio = pendingOverride?.audio || nextPageData?.audio || null;
        if (nextAudio?.src) {
          skipNextAutoPageAudioRef.current = nextPage;
          scheduleAudioPlayback(nextAudio, () => {
            handlePageAudioEnded(nextPage);
          }, { overrideDelayMs: 0 });
        }
        pendingChoiceOverrideRef.current = null;
      }
      return;
    }

    setIsBusy(true);
    playPageFlipSound();
    setState("flipping");
    await loadSpread(nextPage);
    setFlipTick((value) => value + 1);
    setFocusedPage(nextPage);
    setDialogPromptPage(null);
    if (fromChoice) {
      const nextPageData = await loadPage(nextPage);
      const pendingOverride =
        pendingChoiceOverrideRef.current?.pageNumber === nextPage
          ? pendingChoiceOverrideRef.current
          : null;
      const nextAudio = pendingOverride?.audio || nextPageData?.audio || null;
      if (nextAudio?.src) {
        skipNextAutoPageAudioRef.current = nextPage;
        scheduleAudioPlayback(nextAudio, () => {
          handlePageAudioEnded(nextPage);
        }, { overrideDelayMs: 0 });
      }
      pendingChoiceOverrideRef.current = null;
    }
    setTimeout(() => {
      setState("open");
      setIsBusy(false);
    }, 600);
  }, [
    clearAutoFlipCountdown,
    finishBook,
    focusedPage,
    handlePageAudioEnded,
    isBusy,
    loadPage,
    loadSpread,
    pagesByNumber,
    playPageFlipSound,
    scheduleAudioPlayback,
    selectedChoiceByPage,
    state,
    stopAudioPlayback,
    totalPages
  ]);

  useEffect(() => {
    advancePageRef.current = advancePage;
  }, [advancePage]);

  useEffect(() => {
    if (state !== "open" || focusedPage < 1) return;
    if (skipNextAutoPageAudioRef.current === focusedPage) {
      skipNextAutoPageAudioRef.current = null;
      return;
    }
    const basePageData = pagesByNumber[focusedPage];
    const override = choiceMediaOverrideByPage[focusedPage];
    const pageData = basePageData
      ? {
          ...basePageData,
          audio: override ? override.audio : basePageData.audio
        }
      : null;
    if (!pageData?.audio) return;

    const run = setTimeout(() => {
      scheduleAudioPlayback(pageData.audio, () => {
        handlePageAudioEnded(pageData.pageNumber);
      });
    }, 0);

    return () => {
      clearTimeout(run);
      stopAudioPlayback();
    };
  }, [advancePage, choiceMediaOverrideByPage, focusedPage, handlePageAudioEnded, pagesByNumber, scheduleAudioPlayback, state, stopAudioPlayback]);

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

  const currentPageData = useMemo(() => {
    const currentPageDataRaw = focusedPage > 0 ? pagesByNumber[focusedPage] : null;
    const currentPageOverride = focusedPage > 0 ? choiceMediaOverrideByPage[focusedPage] : null;
    if (!currentPageDataRaw) return null;
    return {
      ...currentPageDataRaw,
      image: currentPageOverride
        ? { ...currentPageDataRaw.image, image: currentPageOverride.image }
        : currentPageDataRaw.image,
      audio: currentPageOverride ? currentPageOverride.audio : currentPageDataRaw.audio
    };
  }, [choiceMediaOverrideByPage, focusedPage, pagesByNumber]);
  const rightPageNumber = spreadStart + 1 <= totalPages ? spreadStart + 1 : null;
  const rightPageOverride = rightPageNumber ? choiceMediaOverrideByPage[rightPageNumber] : null;
  const displayedRightPageImage = rightPageOverride?.image || rightPageImage;
  const shouldMaskRightPageUntilChoice = Boolean(
    currentPageData?.hasDialogChoice &&
      rightPageNumber &&
      rightPageNumber === focusedPage + 1 &&
      !selectedChoiceByPage[focusedPage]
  );
  const showDialogModal = Boolean(
    currentPageData?.hasDialogChoice &&
      currentPageData?.dialog &&
      dialogPromptPage === focusedPage
  );
  const showReplayButton = autoFlipSecondsLeft !== null && !currentPageData?.hasDialogChoice;
  const pageIndicator = focusedPage > 0 ? `${focusedPage}/${totalPages}` : `Cover/${totalPages}`;

  const restartCurrentPageAudio = useCallback(() => {
    clearAutoFlipCountdown();
    stopAudioPlayback();
    if (focusedPage > 0 && currentPageData?.audio?.src) {
      scheduleAudioPlayback(currentPageData.audio, () => {
        handlePageAudioEnded(currentPageData.pageNumber);
      }, { overrideDelayMs: 0 });
      return;
    }
    if (focusedPage === 0 && coverAudio?.front?.src) {
      scheduleAudioPlayback(coverAudio.front, undefined, { overrideDelayMs: 0 });
    }
  }, [clearAutoFlipCountdown, coverAudio, currentPageData, focusedPage, handlePageAudioEnded, scheduleAudioPlayback, stopAudioPlayback]);

  const handleChoiceSelect = useCallback(
    (option: string) => {
      setSelectedChoiceByPage((prev) => ({ ...prev, [focusedPage]: option }));
      const outcome = currentPageData?.choiceOutcomes?.[option] || null;
      if (outcome && focusedPage + 1 <= totalPages) {
        setChoiceMediaOverrideByPage((prev) => ({
          ...prev,
          [focusedPage + 1]: {
            image: outcome.image.image,
            audio: outcome.audio
          }
        }));
        pendingChoiceOverrideRef.current = {
          pageNumber: focusedPage + 1,
          image: outcome.image.image,
          audio: outcome.audio
        };
      }

      clearAutoFlipCountdown();
      stopAudioPlayback();
      setDialogPromptPage(null);

      continueAfterChoice();
    },
    [
      clearAutoFlipCountdown,
      continueAfterChoice,
      currentPageData?.choiceOutcomes,
      focusedPage,
      stopAudioPlayback,
      totalPages
    ]
  );

  return (
    <main className="screen">
      <section className="panel storyContainer storyPanel">
        {introFade ? <div className="storyIntroOverlay" /> : null}
        {outroFade ? <div className="storyOutroOverlay" /> : null}
        <div className="storyTopBar">
          {isAudioPlaying || isAudioPaused ? (
            <button className="audioControlButton" onClick={toggleAudioPlayback}>
              {isAudioPaused ? "▶ Continue Audio" : "⏸ Pause Audio"}
            </button>
          ) : (
            <span />
          )}
          <div className="pageIndicatorBubble">{pageIndicator}</div>
          <span />
        </div>
        {autoFlipSecondsLeft !== null ? (
          <div className="autoFlipIndicator">
            <span className="autoFlipCircle">{autoFlipSecondsLeft}</span>
          </div>
        ) : null}
        <BookScene
          state={state}
          leftPageImage={leftPageImage}
          rightPageImage={displayedRightPageImage}
          flipTick={flipTick}
          leftPageNumber={spreadStart}
          rightPageNumber={rightPageNumber}
          focusedPage={focusedPage}
          maskRightPageUntilChoice={shouldMaskRightPageUntilChoice}
          frontCoverTitle={bookName}
        />

        <div className="storyControls">
          <p>
            {bookName} - Focus page {focusedPage || 0}/{totalPages}
          </p>
          {showReplayButton ? (
            <button className="menuButton secondaryButton" onClick={restartCurrentPageAudio}>
              Restart Page
            </button>
          ) : null}
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

        {subtitleWords.length > 0 ? (
          <div className="subtitleOverlay">
            <p className="subtitleText">
              {subtitleWords.map((word, index) => {
                const highlighted =
                  index === activeSubtitleWordIndex && word.text.trim().length > 0;
                return (
                  <span
                    key={`${word.start_time}-${index}`}
                    className={highlighted ? "subtitleWordActive" : "subtitleWord"}
                  >
                    {word.text}
                  </span>
                );
              })}
            </p>
          </div>
        ) : null}

        {showDialogModal ? (
          <div className="dialogModalOverlay" onClick={() => setDialogPromptPage(null)}>
            <div className="dialogModalCard" onClick={(event) => event.stopPropagation()}>
              <p className="dialogQuestion">{currentPageData?.dialog?.question}</p>
              <div className="dialogOptions">
                {currentPageData?.dialog?.options.slice(0, 3).map((option) => (
                  <button
                    key={option}
                    className="menuButton secondaryButton"
                    type="button"
                    onClick={() => handleChoiceSelect(option)}
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
