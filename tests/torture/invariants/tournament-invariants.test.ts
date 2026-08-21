import { describe, expect, it } from "vitest";

import { calculateStandings } from "@/lib/standings";
import {
  plannedMatchesForScope,
  roundRobinMatchCount,
} from "@/lib/playoff/planned-matches";
import { buildFirstRoundPairs } from "@/lib/playoff/seeding";
import {
  buildClassificationSkeleton,
  buildFinalClassification,
} from "@/lib/playoff/classification";
import { resolvePlacementStandings } from "@/lib/playoff/placement";
import {
  aggregateTeamStats,
  buildRankingRows,
} from "@/lib/playoff/aggregate-stats";

import {
  assertRowArithmetic,
  buildGroup,
  deterministicRoundRobin,
  expectedPairCount,
  hasSelfMatch,
  idsOf,
  match,
  pairKeys,
  totalGoalsAgainst,
  totalGoalsFor,
  totalPlayed,
} from "../helpers/scenario";

/**
 * NIEZMIENNIKI GLOBALNE (INV-01..INV-38).
 *
 * Część z nich jest naturalną asercją w scenariuszach U10/U8 — tutaj
 * lądują te, które wymagają osobnego, jawnego sprawdzenia, oraz te,
 * które opisują liczby obu formatów.
 */

const U10 = idsOf(10);
const U8 = idsOf(7);

