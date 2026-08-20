import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { PreviousTournaments } from "@/components/history/previous-tournaments";
import type { ArchivedTournamentCard } from "@/lib/data/postgres/public-history";

/**
 * KARUZELA POPRZEDNICH TURNIEJOW.
 *
 * Zrodlem prawdy jest archived_at — kliknieciu „Archiwizuj" w panelu
 * odpowiada pojawienie sie karty na stronie glownej.
 */

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function card(
  slug: string,
  title: string,
  heroBannerUrl: string | null = `https://res.cloudinary.com/demo/${slug}.png`
): ArchivedTournamentCard {
  return {
    id: `id-${slug}`,
    slug,
    title,
    heroBannerUrl,
    archivedAt: "2026-01-01T00:00:00.000Z",
  };
}

const three = renderToStaticMarkup(
  <PreviousTournaments
    tournaments={[
      card("rabbit-cup", "Rabbit Cup 2026"),
      card("sun-cup-u8", "SUN CUP U8"),
      card("zimowy-turniej", "Zimowy Turniej", null),
    ]}
  />
);

const carousel = source("components/history/previous-tournaments.tsx");
const page = source("app/page.tsx");

describe("M-X: karty archiwum", () => {
  it("M/N: kazdy zarchiwizowany turniej dostaje jedna karte", () => {
    expect(three.split("data-history-card").length - 1).toBe(3);
    expect(three).toContain("Rabbit Cup 2026");
    expect(three).toContain("SUN CUP U8");
  });

  it("L: pusta historia w ogole nie renderuje sekcji", () => {
    // Strona glowna nie tworzy sekcji, gdy nie ma czego pokazac.
    expect(page).toContain("archived.length > 0 ? (");
    expect(page).not.toContain("Brak poprzednich turniejów");
  });

  it("T: karta pokazuje hero turnieju w proporcji 16:7", () => {
    expect(three).toContain('data-testid="history-card-hero"');
    expect(three).toContain("aspect-[16/7]");
  });

  it("U: brak grafiki daje elegancka karte zapasowa, nie zepsuty obrazek", () => {
    expect(three).toContain('data-testid="history-card-fallback"');
    // Zapas to czysty CSS - zaden nowy plik nie jest potrzebny.
    expect(carousel).toContain("radial-gradient");
  });

  it("V/W/X: cala karta prowadzi do wlasciwego slugu w nowej karcie", () => {
    expect(three).toContain('href="/turnieje/rabbit-cup"');
    expect(three).toContain('href="/turnieje/sun-cup-u8"');
    expect(three).toContain('target="_blank"');
    expect(three).toContain('rel="noopener noreferrer"');

    // CTA zostaje widoczna obietnica, ale klikalna jest cala karta.
    expect(three).toContain("Sprawdź wyniki");
  });

  it("naglowek uzywa prostego jezyka", () => {
    expect(three).toContain("Poprzednie turnieje");
    expect(three).not.toContain("Archiwum");
    expect(three).not.toContain("Historia");
  });
});

describe("Y-AF: zachowanie karuzeli", () => {
  it("Y: strzalki pojawiaja sie tylko wtedy, gdy jest co przewijac", () => {
    expect(carousel).toContain("setCanScroll(node.scrollWidth > node.clientWidth");
    expect(carousel).toContain("{canScroll ? (");
  });

  it("Z/AA: poziomy ruch nalezy do karuzeli, nie do strony", () => {
    // overflow-x siedzi na samej liscie kart.
    expect(carousel).toContain("overflow-x-auto");
    expect(page).not.toContain("overflow-x-hidden");
  });

  it("AB: przewijanie korzysta ze scroll-snap, bez biblioteki", () => {
    expect(carousel).toContain("snap-x");
    expect(carousel).toContain("snap-mandatory");
    expect(carousel).toContain("snap-start");

    // Zero nowej zaleznosci tylko dla karuzeli.
    expect(carousel).not.toContain("embla");
    expect(carousel).not.toContain("swiper");
  });

  it("AC: ograniczony ruch przechodzi na skok zamiast plynnego przewijania", () => {
    expect(carousel).toContain("prefers-reduced-motion: reduce");
    expect(carousel).toContain('behavior: reduced ? "auto" : "smooth"');
    expect(carousel).toContain("motion-reduce:scroll-auto");
  });

  it("AD: karuzela dziala z klawiatura", () => {
    // Karty to linki, strzalki to przyciski z etykietami.
    expect(three).toContain('data-testid="history-card-link"');
    expect(carousel).toContain('aria-label="Przewiń do poprzednich turniejów"');
    expect(carousel).toContain('aria-label="Przewiń do kolejnych turniejów"');
    expect(three).toContain('aria-labelledby="previous-tournaments-title"');
  });

  it("AE: zero autoplay", () => {
    // Rodzic sam decyduje, kiedy przewinac - nic nie rusza sie samo.
    expect(carousel).not.toContain("setInterval");
    expect(carousel).not.toContain("setTimeout");
    expect(carousel.toLowerCase()).not.toContain("autoplay={true}");
  });

  it("AF: hover nie podskakuje ani nie skaluje karty", () => {
    expect(carousel).not.toContain("translateY");
    expect(carousel).not.toContain("hover:scale");
    expect(carousel).toContain("transition-colors");
  });

  it("na telefonie sasiednia karta wystaje zza krawedzi", () => {
    // ~86% szerokosci + padding: widac, ze da sie przesunac.
    expect(carousel).toContain('w-[86%]');
    expect(carousel).toContain("px-4");
  });
});

describe("miejsce sekcji na stronie", () => {
  it("karuzela zamyka strone, juz za sygnatura Powered by", () => {
    const banner = source("components/camp-banner.tsx");
    const historyIndex = banner.indexOf("{previousTournaments}");
    const poweredIndex = banner.indexOf("<PoweredBySection />");

    expect(poweredIndex).toBeGreaterThan(0);
    // Poprzednie turnieje sa najmniej istotne — ida na sam dol.
    expect(historyIndex).toBeGreaterThan(poweredIndex);
  });

  it("sekcja ma oddech przed i po", () => {
    expect(carousel).toContain("mt-16 sm:mt-24");
  });
});
