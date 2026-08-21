import { describe, expect, it } from "vitest";

import { calculateStandings } from "@/lib/standings";
import { buildFirstRoundPairs, buildSeedOrder } from "@/lib/playoff/seeding";
import {
  describeMatchEditability,
  isMatchEditable,
} from "@/lib/playoff/editability";
import {
  buildPlayoffPreview,
  validateDecisiveScore,
  validateGroupStageCompletion,
  getLoser,
  getWinner,
} from "@/lib/playoff/rules";
import {
  buildClassificationSkeleton,
  buildFinalClassification,
} from "@/lib/playoff/classification";
import { resolvePlacementStandings } from "@/lib/playoff/placement";
import { buildRankingRows } from "@/lib/playoff/aggregate-stats";
import { plannedMatchesForScope } from "@/lib/playoff/planned-matches";
import type { StandingRow } from "@/types/tournament";

import { buildGroup, match } from "../helpers/scenario";

/**
 * U8 — warstwa czysta.
 *
 * Rozstawienie, bramkowanie faz, walidacja wyników, klasyfikacja końcowa
 * i resolver minigrupy. Zero bazy — te reguły są czystymi funkcjami.
 */

const CONFIG = { size: 4 as const, thirdPlaceMatch: true };

function standingRow(position: number, teamId: string, patch: Partial<StandingRow> = {}): StandingRow {
  return {
    position,
    teamId,
    teamName: teamId,
    logoText: teamId,
    played: 6,
    wins: 3,
    draws: 0,
    losses: 3,
    points: 9,
    goalsFor: 10,
    goalsAgainst: 10,
    goalDifference: 0,
    sourceOrder: position,
    isTieUnresolved: false,
    tieWithTeamIds: [],
    ...patch,
  };
}

/* ==========================================================================
 * U8-SEED
 * ======================================================================== */

describe("U8-SEED — rozstawienie", () => {
  it("U8-SEED01 — pary 1v4 i 2v3", () => {
    expect(buildFirstRoundPairs(4)).toEqual([
      [1, 4],
      [2, 3],
    ]);
    expect(buildSeedOrder(4)).toEqual([1, 4, 2, 3]);
  });

  it("U8-SEED05 — podgląd zostaje, ale zamrożenie jest zablokowane", () => {
    /*
      MATRIX POPRAWIONY: podgląd i decyzja oficjalna to dwie różne rzeczy.

      Prowizoryczne rozstawienie może być nadal pokazywane kibicowi —
      nie straszymy go remisem, którego organizator jeszcze nie rozstrzygnął.
      Ale ZAMROŻENIE, które zamienia tabelę w oficjalne seedy, musi zostać
      zablokowane.
    */
    const ambiguous = [
      standingRow(1, "t1"),
      standingRow(2, "t2"),
      standingRow(3, "t3"),
      standingRow(4, "t4", { isTieUnresolved: true }),
      standingRow(5, "t5", { isTieUnresolved: true }),
      standingRow(6, "t6"),
      standingRow(7, "t7"),
    ];

    const preview = buildPlayoffPreview({
      scopeKey: "A",
      standings: ambiguous,
      qualifiedTeamCount: 4,
    });

    // PODGLĄD: nadal daje komplet par.
    expect(preview.pairs).toHaveLength(2);

    // ZAMROŻENIE: zablokowane, dopóki remis nie zostanie rozstrzygnięty.
    const issues = validateGroupStageCompletion({
      scopeLabel: "Grupa A",
      teamCount: 7,
      playedMatchCount: 21,
      standings: ambiguous,
      qualifiedTeamCount: 4,
    });

    expect(issues).toHaveLength(1);
    expect(issues[0].reason).toContain("granicy awansu");
  });
});

/* ==========================================================================
 * U8-FRZ (walidacja czysta)
 * ======================================================================== */

