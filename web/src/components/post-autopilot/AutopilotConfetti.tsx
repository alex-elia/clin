"use client";

import { useEffect, useState } from "react";

const PIECE_COUNT = 56;

type AutopilotConfettiProps = {
  /** Rising edge triggers a burst */
  active: boolean;
};

export function AutopilotConfetti({ active }: AutopilotConfettiProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const t = window.setTimeout(() => setVisible(false), 3200);
    return () => window.clearTimeout(t);
  }, [active]);

  if (!visible) return null;

  return (
    <div className="clin-confetti-burst" aria-hidden>
      {Array.from({ length: PIECE_COUNT }, (_, i) => (
        <span
          key={i}
          className="clin-confetti-piece"
          style={{ ["--i" as string]: String(i) }}
        />
      ))}
    </div>
  );
}
