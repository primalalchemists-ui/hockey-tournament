import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { TournamentHeader } from "@/components/tournament-header";
import {
  HERO_FALLBACK_IMAGE,
  resolveHeroPresentation,
} from "@/lib/public/hero";

/**
 * HERO — grafika turnieju nie może ani blokować treści, ani być
 * przycinana w ciemno na wąskim ekranie.
 */

const CUSTOM_HERO = "https://res.cloudinary.com/demo/image/upload/hero.png";

/** Stan sprzed zakończenia turnieju: hero prowadzi do wyników. */
const RESULTS_CTA = {
  kind: "results" as const,
  label: "Sprawdź wyniki",
  shine: false,
  targetId: "results-section",
  cinematic: false,
};

function renderHeader(heroBannerImage?: string) {
  return renderToStaticMarkup(
    <TournamentHeader
      title="Turniej"
      scorers={[]}
      teams={[]}
      heroBannerImage={heroBannerImage}
      plannedMatchCount={0}
      playedMatchCount={0}
      cta={RESULTS_CTA}
    />
  );
}

describe("hero — przygotowanie grafiki", () => {
  it("A: przy własnej grafice turnieju renderuje warstwę pierwszoplanową", () => {
    const html = renderHeader(CUSTOM_HERO);

    expect(html).toContain('data-testid="hero-foreground"');
  });

  it("A: banner wypełnia cały kadr — bez ramki i bez rozmytego tła", () => {
    const html = renderHeader(CUSTOM_HERO);
    const presentation = resolveHeroPresentation(CUSTOM_HERO);

    expect(presentation.src).toBe(CUSTOM_HERO);
    expect(presentation.hasCustomArtwork).toBe(true);
    // Zadnej drugiej, rozmytej warstwy pod spodem.
    expect(html).not.toContain('data-testid="hero-backdrop"');
  });

  it("C: brak grafiki → schludny fallback w tym samym kadrze", () => {
    const presentation = resolveHeroPresentation(undefined);
    const html = renderHeader(undefined);

    expect(presentation.src).toBe(HERO_FALLBACK_IMAGE);
    expect(presentation.hasCustomArtwork).toBe(false);
    expect(html).toContain('data-testid="hero-foreground"');
  });

  it("C: pusty string traktujemy jak brak grafiki", () => {
    expect(resolveHeroPresentation("   ").src).toBe(HERO_FALLBACK_IMAGE);
  });

  it("B: nagłówek renderuje treść bez czekania na załadowanie hero", () => {
    // Render serwerowy = obrazek NIGDY się nie załadował.
    const html = renderHeader(CUSTOM_HERO);

    expect(html).toContain("Wyniki Live");
    expect(html).toContain("Sprawdź wyniki");
  });
});

/* ==========================================================================
 * NIEZMIENNIKI, KTÓRE JUŻ RAZ SIĘ ZEPSUŁY
 * ======================================================================== */

import { readFileSync } from "node:fs";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("B: żaden komponent nie przywraca bramki „gotowego hero”", () => {
  const files = [
    "components/tournament-header.tsx",
    "components/tournament-shell.tsx",
    "components/group-tabs.tsx",
  ];

  it.each(files)("%s nie warunkuje treści od hero", (file) => {
    const code = source(file);

    expect(code).not.toMatch(/headerReady|heroReady|onHeroReady/);
  });
});

describe("brak przypadkowego poziomego przewijania dokumentu", () => {
  /*
    Strona ma padding px-3 (0.75rem). Ujemny margines szerszy niż padding
    wystawia blok poza viewport i włącza scroll poziomy CAŁEJ strony —
    tak było z paskami zakładek (-mx-4 przy px-3).
  */
  const files = [
    "components/tournament-shell.tsx",
    "components/group-tabs.tsx",
    "components/standings-table.tsx",
    "components/match-matrix.tsx",
    "components/playoff/playoff-bracket.tsx",
    "components/playoff/placement-section.tsx",
    "components/playoff/podium-section.tsx",
  ];

  it.each(files)("%s nie używa ujemnych marginesów większych niż padding strony", (file) => {
    const code = source(file);
    const offenders = code.match(/-m[xlr]-(4|5|6|8|10|12)\b/g) ?? [];

    expect(offenders).toEqual([]);
  });
});