describe("U8-FRZ — walidacja zamknięcia fazy grupowej", () => {
  const full = Array.from({ length: 7 }, (_, index) =>
    standingRow(index + 1, `t${index + 1}`)
  );

  it("U8-FRZ01 — 0/21 blokuje z komunikatem o brakach", () => {
    const issues = validateGroupStageCompletion({
      scopeLabel: "Grupa A",
      teamCount: 7,
      playedMatchCount: 0,
      standings: full,
      qualifiedTeamCount: 4,
    });

    expect(issues).toHaveLength(1);
    expect(issues[0].reason).toContain("21");
  });

  it("U8-FRZ02 — częściowo (10/21) blokuje", () => {
    const issues = validateGroupStageCompletion({
      scopeLabel: "Grupa A",
      teamCount: 7,
      playedMatchCount: 10,
      standings: full,
      qualifiedTeamCount: 4,
    });

    expect(issues[0].reason).toContain("11");
  });

  it("U8-FRZ03 — 20/21 nadal blokuje", () => {
    const issues = validateGroupStageCompletion({
      scopeLabel: "Grupa A",
      teamCount: 7,
      playedMatchCount: 20,
      standings: full,
      qualifiedTeamCount: 4,
    });

    expect(issues).toHaveLength(1);
    expect(issues[0].reason).toContain("1 meczów");
  });

  it("U8-FRZ04 — 21/21 z jednoznacznym rankingiem przechodzi", () => {
    expect(
      validateGroupStageCompletion({
        scopeLabel: "Grupa A",
        teamCount: 7,
        playedMatchCount: 21,
        standings: full,
        qualifiedTeamCount: 4,
      })
    ).toEqual([]);
  });

  it("U8-FRZ05 — remis w strefie awansu blokuje", () => {
    const ambiguous = full.map((row, index) =>
      index === 3 || index === 4
        ? { ...row, isTieUnresolved: true }
        : row
    );

    const issues = validateGroupStageCompletion({
      scopeLabel: "Grupa A",
      teamCount: 7,
      playedMatchCount: 21,
      standings: ambiguous,
      qualifiedTeamCount: 4,
    });

    expect(issues).toHaveLength(1);
    expect(issues[0].reason).toContain("granicy awansu");
    expect(issues[0].reason).toContain("t4");
    expect(issues[0].reason).toContain("t5");
  });

  it("U8-FRZ06 — remis poza strefą awansu nie blokuje", () => {
    const ambiguous = full.map((row, index) =>
      index === 5 || index === 6 ? { ...row, isTieUnresolved: true } : row
    );

    expect(
      validateGroupStageCompletion({
        scopeLabel: "Grupa A",
        teamCount: 7,
        playedMatchCount: 21,
        standings: ambiguous,
        qualifiedTeamCount: 4,
      })
    ).toEqual([]);
  });

  it("U8-FRZ08 — za mało drużyn blokuje", () => {
    const issues = validateGroupStageCompletion({
      scopeLabel: "Grupa A",
      teamCount: 3,
      playedMatchCount: 3,
      standings: full.slice(0, 3),
      qualifiedTeamCount: 4,
    });

    expect(issues.some((issue) => issue.reason.includes("4 drużyn"))).toBe(true);
  });
});

/* ==========================================================================
 * U8-GATE
 * ======================================================================== */

