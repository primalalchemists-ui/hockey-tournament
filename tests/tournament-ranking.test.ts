import { describe, expect, it } from "vitest";

import {
  aggregateTeamStats,
  buildRankingRows,
  WIN_POINTS,
} from "@/lib/playoff/aggregate-stats";
import { buildFinalClassification } from "@/lib/playoff/classification";
import type { StandingRow } from "@/types/tournament";

/**
 * RANKING CAŁEGO TURNIEJU.
 *
 * W formacie z play-offem tabela nie kończy życia po fazie grupowej:
 * liczby sumują wszystkie rozegrane mecze, ale o KOLEJNOŚCI decyduje etap
 * turnieju, nigdy liczba punktów.
 */

function match(home: string, away: string, hs: number | null, as: number | null) {
  return { homeTeamId: home, awayTeamId: away, homeScore: hs, awayScore: as };
}

/** Kolejnosc z jawnymi miejscami — ranking nie dostaje juz golej listy. */
function ranked(teamIds: string[]) {
  return teamIds.map((teamId, index) => ({ teamId, position: index + 1 }));
}

describe("X-AA: punktacja we wszystkich rodzajach meczów", () => {
  it("X: wygrana w grupie daje 3 punkty", () => {
    const stats = aggregateTeamStats({
      teamIds: ["a", "b"],
      matches: [match("a", "b", 4, 1)],
    });

    expect(stats.get("a")!.points).toBe(WIN_POINTS);
    expect(stats.get("b")!.points).toBe(0);
  });

  it("Y/Z/AA: wygrana w play-off, o 3. miejsce i w minigrupie liczy tak samo", () => {
    // Reguła zamrożona: 3 punkty za zwycięstwo, niezależnie od rodzaju meczu.
    const stats = aggregateTeamStats({
      teamIds: ["a", "b"],
      matches: [
        match("a", "b", 2, 1), // grupa
        match("a", "b", 3, 2), // półfinał
        match("a", "b", 1, 0), // mecz o 3. miejsce
        match("a", "b", 5, 4), // minigrupa
      ],
    });

    expect(stats.get("a")!.points).toBe(4 * WIN_POINTS);
    expect(stats.get("a")!.wins).toBe(4);
    expect(stats.get("b")!.losses).toBe(4);
  });

  it("remis w fazie round-robin daje po punkcie", () => {
    const stats = aggregateTeamStats({
      teamIds: ["a", "b"],
      matches: [match("a", "b", 2, 2)],
    });

    expect(stats.get("a")!.points).toBe(1);
    expect(stats.get("b")!.draws).toBe(1);
  });
});

describe("AB-AD: sumowanie statystyk", () => {
  const stats = aggregateTeamStats({
    teamIds: ["a", "b", "c"],
    matches: [
      match("a", "b", 3, 1), // grupa
      match("a", "c", 2, 2), // grupa
      match("a", "b", 4, 0), // półfinał
      match("b", "c", 1, 0), // mecz o 3. miejsce
      match("a", "b", null, null), // zaplanowany — nie liczy się
    ],
  });

  it("AB: statystyki obejmują grupę i play-off razem", () => {
    expect(stats.get("a")!.points).toBe(WIN_POINTS + 1 + WIN_POINTS);
  });

  it("AC: bramki sumują się poprawnie w obie strony", () => {
    expect(stats.get("a")!.goalsFor).toBe(3 + 2 + 4);
    expect(stats.get("a")!.goalsAgainst).toBe(1 + 2 + 0);
    expect(stats.get("a")!.goalDifference).toBe(9 - 3);
  });

  it("AD: liczba meczów liczy tylko rozegrane", () => {
    expect(stats.get("a")!.played).toBe(3);
    expect(stats.get("b")!.played).toBe(3);
    expect(stats.get("c")!.played).toBe(2);
  });
});

