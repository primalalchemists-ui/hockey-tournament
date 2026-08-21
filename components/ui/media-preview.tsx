"use client";

import { useState } from "react";

/**
 * PODGLĄD GRAFIKI O STAŁEJ WYSOKOŚCI.
 *
 * Podmiana bannera wyglądała tak: stary obrazek znikał, kontener zwijał się
 * do zera, sekcje pod spodem podskakiwały w górę, a po chwili wszystko
 * wracało na miejsce. Przy plakacie 4:6 skok sięgał kilkuset pikseli.
 *
 * Trzy decyzje temu zapobiegają:
 *
 * 1. WYSOKOŚĆ WYNIKA Z POLA, NIE Z PLIKU — proporcje deklaruje `ratio`,
 *    więc miejsce jest znane, zanim cokolwiek się wczyta. Ten sam wymiar
 *    obowiązuje w stanie pustym, w trakcie ładowania i po załadowaniu.
 *
 * 2. STARY OBRAZEK ZOSTAJE, DOPÓKI NOWY NIE JEST GOTOWY — leży warstwę
 *    niżej. Kadr nigdy nie bieleje między jednym plikiem a drugim.
 *
 * 3. LOADER MIESZKA W TYM SAMYM PUDEŁKU — nie dokłada wysokości.
 *
 * Bez `useEffect`: jedyne przejście stanu to zdarzenie `load` obrazka.
 */

type MediaPreviewProps = {
  src?: string;
  alt: string;
  /** Proporcje pola, np. "16/6" dla bannera, "4/6" dla plakatu. */
  ratio: string;
  /** Tekst w pustym polu — ten sam kadr, tylko bez pliku. */
  emptyLabel: string;
  /** `contain` dla dokumentów i logotypów, `cover` dla banerów. */
  fit?: "cover" | "contain";
  className?: string;
  testId?: string;
};

export function MediaPreview({
  src,
  alt,
  ratio,
  emptyLabel,
  fit = "cover",
  className,
  testId = "media-preview",
}: MediaPreviewProps) {
  /** Ostatni plik, który naprawdę się wczytał — czyli to, co widać teraz. */
  const [ready, setReady] = useState<string | null>(null);

  const isLoading = Boolean(src) && ready !== src;
  // Nazwa klasy musi byc dostrzegalna dla Tailwinda, wiec bez sklejania.
  const objectFit = fit === "contain" ? "object-contain" : "object-cover";
  const showsPrevious = Boolean(ready) && ready !== src;

  return (
    <span
      data-testid={testId}
      data-loading={isLoading ? "true" : "false"}
      className={[
        "relative block overflow-hidden rounded-3xl",
        src
          ? "ice-surface"
          : "flex items-center justify-center border border-dashed border-slate-300 bg-slate-50",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      /* Rezerwacja miejsca — wysokość znana przed pobraniem czegokolwiek. */
      style={{ aspectRatio: ratio }}
    >
      {!src ? (
        <span className="px-3 text-center text-sm font-medium text-slate-500">
          {emptyLabel}
        </span>
      ) : (
        <>
          {showsPrevious ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={ready ?? ""}
              alt=""
              aria-hidden="true"
              className={`absolute inset-0 h-full w-full ${objectFit}`}
            />
          ) : null}

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={src}
            src={src}
            alt={alt}
            onLoad={() => setReady(src)}
            /*
              Błąd też kończy ładowanie. Inaczej zepsuty adres zostawiłby
              loader kręcący się w nieskończoność.
            */
            onError={() => setReady(src)}
            className={[
              `absolute inset-0 h-full w-full ${objectFit}`,
              "transition-opacity duration-200 ease-out motion-reduce:transition-none",
              isLoading ? "opacity-0" : "opacity-100",
            ].join(" ")}
          />

          {isLoading ? (
            <span
              aria-hidden="true"
              data-testid="media-preview-loader"
              className="absolute inset-0 flex items-center justify-center bg-[var(--ice-base)]/70"
            >
              {/*
                Ten sam znak ładowania co na granicy trasy publicznej, tylko
                w skali podglądu. Osobny spinner znaczyłby drugi język
                wizualny dla tej samej czynności.
              */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/icons/festiwal-logo.png"
                alt=""
                className="media-preview-pulse h-8 w-auto opacity-60"
              />
            </span>
          ) : null}
        </>
      )}
    </span>
  );
}