describe("U8-GATE — bramkowanie faz", () => {
  it("U8-GATE01 — finał w trakcie półfinałów jest oczekujący", () => {
    expect(
      describeMatchEditability({
        phase: "semifinal",
        ...CONFIG,
        stage: "bracket",
        kind: "final",
      })
    ).toBe("pending");
  });

  it("U8-GATE02 — półfinał po przejściu do finałów jest zamknięty", () => {
    expect(
      describeMatchEditability({
        phase: "final",
        ...CONFIG,
        stage: "bracket",
        kind: "semifinal",
      })
    ).toBe("completed");
  });

  it("U8-GATE03 — drabinka w fazie grupowej jest zablokowana", () => {
    for (const kind of ["semifinal", "final", "third_place"] as const) {
      expect(
        describeMatchEditability({
          phase: "group_stage",
          ...CONFIG,
          stage: "bracket",
          kind,
        })
      ).toBe("locked");
    }
  });

  it("U8-GATE04 — minigrupa jest edytowalna przez cały play-off", () => {
    for (const phase of ["semifinal", "final"] as const) {
      expect(
        isMatchEditable({
          phase,
          ...CONFIG,
          stage: "placement_group",
        })
      ).toBe(true);
    }
  });

  it("U8-GATE05 — minigrupa w fazie grupowej jest zablokowana", () => {
    expect(
      describeMatchEditability({
        phase: "group_stage",
        ...CONFIG,
        stage: "placement_group",
      })
    ).toBe("locked");
  });

  it("U8-GATE06 — po zakończeniu wszystko jest zamknięte", () => {
    expect(
      describeMatchEditability({
        phase: "completed",
        ...CONFIG,
        stage: "bracket",
        kind: "final",
      })
    ).toBe("completed");
    expect(
      describeMatchEditability({
        phase: "completed",
        ...CONFIG,
        stage: "placement_group",
      })
    ).toBe("completed");
  });

  it("mecz o 3. miejsce należy do fazy finałowej", () => {
    expect(
      isMatchEditable({
        phase: "final",
        ...CONFIG,
        stage: "bracket",
        kind: "third_place",
      })
    ).toBe(true);
  });
});

/* ==========================================================================
 * U8-SF / U8-FIN — rozstrzygnięcia i walidacja
 * ======================================================================== */

