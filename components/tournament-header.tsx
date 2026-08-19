"use client";

import Image from "next/image";
import type { Scorer, Team } from "@/types/tournament";
import { TopScorerTicker } from "@/components/top-scorer-ticker";
import { resolveHeroPresentation } from "@/lib/public/hero";
import { describeMatchProgress } from "@/lib/public/match-progress";
import { CelebrationButton } from "@/components/celebration-cta";
import type { CelebrationCta } from "@/lib/public/celebration";

type TournamentHeaderProps = {
  title: string;
  scorers: Scorer[];
  teams: Team[];
  heroBannerImage?: string;
  tickerMessage?: string;
  showTopScorerTicker?: boolean;
  /** Rośnie po każdym udanym auto-odświeżeniu — wyzwala mikro-puls. */
  refreshTick?: number;
  /**
   * Planowana liczba meczów CAŁEGO turnieju — łącznie z fazą pucharową
   * i minigrupą, które w bazie pojawią się dopiero po zamknięciu grup.
   */
  plannedMatchCount: number;
  /** Ile meczów ma już wynik — licznik po lewej stronie ukośnika. */
  playedMatchCount: number;
  /**
   * Stan przycisku w hero. Po zakończeniu turnieju TEN SAM slot prowadzi
   * do celebracji zamiast do wyników — bez dokładania drugiego przycisku.
   */
  cta: CelebrationCta;
};

function matchesWord(count: number) {
  if (count === 1) return "mecz";

  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;

  if (lastTwoDigits >= 12 && lastTwoDigits <= 14) {
    return "meczów";
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return "mecze";
  }

  return "meczów";
}

export function TournamentHeader({
  title,
  scorers,
  teams,
  heroBannerImage,
  tickerMessage,
  showTopScorerTicker,
  refreshTick = 0,
  plannedMatchCount,
  playedMatchCount,
  cta,
}: TournamentHeaderProps) {
  const hero = resolveHeroPresentation(heroBannerImage);

  /*
    Badge pokazuje POSTĘP turnieju: rozegrane / zaplanowane.

    Mianownik pochodzi z konfiguracji (drabinka i minigrupa są w nim
    od pierwszej sekundy, choć w bazie pojawią się później), licznik —
    wyłącznie z meczów, które naprawdę mają wynik. Sama liczba planowana
    czytała się po zakończeniu jak rozmiar wydarzenia, a nie jego stan.
  */
  const progress = describeMatchProgress({
    played: playedMatchCount,
    planned: plannedMatchCount,
  });

  const plannedMatchesLabel = matchesWord(progress.planned);

  /*
    CAŁY nagłówek wchodzi JEDNYM ruchem (.ice-rise).
    Poprzednio każdy element miał własne opóźnienie i po intro strona
    „składała się” na oczach kibica — świadomie usunięte.
  */
  return (
    <header className="ice-rise space-y-6 md:mb-4">
      <TopScorerTicker
        scorers={scorers}
        teams={teams}
        tickerMessage={tickerMessage}
        showTopScorerTicker={showTopScorerTicker}
      />

      <div className="flex flex-row items-center justify-between gap-4 px-3 sm:px-0">
        <div className="ice-surface inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold text-slate-600 md:px-4 md:py-2">
          <span className="relative flex h-2.5 w-2.5">
            <span
              aria-hidden="true"
              className="live-ping absolute inline-flex h-full w-full rounded-full bg-red-400"
            />

            <span
              key={refreshTick}
              data-testid="live-dot"
              className={[
                "relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500",
                // Jeden krótki puls PO zastosowaniu świeżych danych.
                // Bez toastów, bez tekstu, bez zmiany layoutu.
                refreshTick > 0 ? "live-pulse" : "",
              ].join(" ")}
            />
          </span>

          Wyniki Live
        </div>

        <div className="rounded-full border border-white/20 bg-slate-950/60 px-2 py-1 text-center text-xs font-semibold text-white shadow-lg backdrop-blur-md sm:px-5 sm:text-sm">
          🏒{" "}
          <span
            data-testid="match-progress"
            data-complete={progress.isComplete ? "true" : "false"}
            className="stat-num"
          >
            <span
              data-testid="played-match-count"
              className={
                progress.isComplete ? "text-emerald-300" : "text-white"
              }
            >
              {progress.played}
            </span>
            <span className="mx-0.5 text-white/40">/</span>
            <span data-testid="planned-match-count" className="text-amber-300">
              {progress.planned}
            </span>
          </span>{" "}
          {plannedMatchesLabel}
          {/* Komplet rozegrany — drobny znacznik, nie drugi komunikat. */}
          {progress.isComplete ? (
            <span
              aria-hidden="true"
              data-testid="match-progress-complete"
              className="ml-1 text-emerald-300"
            >
              ✓
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-4">
          <a
            href="https://www.instagram.com/festiwal_hokeja/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-white/70"
          >
            <Image
              src="/icons/instagram.svg"
              alt="Instagram"
              width={30}
              height={30}
            />
          </a>

          <a
            href="https://www.facebook.com/festiwalhokeja"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-white/70"
          >
            <Image
              src="/icons/facebook.svg"
              alt="Facebook"
              width={30}
              height={30}
            />
          </a>
        </div>
      </div>

      {/*
        HERO — pełnowymiarowy banner turnieju.

        Świadomy powrót: wersja z „contain + rozmyte tło" pokazywała
        pomniejszony obrazek w ramce, zamiast bannera. Grafiki turniejowe
        są projektowane pod ten kadr, więc wypełniamy go w całości
        na każdym breakpoincie. Proporcje są stałe → zero layout shift.
      */}
      <div
        data-testid="hero"
        className="relative overflow-hidden border-y border-slate-200 shadow-[0_20px_60px_-20px_rgba(15,23,42,0.25)] sm:my-10 sm:border-x md:m-0"
      >
        <div className="relative aspect-[16/7] w-full">
          <Image
            src={hero.src}
            alt={title}
            fill
            priority
            /*
              Banner niesie stylizowany tekst, więc domyślna kompresja
              optymalizatora (q75) zauważalnie go zmiękczała — zwłaszcza
              że grafika przechodzi już przez Cloudinary, czyli drugie
              kodowanie stratne. Wysoka jakość + realny opis szerokości
              daje ostry kadr na telefonie i na desktopie.
            */
            quality={95}
            sizes="(min-width: 1400px) 1400px, 100vw"
            data-testid="hero-foreground"
            className="object-cover"
          />

          <div className="absolute inset-0 bg-black/15" aria-hidden="true" />

          {/*
            Jeden slot, dwie funkcje: przed zakończeniem prowadzi do
            wyników, po zakończeniu do klasyfikacji końcowej. Na telefonie
            hero jest za wysoko, żeby to odkryć — tam CTA stoi przy Rankingu.
          */}
          <div className="absolute inset-0 hidden items-end justify-center pb-12 md:flex">
            <CelebrationButton
              cta={cta}
              className={
                cta.kind === "celebration"
                  ? "px-8 text-lg shadow-xl"
                  : "bg-white px-8 text-lg text-slate-900 shadow-xl hover:bg-slate-100"
              }
            />
          </div>
        </div>
      </div>
    </header>
  );
}
