"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

import {
  findCategory,
  pickReadableTextColor,
  shouldShowSwitcher,
  type CategoryLike,
} from "@/lib/public/tournament-collection";

/**
 * PRZEŁĄCZNIK KATEGORII — pływający bąbelek.
 *
 * Kilka technicznie osobnych turniejów tworzy jedno wydarzenie, więc kibic
 * przechodzi między nimi bez opuszczania strony. To WYŁĄCZNIE lokalny wybór
 * bieżącej sesji: nie zmienia turnieju wyświetlanego globalnie, nie zapisuje
 * się nigdzie i znika po odświeżeniu strony.
 */

type CategorySwitcherProps = {
  categories: CategoryLike[];
  selectedTournamentId: string | null;
  isSwitching: boolean;
  onSelect: (tournamentId: string) => void;
  /** Komunikat po nieudanej zmianie; znika przy kolejnej próbie. */
  error: string | null;
  /**
   * DWA MIEJSCA, JEDEN KOMPONENT.
   *
   * "inline"   — płaska kapsułka w górnym pasku, obok „Wyniki Live";
   *              na desktopie nic nie musi pływać nad treścią.
   * "floating" — bąbelek przy prawej krawędzi, nad dolną krawędzią ekranu;
   *              na telefonie to jedyne miejsce w zasięgu kciuka, które
   *              nie walczy o przestrzeń z tabelą ani z „Udostępnij".
   *
   * Tylko jeden wariant jest widoczny na danej szerokości — drugi znika
   * przez `display: none`, więc nie istnieje też dla czytnika ekranu.
   */
  variant?: "inline" | "floating";
};

export function CategorySwitcher({
  categories,
  selectedTournamentId,
  isSwitching,
  onSelect,
  error,
  variant = "floating",
}: CategorySwitcherProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const bubbleRef = useRef<HTMLButtonElement | null>(null);
  const popoverId = useId();

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      const node = wrapperRef.current;
      if (node && !node.contains(event.target as Node)) setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;

      setOpen(false);
      // Po zamknięciu focus wraca tam, skąd przyszedł.
      bubbleRef.current?.focus();
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!shouldShowSwitcher(categories)) return null;

  const selected = findCategory(categories, selectedTournamentId);
  if (!selected) return null;

  const tone = pickReadableTextColor(selected.bubbleColor);
  const isFloating = variant === "floating";

  return (
    <div
      ref={wrapperRef}
      data-testid="category-switcher"
      data-variant={variant}
      className={
        isFloating
          ? /*
              Kciuk sięga tu bez zmiany chwytu, a wysokość nad dolną krawędzią
              omija pasek przeglądarki i nie zasłania ostatniego wiersza tabeli.
            */
            "fixed right-4 z-30 md:hidden"
          : "relative hidden md:inline-flex"
      }
      style={
        isFloating
          ? { bottom: "calc(5.25rem + env(safe-area-inset-bottom, 0px))" }
          : undefined
      }
    >
      {open ? (
        <div
          role="listbox"
          id={popoverId}
          aria-label="Kategorie turnieju"
          data-testid="category-popover"
          /*
            Bąbelek stoi przy dolnej krawędzi, więc lista rośnie W GÓRĘ.
            Kapsułka w nagłówku ma miejsce pod sobą, więc otwiera się w dół.
            Przy większej liczbie kategorii lista dostaje własny scroll
            zamiast wychodzić poza ekran.
          */
          className={[
            "ice-scroll ice-surface absolute right-0 z-10 max-h-[60vh] w-56 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl p-2 shadow-xl motion-safe:animate-[category-pop_140ms_ease-out]",
            isFloating ? "bottom-full mb-2" : "top-full mt-2",
          ].join(" ")}
        >
          <p className="px-2 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Kategorie turnieju
          </p>

          {categories.map((category) => {
            const isSelected = category.tournamentId === selected.tournamentId;

            return (
              <button
                key={category.tournamentId}
                type="button"
                role="option"
                aria-selected={isSelected}
                aria-current={isSelected ? "true" : undefined}
                disabled={isSwitching}
                data-testid="category-option"
                onClick={() => {
                  setOpen(false);
                  if (!isSelected) onSelect(category.tournamentId);
                }}
                className={[
                  "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition-colors",
                  isSelected
                    ? "bg-slate-100 font-semibold text-slate-900"
                    : "text-slate-700 hover:bg-slate-50",
                ].join(" ")}
              >
                {/* Neutralne menu, kolor wyłącznie jako akcent kategorii. */}
                <span
                  aria-hidden="true"
                  className="h-3 w-3 shrink-0 rounded-full border border-black/10"
                  style={{ background: category.bubbleColor }}
                />

                <span className="min-w-0 flex-1 truncate">{category.label}</span>

                {isSelected ? (
                  <Check size={14} aria-hidden="true" className="shrink-0" />
                ) : null}
              </button>
            );
          })}

        </div>
      ) : null}

      {/*
        KOMUNIKAT ŻYJE POZA LISTĄ.

        Wybór kategorii zamyka listę natychmiast, więc błąd schowany w środku
        znikał razem z nią i kibic nie dowiadywał się, dlaczego turniej się
        nie zmienił. Element jest pozycjonowany absolutnie, żeby pojawienie
        się komunikatu nie przesunęło ani paska, ani bąbelka.
      */}
      {error ? (
        <p
          role="status"
          data-testid="category-error"
          className={[
            "ice-surface absolute right-0 z-20 w-56 max-w-[calc(100vw-2rem)] rounded-2xl px-3 py-2 text-xs font-semibold text-rose-700 shadow-lg",
            isFloating ? "bottom-full mb-2" : "top-full mt-2",
          ].join(" ")}
        >
          {error}
        </p>
      ) : null}

      <button
        ref={bubbleRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        aria-label={`Zmień kategorię turnieju. Aktualnie ${selected.label}`}
        data-testid="category-bubble"
        data-tone={tone}
        /*
          Kapsułka, nie koło: etykieta może mieć 2 znaki albo 8, więc szerokość
          wynika z treści, a `min-w` pilnuje sensownego minimum.

          Na desktopie pasek jest płaski i kapsułka musi mu odpowiadać
          wysokością; na telefonie bąbelek ma pełny cel dotyku.
        */
        className={[
          "category-bubble flex items-center justify-center gap-1.5 rounded-full font-bold",
          isFloating
            ? "h-11 min-w-[3.75rem] px-4 text-sm"
            : "h-8 min-w-[3.25rem] px-3 text-xs",
          tone === "dark" ? "text-slate-900" : "text-white",
        ].join(" ")}
        style={{ background: selected.bubbleColor }}
      >
        <span className="truncate">{selected.label}</span>

        <ChevronDown
          size={isFloating ? 14 : 12}
          aria-hidden="true"
          className={isSwitching ? "opacity-40" : "opacity-70"}
        />
      </button>
    </div>
  );
}