describe("U8-SF / U8-FIN — zwycięzcy i remisy", () => {
  it("U8-SF01..04 — zwycięzca i przegrany półfinału", () => {
    const cases = [
      { home: "s1", away: "s4", hs: 3, as: 1, winner: "s1", loser: "s4" },
      { home: "s1", away: "s4", hs: 1, as: 3, winner: "s4", loser: "s1" },
      { home: "s2", away: "s3", hs: 2, as: 0, winner: "s2", loser: "s3" },
      { home: "s2", away: "s3", hs: 0, as: 2, winner: "s3", loser: "s2" },
    ];

    for (const entry of cases) {
      const played = {
        homeTeamId: entry.home,
        awayTeamId: entry.away,
        homeScore: entry.hs,
        awayScore: entry.as,
      };

      expect(getWinner(played)).toBe(entry.winner);
      expect(getLoser(played)).toBe(entry.loser);
    }
  });

  it("U8-SF05..08 — cztery kombinacje finalistów są rozłączne", () => {
    const combos = [
      ["s1", "s2"],
      ["s1", "s3"],
      ["s4", "s2"],
      ["s4", "s3"],
    ];

    for (const [finalHome, finalAway] of combos) {
      const thirdHome = finalHome === "s1" ? "s4" : "s1";
      const thirdAway = finalAway === "s2" ? "s3" : "s2";

      const classification = buildFinalClassification({
        scopeKey: "A",
        bracketMatches: [
          { kind: "final", homeTeamId: finalHome, awayTeamId: finalAway, homeScore: 2, awayScore: 1 },
          { kind: "third_place", homeTeamId: thirdHome, awayTeamId: thirdAway, homeScore: 1, awayScore: 0 },
        ],
        thirdPlaceMatch: true,
        placementStandings: null,
        placementComplete: true,
        frozenOrder: [],
      });

      const top = classification.entries.filter((entry) => (entry.position ?? 9) <= 4);

      expect(top.map((entry) => entry.position)).toEqual([1, 2, 3, 4]);
      expect(new Set(top.map((entry) => entry.teamId)).size).toBe(4);
    }
  });

  it("U8-SF09 / U8-FIN05 / U8-FIN06 — remis w play-off jest odrzucany", () => {
    const result = validateDecisiveScore(2, 2);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("rzutach karnych");

    expect(validateDecisiveScore(3, 2).ok).toBe(true);
    expect(validateDecisiveScore(null, null).ok).toBe(true);
    expect(validateDecisiveScore(1, null).ok).toBe(false);
    expect(validateDecisiveScore(-1, 0).ok).toBe(false);
  });

  it("U8-FIN01..04 — finał i mecz o 3. miejsce obsadzają 1-4", () => {
    const classification = buildFinalClassification({
      scopeKey: "A",
      bracketMatches: [
        { kind: "final", homeTeamId: "W", awayTeamId: "X", homeScore: 1, awayScore: 4 },
        { kind: "third_place", homeTeamId: "Y", awayTeamId: "Z", homeScore: 0, awayScore: 2 },
      ],
      thirdPlaceMatch: true,
      placementStandings: null,
      placementComplete: true,
      frozenOrder: [],
    });

    expect(
      classification.entries.map((entry) => [entry.position, entry.teamId])
    ).toEqual([
      [1, "X"],
      [2, "W"],
      [3, "Z"],
      [4, "Y"],
    ]);
  });

  it("U8-FIN07 — bez meczu o 3. miejsce przegrani dzielą miejsca", () => {
    const classification = buildFinalClassification({
      scopeKey: "A",
      bracketMatches: [
        { kind: "semifinal", homeTeamId: "s1", awayTeamId: "s4", homeScore: 2, awayScore: 1 },
        { kind: "semifinal", homeTeamId: "s2", awayTeamId: "s3", homeScore: 0, awayScore: 3 },
        { kind: "final", homeTeamId: "s1", awayTeamId: "s3", homeScore: 1, awayScore: 0 },
      ],
      thirdPlaceMatch: false,
      placementStandings: null,
      placementComplete: true,
      frozenOrder: [],
    });

    const shared = classification.entries.filter((entry) => entry.shared);

    expect(shared).toHaveLength(2);
    expect(shared.every((entry) => entry.position === null)).toBe(true);

    /*
      MATRIX PB-03: dwa miejsca są nieobsadzone, a mimo to klasyfikacja
      raportuje komplet. Zgodnie z kontraktem test ma to wykazać.
    */
    expect(classification.complete).toBe(false);
  });

  it("U8-FIN07 — z zamrożoną tabelą przegrani półfinałów dostają miejsca", () => {
    const classification = buildFinalClassification({
      scopeKey: "A",
      bracketMatches: [
        { kind: "semifinal", homeTeamId: "s1", awayTeamId: "s4", homeScore: 2, awayScore: 1 },
        { kind: "semifinal", homeTeamId: "s2", awayTeamId: "s3", homeScore: 0, awayScore: 3 },
        { kind: "final", homeTeamId: "s1", awayTeamId: "s3", homeScore: 1, awayScore: 0 },
      ],
      thirdPlaceMatch: false,
      placementStandings: null,
      placementComplete: true,
      frozenOrder: ["s1", "s2", "s3", "s4"],
    });

    const ranked = classification.entries.filter((entry) => entry.position !== null);

    expect(ranked.map((entry) => [entry.position, entry.teamId])).toEqual([
      [1, "s1"],
      [2, "s3"],
      [3, "s2"],
      [4, "s4"],
    ]);
  });
});

/* ==========================================================================
 * U8-PLC / U8-PLF — minigrupa
 * ======================================================================== */