describe("AE-AH: kolejność wierszy zależy od etapu", () => {
  const stats = aggregateTeamStats({
    teamIds: ["mistrz", "finalista", "trzeci"],
    matches: [
      // „trzeci" nazbierał najwięcej punktów w grupie...
      match("trzeci", "mistrz", 5, 0),
      match("trzeci", "finalista", 5, 0),
      // ...ale to mistrz wygrał finał.
      match("mistrz", "finalista", 1, 0),
    ],
  });

  const presentation = new Map(
    ["mistrz", "finalista", "trzeci"].map((teamId, index) => [
      teamId,
      { teamName: teamId, sourceOrder: index },
    ])
  );

  it("AF: po zamrożeniu kolejność bierze się ze snapshotu, nie z punktów", () => {
    const frozen = ["mistrz", "finalista", "trzeci"];

    const rows = buildRankingRows({
      ordered: ranked(frozen),
      stats,
      presentation,
    });

    expect(rows.map((row) => row.teamId)).toEqual(frozen);
    // „trzeci" ma najwięcej punktów, a mimo to jest ostatni.
    expect(rows[2].points).toBeGreaterThan(rows[0].points);
  });

  it("AG: liczby żyją, choć kolejność stoi w miejscu", () => {
    const frozen = ["mistrz", "finalista", "trzeci"];

    const before = buildRankingRows({
      ordered: ranked(frozen),
      stats: aggregateTeamStats({ teamIds: frozen, matches: [] }),
      presentation,
    });

    const after = buildRankingRows({ ordered: ranked(frozen), stats, presentation });

    expect(before.map((row) => row.teamId)).toEqual(
      after.map((row) => row.teamId)
    );
    expect(before[0].played).toBe(0);
    expect(after[0].played).toBeGreaterThan(0);
  });

  it("AH: po zakończeniu kolejność to klasyfikacja końcowa", () => {
    const rows = buildRankingRows({
      ordered: ranked(["mistrz", "finalista", "trzeci"]),
      stats,
      presentation,
    });

    expect(rows[0].teamId).toBe("mistrz");
    expect(rows[0].position).toBe(1);
  });
});

/* ==========================================================================
 * AI-AO: KLASYFIKACJA KOŃCOWA I REGUŁY ZAPASOWE
 * ======================================================================== */

function standing(position: number, teamId: string): StandingRow {
  return {
    position,
    teamId,
    teamName: teamId,
    played: 6,
    wins: 3,
    draws: 0,
    losses: 3,
    points: 9,
    goalsFor: 10,
    goalsAgainst: 10,
    goalDifference: 0,
    sourceOrder: position,
  };
}

const SEMIFINALS = [
  { kind: "semifinal", homeTeamId: "t1", awayTeamId: "t4", homeScore: 3, awayScore: 1 },
  { kind: "semifinal", homeTeamId: "t2", awayTeamId: "t3", homeScore: 2, awayScore: 4 },
];

const FINAL = {
  kind: "final",
  homeTeamId: "t1",
  awayTeamId: "t3",
  homeScore: 5,
  awayScore: 2,
};

describe("AI: mecz o 3. miejsce rozstrzyga jak dotąd", () => {
  it("miejsca 3 i 4 pochodzą z wyniku meczu", () => {
    const result = buildFinalClassification({
      scopeKey: "A",
      bracketMatches: [
        ...SEMIFINALS,
        FINAL,
        {
          kind: "third_place",
          homeTeamId: "t4",
          awayTeamId: "t2",
          homeScore: 1,
          awayScore: 0,
        },
      ],
      thirdPlaceMatch: true,
      placementStandings: null,
      placementComplete: true,
      frozenOrder: ["t2", "t1", "t3", "t4"],
    });

    expect(
      result.entries.map((entry) => [entry.position, entry.teamId])
    ).toEqual([
      [1, "t1"],
      [2, "t3"],
      // Wynik meczu wygrywa z tabelą grupową — t4 było ostatnie w grupie.
      [3, "t4"],
      [4, "t2"],
    ]);
  });
});

