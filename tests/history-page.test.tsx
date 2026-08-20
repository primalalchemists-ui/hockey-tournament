import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { ArchivedTournamentView } from "@/components/history/archived-tournament-view";
import type { PlayoffStateView } from "@/lib/data/postgres/playoff-engine";
import type { Tournament } from "@/types/tournament";

/**
 * STRONA WYNIKOW ARCHIWALNYCH.
 *
 * Ma byc spokojna: bez tickera, bez hero biezacego eventu, bez campu,
 * bez celebracji i bez odpytywania serwera co 13 sekund.
 */

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const route = source("app/turnieje/[slug]/page.tsx");
const view = source("components/history/archived-tournament-view.tsx");

function team(id: string, name: string) {
  return { id, name, sourceOrder: Number(id.slice(1)) };
}

const groupsTournament: Tournament = {
  id: "rabbit-cup",
  title: "Rabbit Cup 2026",
  scorers: [
    { id: "s1", playerName: "Jan Kowalski", goals: 7, teamId: "a1" },
  ],
  assets: {},
  groups: [
    {
      key: "A",
      name: "Grupa A",
      teams: [team("a1", "Sokoły"), team("a2", "Niedźwiadki")],
      matches: [
        {
          id: "m1",
          group: "A",
          homeTeamId: "a1",
          awayTeamId: "a2",
          homeScore: 3,
          awayScore: 1,
        },
      ],
    },
    {
      key: "B",
      name: "Grupa B",
      teams: [team("b1", "Lwy"), team("b2", "Rysie")],
      matches: [],
    },
  ],
};

const singleTournament: Tournament = {
  ...groupsTournament,
  groups: [groupsTournament.groups[0]],
};

function render(
  tournament: Tournament,
  options?: {
    structure?: "groups" | "single";
    scorersEnabled?: boolean;
    playoffState?: PlayoffStateView | null;
  }
) {
  return renderToStaticMarkup(
    <ArchivedTournamentView
      tournament={tournament}
      structure={options?.structure ?? "groups"}
      scorersEnabled={options?.scorersEnabled ?? false}
      playoffState={options?.playoffState ?? null}
    />
  );
}

describe("AJ-AN: zawartosc sportowa", () => {
  const html = render(groupsTournament);

  it("AK/AL: ranking i tabela wynikow sa na stronie", () => {
    expect(html).toContain("Sokoły");
    expect(html).toContain("Niedźwiadki");
    // Matrix wynikow renderuje sie tym samym komponentem co na zywo.
    expect(html).toContain('data-testid="matrix-name-column"');
  });

  it("AM: wiele grup dostaje selektor", () => {
    expect(html).toContain('data-testid="history-group-tabs"');
    expect(html).toContain("Grupa A");
    expect(html).toContain("Grupa B");
  });

  it("AN: jedna pula nie pokazuje sztucznych zakladek", () => {
    const single = render(singleTournament, { structure: "single" });

    expect(single).not.toContain('data-testid="history-group-tabs"');
  });

  it("AJ: naglowek strony niesie nazwe turnieju", () => {
    expect(route).toContain("{data.tournament.title}");
    expect(route).toContain("Wyniki turnieju");
    expect(route).toContain("Powrót do aktualnych wyników");
  });
});

describe("AO-AS: czego na stronie archiwalnej NIE ma", () => {
  const html = render(groupsTournament);

  it("AO/AQ/AS: bez campu, hero i materialow promocyjnych", () => {
    expect(view).not.toContain("CampBanner");
    expect(view).not.toContain("TournamentHeader");
    expect(view).not.toContain("PoweredBySection");

    expect(route).not.toContain("CampBanner");
    expect(route).not.toContain("TournamentShell");
  });

  it("AP: bez tickera i paska Wyniki Live", () => {
    expect(view).not.toContain("TopScorerTicker");
    expect(html).not.toContain("Wyniki Live");
  });

  it("AR: bez odpytywania serwera co 13 sekund", () => {
    expect(view).not.toContain("usePublicAutoRefresh");
    expect(route).not.toContain("usePublicAutoRefresh");
    // Dane archiwalne sa statyczne - wystarczy rewalidacja.
    expect(route).toContain("export const revalidate");
  });

  it("AS: bez karuzeli poprzednich turniejow w srodku archiwum", () => {
    expect(view).not.toContain("PreviousTournaments");
    expect(route).not.toContain("PreviousTournaments");
  });
});

describe("AT-AY: play-off i strzelcy w archiwum", () => {
  const playoffState = {
    scopes: [
      {
        groupKey: "A",
        ranking: [],
        classification: {
          complete: true,
          missing: [],
          entries: [
            {
              position: 1,
              shared: false,
              source: "bracket",
              team: {
                teamId: "a1",
                name: "Sokoły",
                logoUrl: null,
                logoText: "SOK",
                seed: 1,
              },
            },
            {
              position: 2,
              shared: false,
              source: "bracket",
              team: {
                teamId: "a2",
                name: "Niedźwiadki",
                logoUrl: null,
                logoText: "NIE",
                seed: 2,
              },
            },
          ],
        },
      },
    ],
  } as unknown as PlayoffStateView;

  it("AT: zakonczony play-off pokazuje klasyfikacje koncowa", () => {
    const html = render(groupsTournament, { playoffState });

    expect(html).toContain('data-testid="history-classification"');
    expect(html).toContain("Klasyfikacja końcowa");
    expect(html).toContain("Sokoły");
  });

  it("AU/AV/AW: klasyfikacja jest statyczna, bez ceremonii i pamieci", () => {
    // Zero podium z animacja, zero przycisku celebracji, zero localStorage.
    expect(view).not.toContain("PodiumSection");
    expect(view).not.toContain("CelebrationButton");
    expect(view).not.toContain("buildPodiumStorageKey");
    expect(view).not.toContain("localStorage");
    expect(view).not.toContain("podium-drop");
  });

  it("AX: wylaczeni strzelcy nie dostaja pustej sekcji", () => {
    const html = render(groupsTournament, { scorersEnabled: false });

    expect(html).not.toContain("Strzelcy");
  });

  it("AY: wlaczeni strzelcy z danymi sa pokazani", () => {
    const html = render(groupsTournament, { scorersEnabled: true });

    expect(html).toContain("Strzelcy");
    expect(html).toContain("Jan Kowalski");
  });

  it("wlaczeni strzelcy BEZ danych tez nie tworza pustej sekcji", () => {
    const html = render(
      { ...groupsTournament, scorers: [] },
      { scorersEnabled: true }
    );

    expect(html).not.toContain("Strzelcy");
  });
});

describe("bezpieczenstwo trasy", () => {
  it("AH/AI: brak archiwum konczy sie notFound", () => {
    expect(route).toContain("if (!data) notFound()");
    expect(route).toContain("findArchivedTournamentIdBySlug");
  });

  it("slug jest wyszukiwany doslownie w bazie", () => {
    const history = source("lib/data/postgres/public-history.ts");

    expect(history).toContain("eq(tournaments.slug, slug)");
    expect(history).toContain("isNotNull(tournaments.archivedAt)");
  });

  it("metadata opisuje turniej", () => {
    expect(route).toContain("— wyniki | Festiwal Hokeja");
    expect(route).toContain("Wyniki turnieju ${data.tournament.title}.");
  });
});
