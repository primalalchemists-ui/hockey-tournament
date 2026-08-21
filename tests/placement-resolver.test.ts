import { describe, expect, it } from "vitest";

import { calculateStandings } from "@/lib/standings";
import { resolvePlacementStandings } from "@/lib/playoff/placement";
import { buildFinalClassification } from "@/lib/playoff/classification";
import { buildRankingRows } from "@/lib/playoff/aggregate-stats";
import type { Group, StandingRow } from "@/types/tournament";

/**
 * MIEJSCA POZA PODIUM — reguła bilansu z fazy grupowej.
 *
 * Minigrupa potrafi skończyć się układem zamkniętym: każdy wygrał raz
 * i raz przegrał, komplet po 3 punkty, bilans 0. Tabela nie ma czym ich
 * rozdzielić — i wtedy, zgodnie z regulaminem, decyduje bilans z fazy
 * grupowej.
 */

function team(id: string, sourceOrder: number) {
  return { id, name: id, logoText: id, sourceOrder };
}

/** Zamknięty trójkąt: A bije B, B bije C, C bije A. Wszyscy 3 pkt, 1:1. */
function circleGroup(order: [string, string, string]): Group {
  const [a, b, c] = order;

  return {
    key: "A-placement",
    name: "Minigrupa",
    teams: [team(a, 1), team(b, 2), team(c, 3)],
    matches: [
      { id: "m1", group: "A-placement", homeTeamId: a, awayTeamId: b, homeScore: 1, awayScore: 0 },
      { id: "m2", group: "A-placement", homeTeamId: b, awayTeamId: c, homeScore: 1, awayScore: 0 },
      { id: "m3", group: "A-placement", homeTeamId: c, awayTeamId: a, homeScore: 1, awayScore: 0 },
    ],
  };
}

describe("A/B: zwykła tabela bez zmian", () => {
  it("A: liga liczy się dokładnie tak jak dotąd", () => {
    const group: Group = {
      key: "A",
      name: "Grupa A",
      teams: [team("x", 1), team("y", 2), team("z", 3)],
      matches: [
        { id: "1", group: "A", homeTeamId: "x", awayTeamId: "y", homeScore: 5, awayScore: 0 },
        { id: "2", group: "A", homeTeamId: "y", awayTeamId: "z", homeScore: 2, awayScore: 1 },
        { id: "3", group: "A", homeTeamId: "z", awayTeamId: "x", homeScore: 0, awayScore: 1 },
      ],
    };

    const rows = calculateStandings(group);

    expect(rows.map((row) => row.teamId)).toEqual(["x", "y", "z"]);
    expect(rows.every((row) => !row.isTieUnresolved)).toBe(true);
  });

  it("B: remis dwóch drużyn nadal rozstrzyga mecz bezpośredni", () => {
    const group: Group = {
      key: "A",
      name: "Grupa A",
      teams: [team("p", 1), team("q", 2)],
      matches: [
        { id: "1", group: "A", homeTeamId: "p", awayTeamId: "q", homeScore: 2, awayScore: 1 },
        { id: "2", group: "A", homeTeamId: "q", awayTeamId: "p", homeScore: 1, awayScore: 0 },
      ],
    };

    const rows = calculateStandings(group);

    // Po jednym zwycięstwie, bilans 0 u obu — decyduje ostatni mecz bezpośredni.
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => !row.isTieUnresolved)).toBe(true);
  });
});