describe("INV-01..09 — arytmetyka", () => {
  const rows = calculateStandings(
    buildGroup(U8, [
      match("t1", "t2", 3, 1),
      match("t1", "t3", 0, 0),
      match("t2", "t3", 2, 5),
      match("t4", "t5", 1, 1),
      match("t6", "t7", 4, 0),
    ])
  );

  it("INV-01/02/03 — played, bilans i punkty zgadzają się w każdym wierszu", () => {
    for (const row of rows) assertRowArithmetic(row, expect);
  });

  it("INV-04 — suma strzelonych równa się sumie straconych", () => {
    expect(totalGoalsFor(rows)).toBe(totalGoalsAgainst(rows));
    expect(totalGoalsFor(rows)).toBe(17);
  });

  it("INV-05/06 — każdy mecz dokłada dokładnie dwa wystąpienia", () => {
    expect(totalPlayed(rows)).toBe(10);
    expect(totalPlayed(rows) % 2).toBe(0);
  });

  it("INV-07 — pozycje są ciągłe i bez powtórzeń", () => {
    expect(rows.map((row) => row.position)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(new Set(rows.map((row) => row.teamId)).size).toBe(7);
  });

  it("INV-08 — calculateStandings nie mutuje wejścia", () => {
    const group = buildGroup(["a", "b"], [match("a", "b", 2, 1)]);
    const snapshot = JSON.stringify(group);

    calculateStandings(group);

    expect(JSON.stringify(group)).toBe(snapshot);
  });

  it("INV-09 — mecz z nieistniejącą drużyną jest pomijany", () => {
    const rowsWithGhost = calculateStandings(
      buildGroup(["a", "b"], [match("a", "duch", 3, 0)])
    );

    expect(rowsWithGhost).toHaveLength(2);
    expect(rowsWithGhost.every((row) => row.played === 0)).toBe(true);
  });
});

describe("INV-10..13 — round robin", () => {
  it("INV-10/11 — pary są unikalne i pełne", () => {
    const played = deterministicRoundRobin(U10);
    const keys = pairKeys(played);

    expect(keys).toHaveLength(45);
    expect(new Set(keys).size).toBe(45);
  });

  it("INV-12 — brak meczu drużyny z samą sobą", () => {
    expect(hasSelfMatch(deterministicRoundRobin(U10))).toBe(false);
    expect(hasSelfMatch(deterministicRoundRobin(U8))).toBe(false);
  });

  it("INV-13 — n(n-1)/2 dla obu formatów", () => {
    expect(roundRobinMatchCount(10)).toBe(45);
    expect(roundRobinMatchCount(7)).toBe(21);
    expect(expectedPairCount(10)).toBe(45);
    expect(expectedPairCount(7)).toBe(21);
  });
});

describe("INV-14..18 — liczby U10", () => {
  it("INV-14/17 — 45 na grupę, 90 na turniej", () => {
    const planned = plannedMatchesForScope({
      teamCount: 10,
      format: "league",
      playoffConfig: null,
    });

    expect(planned).toBe(45);
    expect(planned * 2).toBe(90);
  });

  it("INV-15 — 10 wierszy w tabeli", () => {
    expect(calculateStandings(buildGroup(U10, []))).toHaveLength(10);
  });

  it("INV-18 — remis jest legalnym wynikiem", () => {
    const rows = calculateStandings(
      buildGroup(["a", "b"], [match("a", "b", 2, 2)])
    );

    expect(rows.every((row) => row.points === 1)).toBe(true);
  });
});

describe("INV-19..27 — liczby U8", () => {
  const config = {
    qualifiedTeamCount: 4 as const,
    thirdPlaceMatch: true,
    placementMode: "placement_group" as const,
    tieBreaker: "penalties" as const,
  };

  it("INV-19/20 — 21 grupowych na grupę, 56 planowanych na turniej", () => {
    expect(roundRobinMatchCount(7)).toBe(21);

    const planned = plannedMatchesForScope({
      teamCount: 7,
      format: "group_playoff",
      playoffConfig: config,
    });

    expect(planned).toBe(28);
    expect(planned * 2).toBe(56);
  });

  it("INV-22 — seedy 1-4 występują dokładnie raz", () => {
    const pairs = buildFirstRoundPairs(4);
    const seeds = pairs.flat();

    expect(seeds).toHaveLength(4);
    expect([...seeds].sort()).toEqual([1, 2, 3, 4]);
  });

  it("INV-23/24 — minigrupa to dokładnie miejsca 5-7", () => {
    const skeleton = buildClassificationSkeleton({
      teamCount: 7,
      qualifiedTeamCount: 4,
      thirdPlaceMatch: true,
      placementMode: "placement_group",
    });

    const playoffPlaces = skeleton
      .filter((slot) => (slot.position ?? 99) <= 4)
      .map((slot) => slot.position);
    const placementPlaces = skeleton
      .filter((slot) => (slot.position ?? 0) >= 5)
      .map((slot) => slot.position);

    expect(playoffPlaces).toEqual([1, 2, 3, 4]);
    expect(placementPlaces).toEqual([5, 6, 7]);
    // Zbiory rozłączne — nikt nie jest jednocześnie w top-4 i w minigrupie.
    expect(
      playoffPlaces.filter((place) => placementPlaces.includes(place))
    ).toEqual([]);
  });

  it("INV-20 — bez minigrupy planowanych jest mniej", () => {
    expect(
      plannedMatchesForScope({
        teamCount: 7,
        format: "group_playoff",
        playoffConfig: { ...config, placementMode: "none" },
      })
    ).toBe(25);
  });
});

/* ==========================================================================
 * INV-28..32, 37, 38 — klasyfikacja końcowa i statystyki
 * ======================================================================== */

describe("INV-28..32, 37, 38 — klasyfikacja i statystyki", () => {
  /** Kompletny turniej U8 jednej grupy: 1-4 z drabinki, 5-7 z minigrupy. */
  const placement = resolvePlacementStandings({
    standings: calculateStandings(
      buildGroup(
        ["p5", "p6", "p7"],
        [
          match("p5", "p6", 1, 0, "A-placement"),
          match("p6", "p7", 1, 0, "A-placement"),
          match("p7", "p5", 1, 0, "A-placement"),
        ],
        "A-placement"
      )
    ),
    frozen: [
      { teamId: "p5", position: 5, goalDifference: 5 },
      { teamId: "p6", position: 6, goalDifference: 2 },
      { teamId: "p7", position: 7, goalDifference: -1 },
    ],
  });

  const classification = buildFinalClassification({
    scopeKey: "A",
    bracketMatches: [
      { kind: "final", homeTeamId: "s1", awayTeamId: "s2", homeScore: 3, awayScore: 1 },
      { kind: "third_place", homeTeamId: "s3", awayTeamId: "s4", homeScore: 2, awayScore: 0 },
    ],
    thirdPlaceMatch: true,
    placementStandings: placement.standings,
    placementComplete: true,
    placementUnresolvedTeamIds: placement.unresolvedTeamIds,
    frozenOrder: ["s1", "s2", "s3", "s4", "p5", "p6", "p7"],
  });

  const all = ["s1", "s2", "s3", "s4", "p5", "p6", "p7"];

  it("INV-28 — każda drużyna dokładnie raz w klasyfikacji", () => {
    const ids = classification.entries.map((entry) => entry.teamId);

    expect(ids).toHaveLength(7);
    expect([...ids].sort()).toEqual([...all].sort());
  });

  it("INV-29 — brak duplikatów teamId", () => {
    const ids = classification.entries.map((entry) => entry.teamId);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("INV-30 — brak uczestnika z innej grupy", () => {
    // Klasyfikacja grupy A zawiera WYŁĄCZNIE drużyny z jej własnej puli.
    const foreign = classification.entries.filter(
      (entry) => !all.includes(entry.teamId)
    );

    expect(foreign).toEqual([]);
  });

  it("INV-31 — sourceOrder nie wyznacza rozstrzygniętego miejsca", () => {
    /*
      Ta sama minigrupa, trzy różne kolejności rejestracji. Rozstrzygnięcie
      pochodzi z zamrożonej tabeli, więc wynik musi być identyczny.
    */
    const frozen = [
      { teamId: "p5", position: 5, goalDifference: 5 },
      { teamId: "p6", position: 6, goalDifference: 2 },
      { teamId: "p7", position: 7, goalDifference: -1 },
    ];

    for (const registration of [
      ["p5", "p6", "p7"],
      ["p7", "p6", "p5"],
      ["p6", "p5", "p7"],
    ]) {
      const resolved = resolvePlacementStandings({
        standings: calculateStandings(
          buildGroup(
            registration,
            [
              match("p5", "p6", 1, 0, "A-placement"),
              match("p6", "p7", 1, 0, "A-placement"),
              match("p7", "p5", 1, 0, "A-placement"),
            ],
            "A-placement"
          )
        ),
        frozen,
      });

      expect(resolved.standings.map((row) => row.teamId)).toEqual([
        "p5",
        "p6",
        "p7",
      ]);
    }
  });

  it("INV-32 — klasyfikacja identyczna w trzech widokach", () => {
    const mini = placement.standings.map((row) => [
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

    expect(final).toEqual(mini);
    expect(ranking).toEqual(mini);
  });

  it("INV-37 — statystyki sumują wszystkie etapy turnieju", () => {
    const stats = aggregateTeamStats({
      teamIds: ["s1", "s2"],
      matches: [
        // faza grupowa
        { homeTeamId: "s1", awayTeamId: "s2", homeScore: 2, awayScore: 1 },
        // półfinał
        { homeTeamId: "s1", awayTeamId: "s2", homeScore: 1, awayScore: 0 },
        // finał
        { homeTeamId: "s2", awayTeamId: "s1", homeScore: 1, awayScore: 3 },
        // mecz o 3. miejsce (bez wyniku — nie wchodzi)
        { homeTeamId: "s1", awayTeamId: "s2", homeScore: null, awayScore: null },
      ],
    });

    const s1 = stats.get("s1")!;

    expect(s1.played).toBe(3);
    expect(s1.wins).toBe(3);
    expect(s1.points).toBe(9);
    expect(s1.goalsFor).toBe(6);
    expect(s1.goalsAgainst).toBe(2);
    expect(s1.goalDifference).toBe(4);
  });

  it("INV-38 — miejsce jest niezależne od dorobku punktowego", () => {
    const stats = aggregateTeamStats({
      teamIds: ["s1", "s3"],
      matches: [
        // s3 zbiera komplet zwycięstw poza drabinką...
        { homeTeamId: "s3", awayTeamId: "s1", homeScore: 9, awayScore: 0 },
        { homeTeamId: "s3", awayTeamId: "s1", homeScore: 9, awayScore: 0 },
      ],
    });

    const ranking = buildRankingRows({
      ordered: [
        { teamId: "s1", position: 1 },
        { teamId: "s3", position: 3 },
      ],
      stats,
      presentation: new Map(),
    });

    // ...a mimo to mistrzem jest s1, bo o miejscu decyduje drabinka.
    expect(ranking[0].teamId).toBe("s1");
    expect(ranking[0].position).toBe(1);
    expect(ranking[1].teamId).toBe("s3");
    expect(ranking[1].position).toBe(3);
    expect(ranking[1].points).toBeGreaterThan(ranking[0].points);
  });
});