describe("U8-PLC — minigrupa, przypadki normalne", () => {
  const placementGroup = (matches: ReturnType<typeof match>[]) =>
    calculateStandings(buildGroup(["p5", "p6", "p7"], matches, "A-placement"));

  it("U8-PLC01 — różne punkty dają kolejność wprost", () => {
    const rows = placementGroup([
      match("p5", "p6", 3, 0, "A-placement"),
      match("p5", "p7", 2, 0, "A-placement"),
      match("p6", "p7", 1, 0, "A-placement"),
    ]);

    expect(rows.map((row) => row.teamId)).toEqual(["p5", "p6", "p7"]);
    expect(rows.map((row) => row.points)).toEqual([6, 3, 0]);
  });

  it("U8-PLC02 — remis dwóch rozstrzyga mecz bezpośredni", () => {
    const rows = placementGroup([
      match("p5", "p6", 0, 1, "A-placement"),
      match("p5", "p7", 5, 0, "A-placement"),
      match("p6", "p7", 1, 0, "A-placement"),
    ]);

    // p6 ma komplet 6 pkt, p5 i p7 pozostają — a p5 wygrało bezpośredni.
    expect(rows[0].teamId).toBe("p6");
    expect(rows[1].teamId).toBe("p5");
  });

  it("U8-PLC03/04/05 — trzy drużyny idą przez małą tabelę, GF i GA", () => {
    const cycle = [
      match("p5", "p6", 1, 0, "A-placement"),
      match("p6", "p7", 1, 0, "A-placement"),
      match("p7", "p5", 1, 0, "A-placement"),
    ];

    const rows = placementGroup(cycle);

    // Cykl: mała tabela = cała minigrupa, wszystko równe.
    expect(rows.every((row) => row.isTieUnresolved)).toBe(true);
    expect(rows.every((row) => row.goalDifference === 0)).toBe(true);
    expect(rows.every((row) => row.goalsFor === 1)).toBe(true);
  });

  it("U8-PLC07 — minigrupa to round robin trójki: trzy unikalne pary", () => {
    const planned = plannedMatchesForScope({
      teamCount: 7,
      format: "group_playoff",
      playoffConfig: {
        qualifiedTeamCount: 4,
        thirdPlaceMatch: true,
        placementMode: "placement_group",
        tieBreaker: "penalties",
      },
    });

    // 21 grupowych + 3 drabinki + 1 o 3. miejsce + 3 minigrupy = 28.
    expect(planned).toBe(28);
    expect(planned * 2).toBe(56);
  });
});