describe("C-E: reguła bilansu z fazy grupowej", () => {
  const placement = calculateStandings(circleGroup(["A", "B", "C"]));

  it("minigrupa sama NIE rozstrzyga tego układu", () => {
    expect(placement.every((row) => row.isTieUnresolved)).toBe(true);
    expect(placement.every((row) => row.points === 3)).toBe(true);
    expect(placement.every((row) => row.goalDifference === 0)).toBe(true);
  });

  it("C: decyduje bilans z fazy grupowej", () => {
    const { standings, unresolvedTeamIds } = resolvePlacementStandings({
      standings: placement,
      frozen: [
        { teamId: "A", position: 5, goalDifference: 4 },
        { teamId: "B", position: 6, goalDifference: 0 },
        { teamId: "C", position: 7, goalDifference: -3 },
      ],
    });

    expect(standings.map((row) => row.teamId)).toEqual(["A", "B", "C"]);
    expect(standings.map((row) => row.position)).toEqual([1, 2, 3]);
    expect(standings.every((row) => !row.isTieUnresolved)).toBe(true);
    expect(unresolvedTeamIds).toEqual([]);
  });

  it("C: kolejność wynika z bilansu, a nie z miejsca w tabeli minigrupy", () => {
    const { standings } = resolvePlacementStandings({
      standings: placement,
      frozen: [
        { teamId: "A", position: 5, goalDifference: -9 },
        { teamId: "B", position: 6, goalDifference: 3 },
        { teamId: "C", position: 7, goalDifference: 1 },
      ],
    });

    // Najlepszy bilans grupowy idzie na czoło, mimo najgorszego miejsca.
    expect(standings.map((row) => row.teamId)).toEqual(["B", "C", "A"]);
  });

  it("D: przy równym bilansie decyduje miejsce w fazie grupowej", () => {
    const { standings } = resolvePlacementStandings({
      standings: placement,
      frozen: [
        { teamId: "A", position: 7, goalDifference: 0 },
        { teamId: "B", position: 5, goalDifference: 0 },
        { teamId: "C", position: 6, goalDifference: 0 },
      ],
    });

    expect(standings.map((row) => row.teamId)).toEqual(["B", "C", "A"]);
  });

  it("E: kolejność rejestracji NIE ma wpływu na wynik", () => {
    const frozen = [
      { teamId: "A", position: 5, goalDifference: 4 },
      { teamId: "B", position: 6, goalDifference: 0 },
      { teamId: "C", position: 7, goalDifference: -3 },
    ];

    // Ta sama trójka, trzy różne kolejności rejestracji w grupie.
    for (const order of [
      ["A", "B", "C"],
      ["C", "B", "A"],
      ["B", "A", "C"],
    ] as Array<[string, string, string]>) {
      const { standings } = resolvePlacementStandings({
        standings: calculateStandings(circleGroup(order)),
        frozen,
      });

      expect(standings.map((row) => row.teamId)).toEqual(["A", "B", "C"]);
    }
  });

  it("G: bez zamrożonej tabeli nie wymyślamy miejsca", () => {
    const { standings, unresolvedTeamIds } = resolvePlacementStandings({
      standings: placement,
      frozen: [],
    });

    expect(standings.every((row) => row.isTieUnresolved)).toBe(true);
    expect(unresolvedTeamIds.sort()).toEqual(["A", "B", "C"]);
  });

  it("G: niepełne dane też nie wystarczą — rozstrzygamy komplet albo nic", () => {
    const { unresolvedTeamIds } = resolvePlacementStandings({
      standings: placement,
      frozen: [{ teamId: "A", position: 5, goalDifference: 4 }],
    });

    expect(unresolvedTeamIds).toHaveLength(3);
  });

  it("rozstrzygnięta minigrupa przechodzi przez resolver bez zmian", () => {
    const decided = calculateStandings({
      key: "A-placement",
      name: "Minigrupa",
      teams: [team("A", 1), team("B", 2), team("C", 3)],
      matches: [
        { id: "1", group: "A-placement", homeTeamId: "A", awayTeamId: "B", homeScore: 3, awayScore: 0 },
        { id: "2", group: "A-placement", homeTeamId: "B", awayTeamId: "C", homeScore: 2, awayScore: 0 },
        { id: "3", group: "A-placement", homeTeamId: "C", awayTeamId: "A", homeScore: 0, awayScore: 1 },
      ],
    });

    const { standings } = resolvePlacementStandings({ standings: decided, frozen: [] });

    expect(standings).toEqual(decided);
  });
});

