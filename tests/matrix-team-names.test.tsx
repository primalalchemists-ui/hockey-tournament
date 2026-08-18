import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { MatchMatrix } from "@/components/match-matrix";
import type { Group, Team } from "@/types/tournament";

/**
 * NAZWY DRUŻYN W MATRIXIE WYNIKÓW.
 *
 * Regresja z realnego SUN CUP U8: „KH Dębica" była wizualnie ucięta,
 * ale dymka nie dawało się otworzyć — pomiar `scrollWidth > clientWidth`
 * wykonywał się raz, na przycisku o stałej szerokości i jeszcze przed
 * podmianą fontu. Nazwa mieszcząca się w foncie zapasowym nie mieściła
 * się w Inter, więc 6 z 7 wierszy działało, a jeden nie.
 *
 * Zachowanie docelowe: pełna nazwa jest dostępna dla KAŻDEGO wiersza,
 * niezależnie od długości stringa.
 */

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

/** Krótka, średnia i bardzo długa — plus przypadek graniczny z produkcji. */
const NAMES = [
  "KH Dębica",
  "GKS",
  "MOSM Tychy Tyskie Lwy 1",
  "Naprzód Janów Katowice 1",
];

function buildGroup(): Group {
  const teams: Team[] = NAMES.map((name, index) => ({
    id: `team-${index}`,
    name,
    logoText: "LOGO",
    sourceOrder: index,
  }));

  return {
    key: "A",
    name: "Grupa A",
    teams,
    matches: [
      {
        id: "m1",
        group: "A",
        homeTeamId: "team-0",
        awayTeamId: "team-1",
        homeScore: 3,
        awayScore: 1,
      },
    ],
  };
}

const html = renderToStaticMarkup(<MatchMatrix group={buildGroup()} />);

/** Wszystkie wyzwalacze nazw drużyn z nakładki lewej kolumny. */
const triggers = html
  .split('data-testid="matrix-team"')
  .slice(1)
  .map((chunk) => chunk.slice(0, 400));

describe("D/E: pełna nazwa dostępna niezależnie od długości", () => {
  it("D: KH Dębica ma taki sam wyzwalacz jak dłuższe nazwy", () => {
    expect(triggers).toHaveLength(NAMES.length);

    for (const name of NAMES) {
      expect(html).toContain(`aria-label="${name}"`);
    }
  });

  it("E: każdy wiersz jest przyciskiem dostępnym z klawiatury", () => {
    for (const trigger of triggers) {
      expect(trigger).toContain('aria-expanded="false"');
    }

    // Tyle samo przycisków co drużyn — żadna nazwa nie jest pominięta.
    expect(html.split('type="button"').length - 1).toBeGreaterThanOrEqual(
      NAMES.length
    );
  });

  it("E: zachowanie nie jest wiązane z konkretną nazwą", () => {
    const matrix = source("components/match-matrix.tsx");

    expect(matrix).not.toContain("Dębica");
    expect(matrix).not.toMatch(/name\s*===\s*"/);
    // Pełna nazwa jest podana wprost, a nie wyliczana z pomiaru w runtime.
    expect(matrix).not.toContain("onlyWhenTruncated");
  });

  it("nazwa dla czytnika ekranu zostaje w komórce <th>", () => {
    for (const name of NAMES) {
      expect(html).toContain(`<span class="sr-only">${name}</span>`);
    }
  });
});

describe("F: kolumna nazw nadal nie drga", () => {
  const matrix = source("components/match-matrix.tsx");
  const css = source("app/globals.css");

  it("F: nakładka jest nieruchoma — bez sticky i bez transformów", () => {
    expect(matrix).not.toContain("sticky");
    expect(matrix).not.toContain("translateZ");
    expect(matrix).not.toContain("will-change");
  });

  it("F: komórki nazw są nieprzezroczyste i bez backdrop-filter", () => {
    const block = css.slice(
      css.indexOf(".matrix-name-head"),
      css.indexOf(".matrix-name-head") + 900
    );

    expect(block).not.toContain("backdrop-filter");
    expect(block).not.toContain("transform");
    expect(block).toContain("#");
  });

  it("F: nakładka jest o piksel szersza niż kolumna tabeli", () => {
    // Bez tego przy pierwszym przewinięciu widać pasek przewijanej treści.
    expect(matrix).toContain("rem + 1px");
  });
});