describe("AJ: bez meczu o 3. miejsce decyduje zamrożona tabela", () => {
  it("lepsze miejsce w grupie daje 3. lokatę", () => {
    const result = buildFinalClassification({
      scopeKey: "A",
      bracketMatches: [...SEMIFINALS, FINAL],
      thirdPlaceMatch: false,
      placementStandings: null,
      placementComplete: true,
      // t2 było w grupie wyżej niż t4.
      frozenOrder: ["t1", "t2", "t3", "t4"],
    });

    const tail = result.entries.filter((entry) => entry.source === "semifinal");

    expect(tail.map((entry) => [entry.position, entry.teamId])).toEqual([
      [3, "t2"],
      [4, "t4"],
    ]);
    // Żadnego miejsca dzielonego i żadnego wymyślonego meczu.
    expect(tail.every((entry) => !entry.shared)).toBe(true);
  });

  it("bez zamrożonej tabeli miejsca pozostają dzielone", () => {
    const result = buildFinalClassification({
      scopeKey: "A",
      bracketMatches: [...SEMIFINALS, FINAL],
      thirdPlaceMatch: false,
      placementStandings: null,
      placementComplete: true,
    });

    const tail = result.entries.filter((entry) => entry.source === "semifinal");

    expect(tail.every((entry) => entry.shared)).toBe(true);
  });
});

describe("AK/AL: drużyny spoza drabinki", () => {
  it("AK: z minigrupą miejsca 5+ pochodzą z jej tabeli", () => {
    const result = buildFinalClassification({
      scopeKey: "A",
      bracketMatches: [
        ...SEMIFINALS,
        FINAL,
        {
          kind: "third_place",
          homeTeamId: "t4",
          awayTeamId: "t2",
          homeScore: 1,
          awayScore: 0,
        },
      ],
      thirdPlaceMatch: true,
      placementStandings: [standing(1, "t6"), standing(2, "t5"), standing(3, "t7")],
      placementComplete: true,
      frozenOrder: ["t1", "t2", "t3", "t4", "t5", "t6", "t7"],
    });

    expect(
      result.entries.slice(4).map((entry) => [entry.position, entry.teamId])
    ).toEqual([
      [5, "t6"],
      [6, "t5"],
      [7, "t7"],
    ]);
  });

  it("AL: bez minigrupy szereguje je zamrożona tabela grupowa", () => {
    const result = buildFinalClassification({
      scopeKey: "A",
      bracketMatches: [
        ...SEMIFINALS,
        FINAL,
        {
          kind: "third_place",
          homeTeamId: "t4",
          awayTeamId: "t2",
          homeScore: 1,
          awayScore: 0,
        },
      ],
      thirdPlaceMatch: true,
      placementStandings: null,
      placementComplete: true,
      frozenOrder: ["t1", "t2", "t3", "t4", "t5", "t6", "t7"],
    });

    const tail = result.entries.filter(
      (entry) => entry.source === "group_standings"
    );

    expect(tail.map((entry) => [entry.position, entry.teamId])).toEqual([
      [5, "t5"],
      [6, "t6"],
      [7, "t7"],
    ]);
  });
});

describe("AM-AO: klasyfikacja bez dziur", () => {
  const result = buildFinalClassification({
    scopeKey: "A",
    bracketMatches: [...SEMIFINALS, FINAL],
    thirdPlaceMatch: false,
    placementStandings: null,
    placementComplete: true,
    frozenOrder: ["t1", "t2", "t3", "t4", "t5", "t6", "t7"],
  });

  it("AM: każde miejsce od 1 do N jest obsadzone dokładnie raz", () => {
    const positions = result.entries
      .map((entry) => entry.position)
      .filter((position): position is number => position !== null)
      .sort((a, b) => a - b);

    expect(positions).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(result.complete).toBe(true);
  });

  it("AN/AO: podium to pierwsze trzy miejsca tej samej klasyfikacji", () => {
    const podium = result.entries
      .filter((entry) => (entry.position ?? 99) <= 3)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

    expect(podium.map((entry) => entry.teamId)).toEqual(["t1", "t3", "t2"]);
  });
});