describe("F/H: jedno źródło prawdy dla trzech widoków", () => {
  const frozen = [
    { teamId: "A", position: 5, goalDifference: 4 },
    { teamId: "B", position: 6, goalDifference: 0 },
    { teamId: "C", position: 7, goalDifference: -3 },
  ];

  const resolution = resolvePlacementStandings({
    standings: calculateStandings(circleGroup(["C", "A", "B"])),
    frozen,
  });

  const classification = buildFinalClassification({
    scopeKey: "A",
    bracketMatches: [
      { kind: "final", homeTeamId: "W", awayTeamId: "X", homeScore: 2, awayScore: 1 },
      { kind: "third_place", homeTeamId: "Y", awayTeamId: "Z", homeScore: 3, awayScore: 0 },
    ],
    thirdPlaceMatch: true,
    placementStandings: resolution.standings,
    placementComplete: true,
    placementUnresolvedTeamIds: resolution.unresolvedTeamIds,
    frozenOrder: ["W", "X", "Y", "Z", "A", "B", "C"],
  });

  it("H: miejsca 1-4 z play-offu bez zmian", () => {
    expect(
      classification.entries
        .filter((entry) => (entry.position ?? 99) <= 4)
        .map((entry) => [entry.position, entry.teamId])
    ).toEqual([
      [1, "W"],
      [2, "X"],
      [3, "Y"],
      [4, "Z"],
    ]);
  });

  it("F: minitabela, klasyfikacja i Ranking mówią to samo", () => {
    const mini = resolution.standings.map((row) => [
      5 + row.position - 1,
      row.teamId,
    ]);

    const final = classification.entries
      .filter((entry) => (entry.position ?? 0) >= 5)
      .map((entry) => [entry.position, entry.teamId]);

    const ranking = buildRankingRows({
      ordered: classification.entries.map((entry) => ({
        teamId: entry.teamId,
        position: entry.position,
      })),
      stats: new Map(),
      presentation: new Map(),
    })
      .filter((row) => row.position >= 5)
      .map((row) => [row.position, row.teamId]);

    expect(mini).toEqual([
      [5, "A"],
      [6, "B"],
      [7, "C"],
    ]);
    expect(final).toEqual(mini);
    expect(ranking).toEqual(mini);
    expect(classification.complete).toBe(true);
  });

  it("nierozstrzygnięta minigrupa NIE domyka turnieju", () => {
    const stuck = resolvePlacementStandings({
      standings: calculateStandings(circleGroup(["A", "B", "C"])),
      frozen: [],
    });

    const open = buildFinalClassification({
      scopeKey: "A",
      bracketMatches: [
        { kind: "final", homeTeamId: "W", awayTeamId: "X", homeScore: 2, awayScore: 1 },
        { kind: "third_place", homeTeamId: "Y", awayTeamId: "Z", homeScore: 3, awayScore: 0 },
      ],
      thirdPlaceMatch: true,
      placementStandings: stuck.standings,
      placementComplete: true,
      placementUnresolvedTeamIds: stuck.unresolvedTeamIds,
      frozenOrder: [],
    });

    expect(open.complete).toBe(false);
    expect(open.missing).toContain("rozstrzygnięcie miejsc poza podium");

    // Ranking też nie udaje, że zna miejsce.
    const rows = buildRankingRows({
      ordered: open.entries.map((entry) => ({
        teamId: entry.teamId,
        position: entry.position,
      })),
      stats: new Map(),
      presentation: new Map(),
    });

    const unknown = rows.filter((row) => row.isTieUnresolved);
    expect(unknown.map((row) => row.teamId).sort()).toEqual(["A", "B", "C"]);
  });
});

describe("I: turniej ligowy bez play-offu", () => {
  it("nie przechodzi przez resolver miejsc poza podium", () => {
    const league: Group = {
      key: "A",
      name: "Liga",
      teams: [team("l1", 1), team("l2", 2), team("l3", 3)],
      matches: [
        { id: "1", group: "A", homeTeamId: "l1", awayTeamId: "l2", homeScore: 1, awayScore: 0 },
        { id: "2", group: "A", homeTeamId: "l2", awayTeamId: "l3", homeScore: 1, awayScore: 0 },
        { id: "3", group: "A", homeTeamId: "l3", awayTeamId: "l1", homeScore: 1, awayScore: 0 },
      ],
    };

    const rows: StandingRow[] = calculateStandings(league);

    // Ten sam zamknięty trójkąt co w minigrupie — w lidze zostaje „?".
    expect(rows.every((row) => row.isTieUnresolved)).toBe(true);
    expect(rows.map((row) => row.position)).toEqual([1, 2, 3]);
  });
});