describe("U8-PLF — fallback regulaminowy minigrupy", () => {
  const circle = calculateStandings(
    buildGroup(
      ["p5", "p6", "p7"],
      [
        match("p5", "p6", 1, 0, "A-placement"),
        match("p6", "p7", 1, 0, "A-placement"),
        match("p7", "p5", 1, 0, "A-placement"),
      ],
      "A-placement"
    )
  );

  it("U8-PLF01 — pełny cykl nie rozstrzyga się sam", () => {
    expect(circle.every((row) => row.isTieUnresolved)).toBe(true);
    expect(circle.every((row) => row.points === 3)).toBe(true);
  });

  it("U8-PLF02 — frozen GD rozdziela wszystkich", () => {
    const { standings, unresolvedTeamIds } = resolvePlacementStandings({
      standings: circle,
      frozen: [
        { teamId: "p5", position: 5, goalDifference: 5 },
        { teamId: "p6", position: 6, goalDifference: 2 },
        { teamId: "p7", position: 7, goalDifference: -1 },
      ],
    });

    expect(standings.map((row) => row.teamId)).toEqual(["p5", "p6", "p7"]);
    expect(standings.every((row) => !row.isTieUnresolved)).toBe(true);
    expect(unresolvedTeamIds).toEqual([]);
  });

  it("U8-PLF03 — częściowy remis frozen GD schodzi do miejsca w grupie", () => {
    const { standings } = resolvePlacementStandings({
      standings: circle,
      frozen: [
        { teamId: "p5", position: 5, goalDifference: 5 },
        { teamId: "p6", position: 6, goalDifference: 2 },
        { teamId: "p7", position: 7, goalDifference: 2 },
      ],
    });

    expect(standings.map((row) => row.teamId)).toEqual(["p5", "p6", "p7"]);
  });

  it("U8-PLF04 — wszystkie frozen GD równe: decyduje miejsce", () => {
    const { standings } = resolvePlacementStandings({
      standings: circle,
      frozen: [
        { teamId: "p5", position: 7, goalDifference: 0 },
        { teamId: "p6", position: 5, goalDifference: 0 },
        { teamId: "p7", position: 6, goalDifference: 0 },
      ],
    });

    expect(standings.map((row) => row.teamId)).toEqual(["p6", "p7", "p5"]);
  });

  it("U8-PLF05 — kolejność rejestracji nie ma wpływu", () => {
    const frozen = [
      { teamId: "p5", position: 5, goalDifference: 5 },
      { teamId: "p6", position: 6, goalDifference: 2 },
      { teamId: "p7", position: 7, goalDifference: -1 },
    ];

    for (const order of [
      ["p5", "p6", "p7"],
      ["p7", "p6", "p5"],
      ["p6", "p5", "p7"],
    ]) {
      const rows = calculateStandings(
        buildGroup(
          order,
          [
            match("p5", "p6", 1, 0, "A-placement"),
            match("p6", "p7", 1, 0, "A-placement"),
            match("p7", "p5", 1, 0, "A-placement"),
          ],
          "A-placement"
        )
      );

      const { standings } = resolvePlacementStandings({ standings: rows, frozen });
      expect(standings.map((row) => row.teamId)).toEqual(["p5", "p6", "p7"]);
    }
  });

  it("U8-PLF06 — brak danych frozen: zero wymyślania miejsc", () => {
    const { standings, unresolvedTeamIds } = resolvePlacementStandings({
      standings: circle,
      frozen: [],
    });

    expect(standings.every((row) => row.isTieUnresolved)).toBe(true);
    expect([...unresolvedTeamIds].sort()).toEqual(["p5", "p6", "p7"]);

    const classification = buildFinalClassification({
      scopeKey: "A",
      bracketMatches: [
        { kind: "final", homeTeamId: "W", awayTeamId: "X", homeScore: 2, awayScore: 1 },
        { kind: "third_place", homeTeamId: "Y", awayTeamId: "Z", homeScore: 1, awayScore: 0 },
      ],
      thirdPlaceMatch: true,
      placementStandings: standings,
      placementComplete: true,
      placementUnresolvedTeamIds: unresolvedTeamIds,
      frozenOrder: [],
    });

    expect(classification.complete).toBe(false);
    expect(classification.missing).toContain("rozstrzygnięcie miejsc poza podium");
  });

  it("U8-PLF07 — niepełne dane frozen nie wystarczą", () => {
    const { unresolvedTeamIds } = resolvePlacementStandings({
      standings: circle,
      frozen: [{ teamId: "p5", position: 5, goalDifference: 5 }],
    });

    expect(unresolvedTeamIds).toHaveLength(3);
  });

  it("U8-PLF08 — rozstrzygnięta minigrupa przechodzi bez zmian", () => {
    const decided = calculateStandings(
      buildGroup(
        ["p5", "p6", "p7"],
        [
          match("p5", "p6", 3, 0, "A-placement"),
          match("p5", "p7", 2, 0, "A-placement"),
          match("p6", "p7", 1, 0, "A-placement"),
        ],
        "A-placement"
      )
    );

    const { standings, unresolvedTeamIds } = resolvePlacementStandings({
      standings: decided,
      frozen: [],
    });

    expect(standings).toEqual(decided);
    expect(unresolvedTeamIds).toEqual([]);
  });

  it("U8-PLF09 — minigrupa ma pierwszeństwo nad frozen", () => {
    const decided = calculateStandings(
      buildGroup(
        ["p5", "p6", "p7"],
        [
          match("p5", "p6", 3, 0, "A-placement"),
          match("p5", "p7", 2, 0, "A-placement"),
          match("p6", "p7", 1, 0, "A-placement"),
        ],
        "A-placement"
      )
    );

    // Frozen sugeruje odwrotność — i nie ma tu nic do powiedzenia.
    const { standings } = resolvePlacementStandings({
      standings: decided,
      frozen: [
        { teamId: "p5", position: 7, goalDifference: -9 },
        { teamId: "p6", position: 6, goalDifference: 0 },
        { teamId: "p7", position: 5, goalDifference: 9 },
      ],
    });

    expect(standings.map((row) => row.teamId)).toEqual(["p5", "p6", "p7"]);
  });
});

