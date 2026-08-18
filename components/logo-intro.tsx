"use client";

import { useEffect, useState } from "react";

/**
 * Krótkie, brandowane intro.
 *
 * KLUCZOWE: to jest wyłącznie warstwa wizualna NAD gotową treścią.
 * Nie blokuje renderowania danych, nie czeka na hero, na API ani na
 * obrazki — poprzedni etap celowo usunął takie sprzężenie i nie wracamy
 * do niego. Overlay znika po ustalonym czasie niezależnie od wszystkiego.
 */

/**
 * Dokladnie 3 spokojne pulsy. Jeden pelny cykl trwa PULSE_CYCLE_MS,
 * wiec calosc to 3 x 580 ms = 1740 ms + 240 ms wygaszenia = ~1,98 s.
 */
const PULSE_CYCLES = 3;
const PULSE_CYCLE_MS = 580;
const FADE_MS = 240;

export function LogoIntro() {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    )?.matches;

    // Przy prefers-reduced-motion intro praktycznie nie istnieje.
    const holdMs = reduced ? 0 : PULSE_CYCLES * PULSE_CYCLE_MS;

    const fadeTimer = window.setTimeout(() => setFading(true), holdMs);
    const hideTimer = window.setTimeout(
      () => setVisible(false),
      holdMs + (reduced ? 0 : FADE_MS)
    );

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      data-testid="logo-intro"
      className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center bg-[var(--ice-base)]"
      style={{
        opacity: fading ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease-out`,
      }}
    >
      <img
        src="/icons/festiwal-logo.png"
        alt=""
        className="h-28 w-auto sm:h-36"
        style={{
          animation: `intro-pulse ${PULSE_CYCLE_MS}ms ease-in-out ${PULSE_CYCLES} both`,
        }}
      />

      <style>{`
        @keyframes intro-pulse {
          0%, 100% { opacity: 0.4; transform: scale(0.97); }
          50%      { opacity: 1;   transform: scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-testid="logo-intro"] img { animation: none !important; opacity: 1; }
        }
      `}</style>
    </div>
  );
}
