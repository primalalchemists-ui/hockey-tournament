"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type EdgeScrollerProps = {
  children: React.ReactNode;
  /** Etykieta dla czytników ekranu; kontener jest fokusowalny. */
  label: string;
  className?: string;
};

/**
 * Poziomy scroller z CZYSTĄ krawędzią.
 *
 * Problem: przy swobodnym przewijaniu na telefonie na prawym brzegu
 * zostawała połówka cyfry z następnej kolumny — wyglądało to jak błąd,
 * a nie jak „jest tu więcej treści".
 *
 * Rozwiązanie: maska wygasza dokładnie tę krawędź, przy której jest
 * jeszcze zawartość, i znika, gdy dojedziemy do końca — wtedy ostatnia
 * kolumna jest w pełni ostra. Żadne dane nie są chowane na stałe.
 */
export function EdgeScroller({ children, label, className }: EdgeScrollerProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  const measure = useCallback(() => {
    const node = ref.current;
    if (!node) return;

    const max = node.scrollWidth - node.clientWidth;

    // 1 px tolerancji — przeglądarki potrafią zwrócić ułamki.
    setAtStart(node.scrollLeft <= 1);
    setAtEnd(max <= 1 || node.scrollLeft >= max - 1);
  }, []);

  useEffect(() => {
    measure();

    const node = ref.current;
    if (!node) return;

    node.addEventListener("scroll", measure, { passive: true });

    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(node);

    return () => {
      node.removeEventListener("scroll", measure);
      observer?.disconnect();
    };
  }, [measure]);

  const fade = [
    atStart ? "" : "fade-start",
    atEnd ? "" : "fade-end",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={ref}
      role="region"
      aria-label={label}
      tabIndex={0}
      data-testid="edge-scroller"
      data-at-start={atStart}
      data-at-end={atEnd}
      className={["ice-scroll edge-scroller overflow-x-auto", fade, className]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
