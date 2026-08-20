"use client";

import { useEffect, useRef, useState } from "react";

/**
 * PRZEJŚCIE MIĘDZY GRUPAMI — cała tabela jako jeden blok.
 *
 * Klik „Grupa B" przestawiał wiersze natychmiast: drużyny przeskakiwały
 * między pozycjami, bo dwie różne tabele mają różne składy i różną
 * kolejność. Zamiast animować pojedyncze wiersze (stagger, FLIP, sprężyny —
 * ciężkie i rozpraszające) traktujemy CAŁY blok wyników jak jedną treść:
 * gaśnie, podmienia się i wraca.
 *
 * Model jest prezentacyjny: domena zmienia się natychmiast, opóźniona jest
 * wyłącznie treść pokazywana na ekranie.
 */

/** Wygaszenie starej treści. */
export const GROUP_FADE_OUT_MS = 120;
/**
 * Wejście nowej treści.
 *
 * Dłuższe niż wyjście i dłuższe niż w pierwszej wersji: przy 200 ms zmiana
 * nadal czytała się jak podmiana DOM-u. Wejście ma być tym momentem, który
 * widać.
 */
export const GROUP_FADE_IN_MS = 260;
/** Delikatne uniesienie przy wejściu. */
export const GROUP_RISE_PX = 7;

export type GroupTransitionPhase = "idle" | "out" | "in";

/**
 * Rozdziela grupę WYBRANĄ od grupy POKAZYWANEJ.
 *
 * Przycisk reaguje natychmiast (użytkownik widzi, co kliknął), a treść
 * zmienia się dopiero po wygaszeniu — dzięki temu nie widać przeskoku
 * wierszy.
 */
export function useGroupTransition(requestedKey: string | undefined) {
  const [displayedKey, setDisplayedKey] = useState(requestedKey);
  const [phase, setPhase] = useState<GroupTransitionPhase>("idle");

  const timers = useRef<number[]>([]);
  const reducedRef = useRef(false);

  useEffect(() => {
    reducedRef.current = Boolean(
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
    );
  }, []);

  useEffect(() => {
    if (requestedKey === displayedKey) return;

    /*
      Szybkie klikanie A → B → A nie może zostawić widoku w połowie animacji
      ani na złej grupie: przy każdej zmianie kasujemy poprzednie liczniki
      i planujemy przejście do NAJNOWSZEGO wyboru.
    */
    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current = [];

    // Bez ruchu przejście trwa zero — podmiana jest natychmiastowa.
    const outMs = reducedRef.current ? 0 : GROUP_FADE_OUT_MS;
    const inMs = reducedRef.current ? 0 : GROUP_FADE_IN_MS;

    /*
      Każdy krok fazy jest planowany, także pierwszy. Dzięki temu efekt nie
      zmienia stanu synchronicznie w swoim ciele, a zachowanie jest
      identyczne — „out" wchodzi w następnej klatce.
    */
    timers.current.push(
      window.setTimeout(() => {
        if (!reducedRef.current) setPhase("out");
      }, 0),
      window.setTimeout(() => {
        setDisplayedKey(requestedKey);
        setPhase(reducedRef.current ? "idle" : "in");
      }, outMs),
      window.setTimeout(() => {
        setPhase("idle");
      }, outMs + inMs)
    );
  }, [requestedKey, displayedKey]);

  useEffect(() => {
    return () => {
      for (const timer of timers.current) window.clearTimeout(timer);
      timers.current = [];
    };
  }, []);

  return { displayedKey, phase };
}

/**
 * Opakowanie treści zależnej od grupy.
 *
 * Obejmuje CAŁY blok (ranking, matryca wyników, sekcje pucharowe), żeby nie
 * powstał efekt „ranking animowany, matryca skacze".
 */
export function GroupTransition({
  phase,
  contentKey,
  children,
}: {
  phase: GroupTransitionPhase;
  /** Klucz pokazywanej treści — wymusza odtworzenie animacji wejścia. */
  contentKey?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [minHeight, setMinHeight] = useState<number | null>(null);


  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (phase === "out") {
      /*
        Grupy mogą mieć różną liczbę drużyn. Podłoga wysokości na czas
        wygaszania zapobiega zapadnięciu się strony; zdejmujemy ją razem
        z wejściem nowej treści, więc kontener wraca do wysokości naturalnej.
      */
      setMinHeight(node.getBoundingClientRect().height);
      return;
    }

    if (phase === "idle") setMinHeight(null);
  }, [phase]);

  return (
    <div
      ref={ref}
      data-testid="group-transition"
      data-phase={phase}
      /*
        DLACZEGO WEJŚCIE NAPRAWDĘ WIDAĆ.

        Gdyby nowa treść dostała od razu klasy stanu końcowego, przeglądarka
        nie miałaby czego animować — zobaczylibyśmy gotową tabelę. Dlatego
        wejście jest ANIMACJĄ (`@keyframes`), a nie przejściem: klatka `from`
        z `opacity: 0` i przesunięciem istnieje niezależnie od tego, co było
        wcześniej w DOM-ie, więc start jest gwarantowany.

        Klucz na elemencie zmienia się razem z pokazywaną grupą, więc React
        tworzy świeży węzeł i animacja startuje od klatki zerowej także wtedy,
        gdy poprzednia jeszcze trwała. Przy zwykłym odświeżeniu danych klucz
        się nie zmienia — nic się nie przemontowuje.
      */
      key={contentKey}
      className={phase === "in" ? "group-enter" : undefined}
      style={{
        minHeight: minHeight ?? undefined,
        opacity: phase === "out" ? 0 : 1,
        transform: phase === "out" ? "translateY(-2px)" : undefined,
        transition:
          phase === "out"
            ? `opacity ${GROUP_FADE_OUT_MS}ms ease-out, transform ${GROUP_FADE_OUT_MS}ms ease-out`
            : undefined,
      }}
    >
      {children}
    </div>
  );
}
