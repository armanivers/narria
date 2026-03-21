"use client";

import { CSSProperties } from "react";

type BookState = "closed-front" | "opening" | "open" | "flipping" | "closing" | "closed-back";

export default function BookScene({
  state,
  leftPageImage,
  rightPageImage,
  flipTick
}: {
  state: BookState;
  leftPageImage: string | null;
  rightPageImage: string | null;
  flipTick: number;
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
            <div className="book2dPage book2dLeft" style={leftStyle} />
            <div className="book2dSpine" />
            <div className="book2dPage book2dRight" style={rightStyle} />
            {isFlipping ? (
              <div key={flipTick} className="book2dSlidePage" style={rightStyle} />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