/* ==========================================================================
 * U8-CLS / U8-CONS
 * ======================================================================== */

describe("U8-CLS / U8-CONS — klasyfikacja i spójność", () => {
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
      { kind: "final", homeTeamId: "W", awayTeamId: "X", homeScore: 2, awayScore: 1 },
      { kind: "third_place", homeTeamId: "Y", awayTeamId: "Z", homeScore: 3, awayScore: 0 },
    ],
    thirdPlaceMatch: true,
    placementStandings: placement.standings,
    placementComplete: true,
    placementUnresolvedTeamIds: placement.unresolvedTeamIds,
    frozenOrder: ["W", "X", "Y", "Z", "p5", "p6", "p7"],
  });

  it("U8-CLS01..03/05 — komplet 1-7 bez dziur i bez duplikatów", () => {
    const entries = classification.entries;

    expect(entries.map((entry) => entry.position)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(new Set(entries.map((entry) => entry.teamId)).size).toBe(7);
    expect(classification.complete).toBe(true);
    expect(classification.missing).toEqual([]);
  });

  it("U8-CLS01..03 — źródła miejsc są zgodne z formatem", () => {
    const bySource = new Map(
      classification.entries.map((entry) => [entry.position, entry.source])
    );

    expect(bySource.get(1)).toBe("final");
    expect(bySource.get(2)).toBe("final");
    expect(bySource.get(3)).toBe("third_place");
    expect(bySource.get(4)).toBe("third_place");
    expect(bySource.get(5)).toBe("placement_group");
    expect(bySource.get(7)).toBe("placement_group");
  });

  it("U8-CLS07 — brak finału zgłasza brak", () => {
    const open = buildFinalClassification({
      scopeKey: "A",
      bracketMatches: [
        { kind: "final", homeTeamId: "W", awayTeamId: "X", homeScore: null, awayScore: null },
      ],
      thirdPlaceMatch: false,
      placementStandings: null,
      placementComplete: true,
      frozenOrder: [],
    });

    expect(open.complete).toBe(false);
    expect(open.missing).toContain("finał");
  });

  it("U8-CLS08 — niekompletna minigrupa zgłasza brak", () => {
    const open = buildFinalClassification({
      scopeKey: "A",
      bracketMatches: [
        { kind: "final", homeTeamId: "W", awayTeamId: "X", homeScore: 2, awayScore: 1 },
        { kind: "third_place", homeTeamId: "Y", awayTeamId: "Z", homeScore: 1, awayScore: 0 },
      ],
      thirdPlaceMatch: true,
      placementStandings: placement.standings,
      placementComplete: false,
      frozenOrder: [],
    });

    expect(open.complete).toBe(false);
    expect(open.missing).toContain("minigrupa klasyfikacyjna");
  });

  it("U8-CLS09 — szkielet ma 7 slotów z miejscami 1-7", () => {
    const skeleton = buildClassificationSkeleton({
      teamCount: 7,
      qualifiedTeamCount: 4,
      thirdPlaceMatch: true,
      placementMode: "placement_group",
    });

    expect(skeleton).toHaveLength(7);
    expect(skeleton.map((slot) => slot.position)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(skeleton.every((slot) => !slot.shared)).toBe(true);
  });

  it("U8-CLS10 — bez meczu o 3. miejsce szkielet ma sloty dzielone", () => {
    const skeleton = buildClassificationSkeleton({
      teamCount: 7,
      qualifiedTeamCount: 4,
      thirdPlaceMatch: false,
      placementMode: "placement_group",
    });

    const shared = skeleton.filter((slot) => slot.shared);

    expect(shared).toHaveLength(2);
    expect(shared.every((slot) => slot.label === "3–4")).toBe(true);
  });

  it("U8-CONS01 — minitabela, klasyfikacja i Ranking mówią to samo", () => {
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

    expect(mini).toEqual([
      [5, "p5"],
      [6, "p6"],
      [7, "p7"],
    ]);
    expect(final).toEqual(mini);
    expect(ranking).toEqual(mini);
  });

  it("U8-CONS02 — nierozstrzygnięte miejsce widać wszędzie tak samo", () => {
    const stuck = resolvePlacementStandings({
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
      frozen: [],
    });

    const open = buildFinalClassification({
      scopeKey: "A",
      bracketMatches: [
        { kind: "final", homeTeamId: "W", awayTeamId: "X", homeScore: 2, awayScore: 1 },
        { kind: "third_place", homeTeamId: "Y", awayTeamId: "Z", homeScore: 1, awayScore: 0 },
      ],
      thirdPlaceMatch: true,
      placementStandings: stuck.standings,
      placementComplete: true,
      placementUnresolvedTeamIds: stuck.unresolvedTeamIds,
      frozenOrder: [],
    });

    // Minitabela: znak zapytania.
    expect(stuck.standings.every((row) => row.isTieUnresolved)).toBe(true);
    // Klasyfikacja: brak pozycji.
    expect(
      open.entries.filter((entry) => entry.position === null).map((e) => e.teamId).sort()
    ).toEqual(["p5", "p6", "p7"]);

    // Ranking: flaga zamiast numeru.
    const ranking = buildRankingRows({
      ordered: open.entries.map((entry) => ({
        teamId: entry.teamId,
        position: entry.position,
      })),
      stats: new Map(),
      presentation: new Map(),
    });

    expect(
      ranking.filter((row) => row.isTieUnresolved).map((row) => row.teamId).sort()
    ).toEqual(["p5", "p6", "p7"]);
  });

  it("U8-CONS04 — Ranking nie dokleja miejsc z kolejności rejestracji", () => {
    const ranking = buildRankingRows({
      ordered: [
        { teamId: "W", position: 1 },
        { teamId: "X", position: 2 },
        { teamId: "spoza", position: null },
      ],
      stats: new Map(),
      presentation: new Map(),
    });

    expect(ranking[2].isTieUnresolved).toBe(true);
    expect(ranking[2].tieNote).toContain("nierozstrzygnięte");
  });

  it("U8-CLS04 — dorobek punktowy nie przesuwa miejsc play-off", () => {
    const stats = new Map([
      ["W", { teamId: "W", played: 6, wins: 3, draws: 0, losses: 3, points: 9, goalsFor: 9, goalsAgainst: 9, goalDifference: 0 }],
      ["Y", { teamId: "Y", played: 6, wins: 6, draws: 0, losses: 0, points: 18, goalsFor: 30, goalsAgainst: 0, goalDifference: 30 }],
    ]);

    const ranking = buildRankingRows({
      ordered: [
        { teamId: "W", position: 1 },
        { teamId: "Y", position: 3 },
      ],
      stats,
      presentation: new Map(),
    });

    // Y ma dwa razy więcej punktów, a mimo to jest trzecie.
    expect(ranking[0].teamId).toBe("W");
    expect(ranking[1].teamId).toBe("Y");
    expect(ranking[1].points).toBeGreaterThan(ranking[0].points);
    expect(ranking[1].position).toBe(3);
  });
});
