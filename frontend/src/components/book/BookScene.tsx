"use client";

import { CSSProperties, useEffect, useState } from "react";

type BookState = "closed-front" | "opening" | "open" | "flipping" | "closing" | "closed-back";

/**
 * Returns `url` only after a successful preload; on load error or empty URL, returns null
 * so the page stays blank (no broken image flash).
 */
function useSafeBackgroundUrl(url: string | null): string | null {
  const [readyUrl, setReadyUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!url?.trim()) {
      setReadyUrl(null);
      return;
    }
    setReadyUrl(null);
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setReadyUrl(url);
    };
    img.onerror = () => {
      if (!cancelled) setReadyUrl(null);
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);

  return readyUrl;
}

export default function BookScene({
  state,
  leftPageImage,
  rightPageImage,
  flipTick,
  leftPageNumber,
  rightPageNumber,
  focusedPage,
  maskRightPageUntilChoice,
  frontCoverTitle
}: {
  state: BookState;
  leftPageImage: string | null;
  rightPageImage: string | null;
  flipTick: number;
  leftPageNumber: number | null;
  rightPageNumber: number | null;
  focusedPage: number;
  maskRightPageUntilChoice: boolean;
  frontCoverTitle: string;
}) {
  const showSpread = state !== "closed-front" && state !== "closed-back";
  const showFront = state === "closed-front" || state === "opening";
  const showBack = state === "closed-back" || state === "closing";
  const isAnimatingOpen = state === "opening";
  const isAnimatingClose = state === "closing";
  const isFlipping = state === "flipping";

  const leftBgUrl = useSafeBackgroundUrl(leftPageImage);
  const rightBgUrl = useSafeBackgroundUrl(rightPageImage);

  const leftStyle: CSSProperties = leftBgUrl ? { backgroundImage: `url(${leftBgUrl})` } : {};
  const rightStyle: CSSProperties = rightBgUrl ? { backgroundImage: `url(${rightBgUrl})` } : {};

  const focusLeft = focusedPage === leftPageNumber;
  const focusRight = focusedPage === rightPageNumber;

  return (
    <div className="book2dStage">
      <div
        className={`book2d ${
          isAnimatingOpen ? "book2dOpening" : isAnimatingClose ? "book2dClosing" : ""
        } ${showBack ? "book2dBack" : ""}`}
      >
        {showFront ? (
          <div className={`book2dCoverFront ${state === "opening" ? "book2dCoverOpening" : ""}`}>
            {frontCoverTitle || "Narria Storybook"}
          </div>
        ) : null}
        {showBack ? <div className="book2dCoverBack">The End</div> : null}

        {showSpread ? (
          <div className="book2dSpread">
            <div className={`book2dPage book2dLeft ${focusLeft ? "book2dFocus" : "book2dDim"}`} style={leftStyle}>
              {leftPageNumber ? <span className="book2dPageBadge">Page {leftPageNumber}</span> : null}
            </div>
            <div className="book2dSpine" />
            <div
              className={`book2dPage book2dRight ${focusRight ? "book2dFocus" : "book2dDim"}`}
              style={rightStyle}
            >
              {rightPageNumber ? <span className="book2dPageBadge">Page {rightPageNumber}</span> : null}
              <div
                className={`book2dChoiceMask ${
                  maskRightPageUntilChoice ? "book2dChoiceMaskVisible" : "book2dChoiceMaskHidden"
                }`}
              >
                <span className="book2dChoiceMaskIcon">?</span>
              </div>
            </div>
            {isFlipping ? (
              <div key={flipTick} className="book2dSlidePage" style={rightStyle} />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
