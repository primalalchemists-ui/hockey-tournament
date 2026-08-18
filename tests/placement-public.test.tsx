import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { PlacementSection } from "@/components/playoff/placement-section";
import type { PlacementView } from "@/lib/data/postgres/playoff-engine";
import type { StandingRow } from "@/types/tournament";

/**
 * MINIGRUPA NA STRONIE PUBLICZNEJ.
 *
 * Tabela rankingowa jest zaakceptowana i zostaje bez zmian. Zmienia sie
 * wylacznie lista meczow pod nia: trzy pelnoszerokosciowe paski byly
 * na desktopie za szerokie.
 */

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function team(name: string) {
  return {
    teamId: name.toLowerCase(),
    name,
    logoUrl: `https://res.cloudinary.com/demo/${name}.png`,
    logoText: name.slice(0, 3),
    seed: null,
  };
}

function standing(position: number, name: string): StandingRow {
  return {
    position,
    teamId: name.toLowerCase(),
    teamName: name,
    played: 2,
    wins: 1,
    draws: 0,
    losses: 1,
    points: 3,
    goalsFor: 5,
    goalsAgainst: 4,
    goalDifference: 1,
    sourceOrder: position,
  };
}

const PLACEMENT: PlacementView = {
  teamIds: ["a5", "a6", "a7"],
  positionFrom: 5,
  positionTo: 7,
  matches: [
    {
      externalId: "pl-0",
      home: team("A5"),
      away: team("A6"),
      homeScore: 5,
      awayScore: 0,
      editability: "editable",
    },
    {
      externalId: "pl-1",
      home: team("A5"),
      away: team("A7"),
      homeScore: 4,
      awayScore: 2,
      editability: "editable",
    },
    {
      externalId: "pl-2",
      home: team("A6"),
      away: team("A7"),
      homeScore: null,
      awayScore: null,
      editability: "editable",
    },
  ],
  standings: [standing(1, "A5"), standing(2, "A7"), standing(3, "A6")],
  complete: false,
};

const html = renderToStaticMarkup(<PlacementSection placement={PLACEMENT} />);

describe("AF-AK: mecze minigrupy", () => {
  it("AF: na desktopie trzy karty w jednym rzedzie", () => {
    expect(html).toContain('data-testid="placement-match-grid"');
    expect(html).toContain("md:grid-cols-3");
    expect(html.split('data-testid="placement-match-card"').length - 1).toBe(3);
  });

  it("AG: na telefonie karty ida jedna pod druga", () => {
    expect(html).toContain("grid-cols-1");
  });

  it("AH: zwyciezca dostaje istniejacy zielony token matrixa", () => {
    expect(html).toContain('data-outcome="win"');
    expect(html).toContain("border-emerald-200");
    expect(html).toContain("bg-emerald-50/70");
  });

  it("AI: przegrany dostaje istniejacy czerwony token matrixa", () => {
    expect(html).toContain('data-outcome="loss"');
    expect(html).toContain("border-rose-200");
    expect(html).toContain("bg-rose-50/60");
  });

  it("nierozegrany mecz nie ma akcentu ani wyniku 0:0", () => {
    expect(html).toContain('data-outcome="neutral"');
    expect(html).toContain("—");
  });

  it("AJ: karta nie wymusza przewijania w poziomie", () => {
    const placement = source("components/playoff/placement-section.tsx");

    // Siatka i skracanie nazw zamiast poziomego scrolla w liscie meczow.
    expect(placement).toContain("truncate");
    expect(placement).not.toContain("overflow-x-auto");
  });

  it("AK: tabela rankingowa minigrupy pozostaje bez zmian", () => {
    expect(html).toContain("ice-table");
    expect(html).toContain("Klasyfikacja miejsc 5–7");
    expect(html).toContain("Poz.");
    expect(html).toContain("Drużyna");
  });

  it("nie wprowadzono nowych tokenow kolorow", () => {
    const placement = source("components/playoff/placement-section.tsx");
    const matrix = source("components/match-matrix.tsx");

    // Ta sama rodzina co w matrixie: emerald / rose.
    expect(matrix).toContain("emerald-200");
    expect(matrix).toContain("rose-200");
    expect(placement).not.toMatch(/green-\d|red-\d|lime-\d/);
  });
});
