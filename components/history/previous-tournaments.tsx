"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import type { ArchivedTournamentCard } from "@/lib/data/postgres/public-history";

/**
 * POPRZEDNIE TURNIEJE — portfolio wydarzeń.
 *
 * Świadomie bez biblioteki: `scroll-snap` robi tu całą robotę, a strzałki
 * są zwykłymi przyciskami przesuwającymi kontener. Zero autoplay —
 * rodzic sam decyduje, kiedy przewinąć.
 *
 * Przewijanie w poziomie należy WYŁĄCZNIE do tego kontenera; strona
 * nigdy nie dostaje własnego paska.
 */

type PreviousTournamentsProps = {
  tournaments: ArchivedTournamentCard[];
};

export function PreviousTournaments({ tournaments }: PreviousTournamentsProps) {
  const trackRef = useRef<HTMLUListElement | null>(null);
  const [canScroll, setCanScroll] = useState(false);

  /*
    Strzałki pojawiają się dopiero wtedy, gdy jest co przewijać. Przy jednej
    czy dwóch kartach mieszczących się w kadrze byłyby tylko ozdobą.
  */
  useEffect(() => {
    const node = trackRef.current;
    if (!node) return;

    function measure() {
      if (!node) return;
      setCanScroll(node.scrollWidth > node.clientWidth + 8);
    }

    measure();

    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);

    observer?.observe(node);

    return () => observer?.disconnect();
  }, [tournaments.length]);

  function scrollByCards(direction: -1 | 1) {
    const node = trackRef.current;
    if (!node) return;

    const card = node.querySelector<HTMLElement>("[data-history-card]");
    const step = card ? card.offsetWidth + 16 : node.clientWidth * 0.8;

    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    )?.matches;

    node.scrollBy({
      left: step * direction,
      // Bez ruchu: skok zamiast płynnego przewijania.
      behavior: reduced ? "auto" : "smooth",
    });
  }

  return (
    <section
      data-testid="previous-tournaments"
      aria-labelledby="previous-tournaments-title"
      className="mt-16 sm:mt-24"
    >
      <div className="flex items-end justify-between gap-3 px-4 sm:px-0">
        <h2
          id="previous-tournaments-title"
          className="section-title text-slate-900"
        >
          Poprzednie turnieje
        </h2>

        {canScroll ? (
          <div data-testid="history-controls" className="hidden gap-2 sm:flex">
            <button
              type="button"
              aria-label="Przewiń do poprzednich turniejów"
              onClick={() => scrollByCards(-1)}
              className="btn btn-quiet h-10 w-10 justify-center p-0"
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Przewiń do kolejnych turniejów"
              onClick={() => scrollByCards(1)}
              className="btn btn-quiet h-10 w-10 justify-center p-0"
            >
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>

      <ul
        ref={trackRef}
        data-testid="history-track"
        className="edge-scroller mt-5 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-4 pb-2 motion-reduce:scroll-auto sm:px-0"
      >
        {tournaments.map((tournament) => (
          <HistoryCard key={tournament.id} tournament={tournament} />
        ))}
      </ul>
    </section>
  );
}

function HistoryCard({ tournament }: { tournament: ArchivedTournamentCard }) {
  return (
    <li
      data-history-card
      className="w-[86%] shrink-0 snap-start sm:w-[22rem] lg:w-[24rem]"
    >
      <a
        data-testid="history-card-link"
        href={`/turnieje/${tournament.slug}`}
        target="_blank"
        rel="noopener noreferrer"
        className="group ice-card block overflow-hidden transition-colors hover:border-slate-300"
      >
        <div className="relative aspect-[16/7] w-full overflow-hidden bg-slate-900">
          {tournament.heroBannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tournament.heroBannerUrl}
              alt=""
              loading="lazy"
              data-testid="history-card-hero"
              className="h-full w-full object-cover"
            />
          ) : (
            <div
              data-testid="history-card-fallback"
              className="flex h-full w-full items-center justify-center bg-[radial-gradient(120%_120%_at_50%_0%,#1e293b_0%,#0b1220_70%)]"
            >
              <span
                aria-hidden="true"
                className="text-3xl font-black uppercase tracking-[0.2em] text-white/15"
              >
                {tournament.title.slice(0, 3)}
              </span>
            </div>
          )}

          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/85 to-transparent px-4 pb-3 pt-10">
            <p className="truncate text-sm font-bold text-white sm:text-base">
              {tournament.title}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm font-semibold text-slate-700 transition-colors group-hover:text-slate-900">
            Sprawdź wyniki
          </span>
          <ChevronRight
            size={16}
            aria-hidden="true"
            className="text-slate-400 transition-colors group-hover:text-slate-600"
          />
        </div>
      </a>
    </li>
  );
}
