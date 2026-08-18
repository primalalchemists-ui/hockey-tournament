import { describe, expect, it } from "vitest";

import {
  buildAssets,
  buildMatches,
  buildScorers,
  buildTeam,
  buildTournamentFromRows,
} from "@/lib/data/postgres/mappers";
import type {
  GroupRow,
  MatchRow,
  ScorerRow,
  TeamRow,
  TournamentAssetRow,
  TournamentRow,
} from "@/lib/db/schema";

/**
 * Mapowanie wierszy SQL -> model domenowy.
 * Musi dawać dokładnie taki sam kształt jak adapter Airtable.
 */

function teamRow(overrides: Partial<TeamRow> = {}): TeamRow {
  return {
    id: "uuid-team-1",
    tournamentId: "uuid-tournament",
    groupId: "uuid-group-a",
    externalId: "a-1",
    name: "Drużyna A1",
    shortName: "A1",
    logoUrl: null,
    logoName: null,
    logoType: null,
    logoPublicId: null,
    sourceOrder: 1,
    ...overrides,
  };
}

function matchRow(overrides: Partial<MatchRow> = {}): MatchRow {
  return {
    id: "uuid-match-1",
    tournamentId: "uuid-tournament",
    groupId: "uuid-group-a",
    externalId: "A-a-1-a-2",
    stage: "group",
    status: "finished",
    homeTeamId: "uuid-team-1",
    awayTeamId: "uuid-team-2",
    homeScore: 3,
    awayScore: 1,
    shootoutWinnerTeamId: null,
    bracketRoundId: null,
    slotIndex: null,
    homeSource: null,
    awaySource: null,
    scheduledAt: null,
    rink: null,
    sourceOrder: 0,
    ...overrides,
  };
}

function scorerRow(overrides: Partial<ScorerRow> = {}): ScorerRow {
  return {
    id: "uuid-scorer-1",
    tournamentId: "uuid-tournament",
    teamId: "uuid-team-1",
    externalId: "s-1",
    playerName: "Adam",
    jerseyNumber: null,
    goals: 3,
    ...overrides,
  };
}

describe("buildAssets", () => {
  it("wypełnia brakujące sloty pustymi napisami", () => {
    const assets = buildAssets([]);

    expect(assets.scheduleImage).toBe("");
    expect(assets.scheduleImageType).toBe("");
    expect(assets.scheduleImageName).toBe("");
    expect(assets.campPosterRight).toBe("");
  });

  it("mapuje rodzaj assetu na właściwy prefiks pola", () => {
    const rows: TournamentAssetRow[] = [
      {
        id: "a1",
        tournamentId: "t",
        kind: "hero_banner",
        url: "https://cdn.test/hero.png",
        mimeType: "image/png",
        fileName: "hero.png",
        publicId: "tournaments/hero",
      },
      {
        id: "a2",
        tournamentId: "t",
        kind: "camp_poster_left",
        url: "https://cdn.test/left.png",
        mimeType: null,
        fileName: null,
        publicId: null,
      },
    ];

    const assets = buildAssets(rows);

    expect(assets.heroBannerImage).toBe("https://cdn.test/hero.png");
    expect(assets.heroBannerImageType).toBe("image/png");
    expect(assets.heroBannerImageName).toBe("hero.png");
    expect(assets.campPosterLeft).toBe("https://cdn.test/left.png");
    expect(assets.campPosterLeftType).toBe("");
  });
});

describe("buildTeam", () => {
  it("zamienia NULL na undefined i ustawia fallback logoText", () => {
    const team = buildTeam(
      teamRow({ shortName: null, logoUrl: null, logoName: null, logoType: null })
    );

    expect(team.shortName).toBeUndefined();
    expect(team.logoUrl).toBeUndefined();
    expect(team.logoName).toBeUndefined();
    expect(team.logoType).toBeUndefined();
    expect(team.logoText).toBe("LOGO");
  });

  it("używa shortName jako logoText, gdy jest ustawiony", () => {
    expect(buildTeam(teamRow({ shortName: "AAA" })).logoText).toBe("AAA");
  });

  it("NIE wystawia logoPublicId — adapter Airtable go nie zwraca", () => {
    const team = buildTeam(teamRow({ logoPublicId: "tournaments/abc" }));

    expect(team).not.toHaveProperty("logoPublicId");
  });
});

