"use client";

import { CSSProperties } from "react";

type BookState = "closed-front" | "opening" | "open" | "flipping" | "closing" | "closed-back";

export default function BookScene({
  state,
  leftPageImage,
  rightPageImage,
  flipTick,
  leftPageNumber,
  rightPageNumber,
  focusedPage,
  maskRightPageUntilChoice
}: {
  state: BookState;
  leftPageImage: string | null;
  rightPageImage: string | null;
  flipTick: number;
  leftPageNumber: number | null;
  rightPageNumber: number | null;
  focusedPage: number;
  maskRightPageUntilChoice: boolean;
}) {
  const showSpread = state !== "closed-front" && state !== "closed-back";
  const showFront = state === "closed-front" || state === "opening";
  const showBack = state === "closed-back" || state === "closing";
  const isAnimatingOpen = state === "opening";
  const isAnimatingClose = state === "closing";
  const isFlipping = state === "flipping";

  const leftStyle: CSSProperties = leftPageImage
    ? { backgroundImage: `url(${leftPageImage})` }
    : {};
  const rightStyle: CSSProperties = rightPageImage
    ? { backgroundImage: `url(${rightPageImage})` }
    : {};

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
            Narria Storybook
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
