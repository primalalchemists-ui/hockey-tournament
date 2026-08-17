import { describe, expect, it } from "vitest";

import {
  mapMatches,
  mapScorers,
  mapTeams,
  type MatchFields,
  type ScorerFields,
  type TeamFields,
} from "@/lib/data/airtable/mappers";
import type { AirtableRecord } from "@/lib/data/airtable/client";

function record<T>(fields: T, id = "rec1"): AirtableRecord<T> {
  return { id, fields };
}

/**
 * Mapowanie Airtable -> model domenowy.
 * Te reguły decydują o tym, co w ogóle trafia do calculateStandings,
 * więc są tak samo krytyczne jak sam algorytm klasyfikacji.
 */

describe("mapTeams", () => {
  it("grupuje drużyny po polu group i sortuje po sourceOrder", () => {
    const groups = mapTeams([
      record<TeamFields>({ group: "B", teamId: "b1", name: "B1", sourceOrder: 2 }),
      record<TeamFields>({ group: "A", teamId: "a2", name: "A2", sourceOrder: 5 }),
      record<TeamFields>({ group: "A", teamId: "a1", name: "A1", sourceOrder: 1 }),
    ]);

    expect(groups.map((group) => group.key)).toEqual(["A", "B"]);
    expect(groups[0].teams.map((team) => team.id)).toEqual(["a1", "a2"]);
    expect(groups[0].name).toBe("Grupa A");
    expect(groups[0].matches).toEqual([]);
  });

  it("pomija rekordy bez group / teamId / name", () => {
    const groups = mapTeams([
      record<TeamFields>({ teamId: "x", name: "X", sourceOrder: 1 }),
      record<TeamFields>({ group: "A", name: "Y", sourceOrder: 1 }),
      record<TeamFields>({ group: "A", teamId: "z", sourceOrder: 1 }),
    ]);

    expect(groups).toEqual([]);
  });

  it("ustawia sourceOrder=999 gdy pole jest puste", () => {
    const groups = mapTeams([
      record<TeamFields>({ group: "A", teamId: "a1", name: "A1" }),
    ]);

    expect(groups[0].teams[0].sourceOrder).toBe(999);
  });

  it("przepisuje pierwszy załącznik logo", () => {
    const groups = mapTeams([
      record<TeamFields>({
        group: "A",
        teamId: "a1",
        name: "A1",
        shortName: "AAA",
        sourceOrder: 1,
        logo: [
          { url: "https://example.test/logo.png", filename: "logo.png", type: "image/png" },
          { url: "https://example.test/ignored.png" },
        ],
      }),
    ]);

    expect(groups[0].teams[0]).toMatchObject({
      logoText: "AAA",
      logoUrl: "https://example.test/logo.png",
      logoName: "logo.png",
      logoType: "image/png",
    });
  });
});

describe("mapMatches", () => {
  it("mapuje kompletny mecz", () => {
    const matches = mapMatches([
      record<MatchFields>({
        group: "A",
        matchId: "A-a1-a2",
        homeTeamId: "a1",
        awayTeamId: "a2",
        homeScore: 3,
        awayScore: 1,
      }),
    ]);

    expect(matches).toEqual([
      {
        id: "A-a1-a2",
        group: "A",
        homeTeamId: "a1",
        awayTeamId: "a2",
        homeScore: 3,
        awayScore: 1,
      },
    ]);
  });

  it("ODRZUCA mecz bez wyniku — dziś mecz bez wyniku nie istnieje", () => {
    const matches = mapMatches([
      record<MatchFields>({
        group: "A",
        matchId: "A-a1-a2",
        homeTeamId: "a1",
        awayTeamId: "a2",
      }),
    ]);

    expect(matches).toEqual([]);
  });

  it("akceptuje wynik 0:0", () => {
    const matches = mapMatches([
      record<MatchFields>({
        group: "A",
        matchId: "m",
        homeTeamId: "a1",
        awayTeamId: "a2",
        homeScore: 0,
        awayScore: 0,
      }),
    ]);

    expect(matches).toHaveLength(1);
  });

  it("korzysta z pól lookup, gdy brak pól bezpośrednich", () => {
    const matches = mapMatches([
      record<MatchFields>({
        group: "A",
        matchId: "m",
        homeTeamIdLookup: ["a1"],
        awayTeamIdLookup: ["a2"],
        homeScore: 1,
        awayScore: 2,
      }),
    ]);

    expect(matches[0]).toMatchObject({ homeTeamId: "a1", awayTeamId: "a2" });
  });
});

describe("mapScorers", () => {
  it("sortuje po golach malejąco, potem alfabetycznie", () => {
    const scorers = mapScorers([
      record<ScorerFields>({ scorerId: "s1", playerName: "Zenon", teamId: "a1", goals: 3 }),
      record<ScorerFields>({ scorerId: "s2", playerName: "Adam", teamId: "a1", goals: 5 }),
      record<ScorerFields>({ scorerId: "s3", playerName: "Bartek", teamId: "a1", goals: 3 }),
    ]);

    expect(scorers.map((scorer) => scorer.playerName)).toEqual([
      "Adam",
      "Bartek",
      "Zenon",
    ]);
  });

  it("pomija niekompletne rekordy i normalizuje numer koszulki", () => {
    const scorers = mapScorers([
      record<ScorerFields>({ scorerId: "s1", playerName: "Adam", teamId: "a1", goals: 1 }),
      record<ScorerFields>({ scorerId: "s2", playerName: "Bez drużyny", goals: 1 }),
      record<ScorerFields>({ scorerId: "s3", playerName: "Bez goli", teamId: "a1" }),
    ]);

    expect(scorers).toHaveLength(1);
    expect(scorers[0].jerseyNumber).toBeUndefined();
  });
});