describe("buildMatches", () => {
  const teamsMap = new Map([
    ["uuid-team-1", "a-1"],
    ["uuid-team-2", "a-2"],
  ]);
  const groupsMap = new Map([["uuid-group-a", "A"]]);

  it("mapuje kompletny mecz na model domenowy", () => {
    expect(buildMatches([matchRow()], teamsMap, groupsMap)).toEqual([
      {
        id: "A-a-1-a-2",
        group: "A",
        homeTeamId: "a-1",
        awayTeamId: "a-2",
        homeScore: 3,
        awayScore: 1,
      },
    ]);
  });

  it("POMIJA mecz bez wyniku — tak samo jak adapter Airtable", () => {
    const rows = [matchRow({ homeScore: null, awayScore: null, status: "scheduled" })];

    expect(buildMatches(rows, teamsMap, groupsMap)).toEqual([]);
  });

  it("pomija mecz z nierozstrzygniętym slotem drabinki", () => {
    const rows = [matchRow({ homeTeamId: null })];

    expect(buildMatches(rows, teamsMap, groupsMap)).toEqual([]);
  });

  it("zachowuje wynik 0:0", () => {
    const rows = [matchRow({ homeScore: 0, awayScore: 0 })];

    expect(buildMatches(rows, teamsMap, groupsMap)).toHaveLength(1);
  });

  it("sortuje po sourceOrder — kolejność musi być odtworzona z bazy", () => {
    const rows = [
      matchRow({ id: "m3", externalId: "third", sourceOrder: 2 }),
      matchRow({ id: "m1", externalId: "first", sourceOrder: 0 }),
      matchRow({ id: "m2", externalId: "second", sourceOrder: 1 }),
    ];

    expect(
      buildMatches(rows, teamsMap, groupsMap).map((match) => match.id)
    ).toEqual(["first", "second", "third"]);
  });
});

describe("buildScorers", () => {
  const teamsMap = new Map([["uuid-team-1", "a-1"]]);

  it("sortuje po golach malejąco, potem alfabetycznie", () => {
    const rows = [
      scorerRow({ id: "1", externalId: "s1", playerName: "Zenon", goals: 3 }),
      scorerRow({ id: "2", externalId: "s2", playerName: "Adam", goals: 5 }),
      scorerRow({ id: "3", externalId: "s3", playerName: "Bartek", goals: 3 }),
    ];

    expect(
      buildScorers(rows, teamsMap).map((scorer) => scorer.playerName)
    ).toEqual(["Adam", "Bartek", "Zenon"]);
  });

  it("zamienia brak numeru na undefined", () => {
    expect(buildScorers([scorerRow()], teamsMap)[0].jerseyNumber).toBeUndefined();
  });

  it("pomija strzelca wskazującego na nieznaną drużynę", () => {
    const rows = [scorerRow({ teamId: "uuid-nieznane" })];

    expect(buildScorers(rows, teamsMap)).toEqual([]);
  });
});

describe("buildTournamentFromRows", () => {
  const tournament: TournamentRow = {
    id: "uuid-tournament",
    slug: "rabbit-cup",
    title: "Rabbit Cup",
    structure: "groups",
    format: "league",
    phase: "group_stage",
    publicRevision: 0,
    completedAt: null,
    isCurrent: true,
    archivedAt: null,
    playoffConfig: null,
    playoffTieBreaker: "penalties",
    campStartDate: null,
    campSignupLink: null,
    tickerMessage: null,
    showTopScorerTicker: true,
    legacyAirtableId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const groupRows: GroupRow[] = [
    { id: "uuid-group-b", tournamentId: "uuid-tournament", key: "B", name: "Grupa B", sortOrder: 1 },
    { id: "uuid-group-a", tournamentId: "uuid-tournament", key: "A", name: "Grupa A", sortOrder: 0 },
  ];

  it("zwraca slug jako domenowe id — UUID nie opuszcza warstwy danych", () => {
    const result = buildTournamentFromRows({
      tournament,
      assets: [],
      groups: groupRows,
      teams: [],
      matches: [],
      scorers: [],
    });

    expect(result.id).toBe("rabbit-cup");
    expect(JSON.stringify(result)).not.toContain("uuid-tournament");
  });

  it("sortuje grupy naturalnie po kluczu, niezależnie od kolejności z bazy", () => {
    const result = buildTournamentFromRows({
      tournament,
      assets: [],
      groups: groupRows,
      teams: [],
      matches: [],
      scorers: [],
    });

    expect(result.groups?.map((group) => group.key)).toEqual(["A", "B"]);
  });

  it("przypisuje drużyny do właściwej grupy i sortuje po sourceOrder", () => {
    const result = buildTournamentFromRows({
      tournament,
      assets: [],
      groups: groupRows,
      teams: [
        teamRow({ id: "t2", externalId: "a-2", sourceOrder: 2, groupId: "uuid-group-a" }),
        teamRow({ id: "t1", externalId: "a-1", sourceOrder: 1, groupId: "uuid-group-a" }),
        teamRow({ id: "t3", externalId: "b-1", sourceOrder: 1, groupId: "uuid-group-b" }),
      ],
      matches: [],
      scorers: [],
    });

    expect(result.groups?.[0].teams.map((team) => team.id)).toEqual(["a-1", "a-2"]);
    expect(result.groups?.[1].teams.map((team) => team.id)).toEqual(["b-1"]);
  });

  it("zamienia NULL-e metadanych na puste napisy", () => {
    const result = buildTournamentFromRows({
      tournament,
      assets: [],
      groups: [],
      teams: [],
      matches: [],
      scorers: [],
    });

    expect(result.campStartDate).toBe("");
    expect(result.campSignupLink).toBe("");
    expect(result.tickerMessage).toBe("");
  });
});
