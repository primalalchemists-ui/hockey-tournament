import { describe, expect, it } from "vitest";

import { buildFirstRoundPairs, buildSeedOrder } from "@/lib/playoff/seeding";
import {
  buildPhaseSequence,
  buildRoundKinds,
  getNextPhase,
  getPreviousPhase,
  getRoundKindsForPhase,
} from "@/lib/playoff/phases";
import { planBracket, planPlacementGroup } from "@/lib/playoff/bracket-plan";
import {
  buildPlayoffPreview,
  getLoser,
  getWinner,
  validateDecisiveScore,
  validateGroupScore,
  validateGroupStageCompletion,
} from "@/lib/playoff/rules";
import { buildFinalClassification } from "@/lib/playoff/classification";
import type { StandingRow } from "@/types/tournament";

function standingRow(
  position: number,
  teamId: string,
  overrides: Partial<StandingRow> = {}
): StandingRow {
  return {
    position,
    teamId,
    teamName: teamId.toUpperCase(),
    played: 6,
    wins: 3,
    draws: 0,
    losses: 3,
    points: 9,
    goalsFor: 10,
    goalsAgainst: 8,
    goalDifference: 2,
    sourceOrder: position,
    isTieUnresolved: false,
    ...overrides,
  };
}

/* ==========================================================================
 * SEEDING
 * ======================================================================== */

describe("rozstawienie drabinki", () => {
  it("2 drużyny: 1 vs 2", () => {
    expect(buildFirstRoundPairs(2)).toEqual([[1, 2]]);
  });

  it("4 drużyny: 1 vs 4 oraz 2 vs 3", () => {
    expect(buildFirstRoundPairs(4)).toEqual([
      [1, 4],
      [2, 3],
    ]);
  });

  it("8 drużyn: standardowe rozstawienie", () => {
    expect(buildFirstRoundPairs(8)).toEqual([
      [1, 8],
      [4, 5],
      [2, 7],
      [3, 6],
    ]);
  });

  it("16 drużyn: zbalansowana kolejność", () => {
    expect(buildSeedOrder(16)).toEqual([
      1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11,
    ]);
  });

  it.each([2, 4, 8, 16])(
    "każde rozstawienie %i zawiera wszystkie miejsca dokładnie raz",
    (size) => {
      const order = buildSeedOrder(size);

      expect(order).toHaveLength(size);
      expect(new Set(order).size).toBe(size);
      expect(Math.min(...order)).toBe(1);
      expect(Math.max(...order)).toBe(size);
    }
  );

  it("suma każdej pary pierwszej rundy jest stała (size + 1)", () => {
    for (const size of [2, 4, 8, 16] as const) {
      for (const [home, away] of buildFirstRoundPairs(size)) {
        expect(home + away).toBe(size + 1);
      }
    }
  });

  it("odrzuca rozmiar niebędący potęgą dwójki", () => {
    expect(() => buildSeedOrder(6)).toThrow();
  });
});

/* ==========================================================================
 * FAZY
 * ======================================================================== */

describe("sekwencja faz", () => {
  it("2 drużyny", () => {
    expect(buildPhaseSequence(2)).toEqual(["group_stage", "final", "completed"]);
  });

  it("4 drużyny", () => {
    expect(buildPhaseSequence(4)).toEqual([
      "group_stage",
      "semifinal",
      "final",
      "completed",
    ]);
  });

  it("8 drużyn", () => {
    expect(buildPhaseSequence(8)).toEqual([
      "group_stage",
      "quarterfinal",
      "semifinal",
      "final",
      "completed",
    ]);
  });

  it("16 drużyn", () => {
    expect(buildPhaseSequence(16)).toEqual([
      "group_stage",
      "round_of_16",
      "quarterfinal",
      "semifinal",
      "final",
      "completed",
    ]);
  });

  it("przejścia w przód i w tył są symetryczne", () => {
    expect(getNextPhase("group_stage", 8)).toBe("quarterfinal");
    expect(getNextPhase("semifinal", 8)).toBe("final");
    expect(getNextPhase("completed", 8)).toBeNull();

    expect(getPreviousPhase("final", 8)).toBe("semifinal");
    expect(getPreviousPhase("quarterfinal", 8)).toBe("group_stage");
    expect(getPreviousPhase("group_stage", 8)).toBeNull();
  });

  it("faza 'final' obejmuje mecz o 3. miejsce", () => {
    expect(getRoundKindsForPhase("final", true)).toEqual(["final", "third_place"]);
    expect(getRoundKindsForPhase("final", false)).toEqual(["final"]);
    expect(getRoundKindsForPhase("semifinal", true)).toEqual(["semifinal"]);
  });

  it("mecz o 3. miejsce nie jest osobną fazą", () => {
    expect(buildRoundKinds(4)).not.toContain("third_place");
    expect(buildPhaseSequence(4)).not.toContain("third_place");
  });
});

/* ==========================================================================
 * PLAN DRABINKI
 * ======================================================================== */

describe("plan drabinki", () => {
  it("4 drużyny + mecz o 3. miejsce", () => {
    const plan = planBracket({ scopeKey: "A", size: 4, thirdPlaceMatch: true });

    expect(plan.rounds.map((round) => round.kind)).toEqual([
      "semifinal",
      "final",
      "third_place",
    ]);

    const semifinals = plan.rounds[0];
    expect(semifinals.matches).toHaveLength(2);
    expect(semifinals.matches[0].homeSource).toEqual({ type: "seed", seed: 1 });
    expect(semifinals.matches[0].awaySource).toEqual({ type: "seed", seed: 4 });
    expect(semifinals.matches[1].homeSource).toEqual({ type: "seed", seed: 2 });
    expect(semifinals.matches[1].awaySource).toEqual({ type: "seed", seed: 3 });

    const final = plan.rounds[1].matches[0];
    expect(final.homeSource).toEqual({
      type: "winner",
      matchExternalId: semifinals.matches[0].externalId,
    });
    expect(final.awaySource).toEqual({
      type: "winner",
      matchExternalId: semifinals.matches[1].externalId,
    });

    const third = plan.rounds[2].matches[0];
    expect(third.homeSource).toEqual({
      type: "loser",
      matchExternalId: semifinals.matches[0].externalId,
    });
    expect(third.awaySource).toEqual({
      type: "loser",
      matchExternalId: semifinals.matches[1].externalId,
    });
  });

  it("8 drużyn buduje QF -> SF -> F z poprawną propagacją", () => {
    const plan = planBracket({ scopeKey: "A", size: 8, thirdPlaceMatch: false });

    expect(plan.rounds.map((r) => r.kind)).toEqual([
      "quarterfinal",
      "semifinal",
      "final",
    ]);
    expect(plan.rounds.map((r) => r.matchCount)).toEqual([4, 2, 1]);

    const qf = plan.rounds[0].matches;
    const sf = plan.rounds[1].matches;

    expect(sf[0].homeSource).toEqual({
      type: "winner",
      matchExternalId: qf[0].externalId,
    });
    expect(sf[0].awaySource).toEqual({
      type: "winner",
      matchExternalId: qf[1].externalId,
    });
    expect(sf[1].homeSource).toEqual({
      type: "winner",
      matchExternalId: qf[2].externalId,
    });
  });

  it("16 drużyn buduje cztery rundy", () => {
    const plan = planBracket({ scopeKey: "A", size: 16, thirdPlaceMatch: true });

    expect(plan.rounds.map((r) => r.kind)).toEqual([
      "round_of_16",
      "quarterfinal",
      "semifinal",
      "final",
      "third_place",
    ]);
    expect(plan.rounds.map((r) => r.matchCount)).toEqual([8, 4, 2, 1, 1]);
  });

  it("identyfikatory meczów są zależne od puli — grupy są niezależne", () => {
    const a = planBracket({ scopeKey: "A", size: 4, thirdPlaceMatch: true });
    const b = planBracket({ scopeKey: "B", size: 4, thirdPlaceMatch: true });

    const idsA = a.rounds.flatMap((r) => r.matches.map((m) => m.externalId));
    const idsB = b.rounds.flatMap((r) => r.matches.map((m) => m.externalId));

    expect(idsA.some((id) => idsB.includes(id))).toBe(false);
  });

  it("odrzuca mecz o 3. miejsce przy drabince dwudrużynowej", () => {
    expect(() =>
      planBracket({ scopeKey: "A", size: 2, thirdPlaceMatch: true })
    ).toThrow();
  });
});

/* ==========================================================================
 * MINIGRUPA
 * ======================================================================== */

describe("plan minigrupy", () => {
  it("3 drużyny dają 3 mecze każdy z każdym", () => {
    const plan = planPlacementGroup({
      scopeKey: "A",
      teamExternalIds: ["t5", "t6", "t7"],
    });

    expect(plan).toHaveLength(3);
    expect(plan.map((m) => [m.homeTeamId, m.awayTeamId])).toEqual([
      ["t5", "t6"],
      ["t5", "t7"],
      ["t6", "t7"],
    ]);
  });

  it("5 drużyn daje 10 meczów", () => {
    const plan = planPlacementGroup({
      scopeKey: "A",
      teamExternalIds: ["a", "b", "c", "d", "e"],
    });

    expect(plan).toHaveLength(10);
    expect(new Set(plan.map((m) => m.externalId)).size).toBe(10);
  });

  it("2 drużyny dają 1 mecz", () => {
    expect(
      planPlacementGroup({ scopeKey: "A", teamExternalIds: ["a", "b"] })
    ).toHaveLength(1);
  });
});

/* ==========================================================================
 * REGUŁY WYNIKÓW
 * ======================================================================== */

describe("walidacja wyników", () => {
  it("play-off odrzuca remis", () => {
    const result = validateDecisiveScore(2, 2);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("rzutach karnych");
  });

  it("play-off akceptuje wynik rozstrzygnięty", () => {
    expect(validateDecisiveScore(2, 1).ok).toBe(true);
    expect(validateDecisiveScore(0, 1).ok).toBe(true);
  });

  it("odrzuca wynik ujemny i połowiczny", () => {
    expect(validateDecisiveScore(-1, 2).ok).toBe(false);
    expect(validateDecisiveScore(3, null).ok).toBe(false);
  });

  it("dopuszcza mecz nierozegrany", () => {
    expect(validateDecisiveScore(null, null).ok).toBe(true);
  });

  it("faza grupowa DOPUSZCZA remis", () => {
    expect(validateGroupScore(2, 2).ok).toBe(true);
    expect(validateGroupScore(-1, 0).ok).toBe(false);
  });

  it("wyłania zwycięzcę i przegranego", () => {
    const match = {
      homeTeamId: "a",
      awayTeamId: "b",
      homeScore: 3,
      awayScore: 1,
    };

    expect(getWinner(match)).toBe("a");
    expect(getLoser(match)).toBe("b");
  });

  it("remis nie ma zwycięzcy", () => {
    expect(
      getWinner({ homeTeamId: "a", awayTeamId: "b", homeScore: 1, awayScore: 1 })
    ).toBeNull();
  });
});

/* ==========================================================================
 * PODGLĄD ROZSTAWIENIA
 * ======================================================================== */

describe("podgląd rozstawienia w fazie grupowej", () => {
  const standings = [
    standingRow(1, "t1"),
    standingRow(2, "t2"),
    standingRow(3, "t3"),
    standingRow(4, "t4"),
    standingRow(5, "t5"),
  ];

  it("pokazuje 1v4 i 2v3 dla top 4", () => {
    const preview = buildPlayoffPreview({
      scopeKey: "A",
      standings,
      qualifiedTeamCount: 4,
    });

    expect(preview.isReliable).toBe(true);
    expect(preview.pairs).toHaveLength(2);
    expect(preview.pairs[0]).toMatchObject({
      homeSeed: 1,
      awaySeed: 4,
      homeTeamId: "t1",
      awayTeamId: "t4",
    });
    expect(preview.pairs[1]).toMatchObject({
      homeSeed: 2,
      awaySeed: 3,
      homeTeamId: "t2",
      awayTeamId: "t3",
    });
  });

  it("sygnalizuje zbyt małą liczbę drużyn", () => {
    const preview = buildPlayoffPreview({
      scopeKey: "A",
      standings: standings.slice(0, 3),
      qualifiedTeamCount: 4,
    });

    expect(preview.isReliable).toBe(false);
    expect(preview.warnings.join(" ")).toContain("4");
  });

  it("nie straszy kibica nierozstrzygniętym remisem w strefie awansu", () => {
    const ambiguous = [
      standingRow(1, "t1"),
      standingRow(2, "t2", { isTieUnresolved: true }),
      standingRow(3, "t3", { isTieUnresolved: true }),
      standingRow(4, "t4"),
    ];

    const preview = buildPlayoffPreview({
      scopeKey: "A",
      standings: ambiguous,
      qualifiedTeamCount: 4,
    });

    /*
      To jest problem ADMINISTRACYJNY: zamknięcie fazy grupowej i tak
      zostanie zablokowane, a admin dostanie dokładny powód. Publiczny
      podgląd nie może wyglądać jak błąd aplikacji.
    */
    expect(preview.warnings).toEqual([]);

    // Admin nadal jest zatrzymany i wie dlaczego.
    const issues = validateGroupStageCompletion({
      scopeLabel: "Grupa A",
      teamCount: 4,
      playedMatchCount: 6,
      standings: ambiguous,
      qualifiedTeamCount: 4,
    });

    expect(issues.some((issue) => issue.reason.includes("granicy awansu"))).toBe(
      true
    );
  });

  it("dla 8 drużyn zwraca cztery pary", () => {
    const wide = Array.from({ length: 8 }, (_, index) =>
      standingRow(index + 1, `t${index + 1}`)
    );

    const preview = buildPlayoffPreview({
      scopeKey: "A",
      standings: wide,
      qualifiedTeamCount: 8,
    });

    expect(preview.pairs.map((p) => [p.homeSeed, p.awaySeed])).toEqual([
      [1, 8],
      [4, 5],
      [2, 7],
      [3, 6],
    ]);
  });
});

/* ==========================================================================
 * WALIDACJA ZAMKNIĘCIA FAZY GRUPOWEJ
 * ======================================================================== */

describe("walidacja zamknięcia fazy grupowej", () => {
  const full = Array.from({ length: 7 }, (_, index) =>
    standingRow(index + 1, `t${index + 1}`)
  );

  it("przechodzi dla kompletnej grupy", () => {
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

  it("blokuje brak wyników", () => {
    const issues = validateGroupStageCompletion({
      scopeLabel: "Grupa A",
      teamCount: 7,
      playedMatchCount: 19,
      standings: full,
      qualifiedTeamCount: 4,
    });

    expect(issues.map((i) => i.reason).join(" ")).toContain("2 meczów");
  });

  it("blokuje zbyt małą liczbę drużyn", () => {
    const issues = validateGroupStageCompletion({
      scopeLabel: "Grupa B",
      teamCount: 3,
      playedMatchCount: 3,
      standings: full.slice(0, 3),
      qualifiedTeamCount: 4,
    });

    expect(issues.map((i) => i.reason).join(" ")).toContain("4 drużyn");
  });

  it("blokuje nierozstrzygnięty remis na granicy awansu", () => {
    const ambiguous = full.map((row, index) =>
      index === 3 || index === 4 ? { ...row, isTieUnresolved: true } : row
    );

    const issues = validateGroupStageCompletion({
      scopeLabel: "Grupa A",
      teamCount: 7,
      playedMatchCount: 21,
      standings: ambiguous,
      qualifiedTeamCount: 4,
    });

    expect(issues.map((i) => i.reason).join(" ")).toContain("granicy awansu");
  });

  it("ignoruje nierozstrzygnięty remis poza strefą awansu", () => {
    const ambiguous = full.map((row, index) =>
      index >= 5 ? { ...row, isTieUnresolved: true } : row
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
});

/* ==========================================================================
 * KLASYFIKACJA KOŃCOWA
 * ======================================================================== */

describe("klasyfikacja końcowa", () => {
  const placement = [
    standingRow(1, "t5"),
    standingRow(2, "t6"),
    standingRow(3, "t7"),
  ];

  it("miejsca 1-7 dla top4 + minigrupy 3 drużyn", () => {
    const result = buildFinalClassification({
      scopeKey: "A",
      thirdPlaceMatch: true,
      bracketMatches: [
        { kind: "semifinal", homeTeamId: "t1", awayTeamId: "t4", homeScore: 3, awayScore: 1 },
        { kind: "semifinal", homeTeamId: "t2", awayTeamId: "t3", homeScore: 0, awayScore: 2 },
        { kind: "final", homeTeamId: "t1", awayTeamId: "t3", homeScore: 4, awayScore: 2 },
        { kind: "third_place", homeTeamId: "t4", awayTeamId: "t2", homeScore: 1, awayScore: 5 },
      ],
      placementStandings: placement,
      placementComplete: true,
    });

    expect(result.complete).toBe(true);
    expect(result.entries.map((e) => [e.position, e.teamId])).toEqual([
      [1, "t1"],
      [2, "t3"],
      [3, "t2"],
      [4, "t4"],
      [5, "t5"],
      [6, "t6"],
      [7, "t7"],
    ]);
  });

  it("bez meczu o 3. miejsce miejsca 3-4 są dzielone", () => {
    const result = buildFinalClassification({
      scopeKey: "A",
      thirdPlaceMatch: false,
      bracketMatches: [
        { kind: "semifinal", homeTeamId: "t1", awayTeamId: "t4", homeScore: 3, awayScore: 1 },
        { kind: "semifinal", homeTeamId: "t2", awayTeamId: "t3", homeScore: 0, awayScore: 2 },
        { kind: "final", homeTeamId: "t1", awayTeamId: "t3", homeScore: 4, awayScore: 2 },
      ],
      placementStandings: null,
      placementComplete: true,
    });

    expect(result.entries.slice(0, 2).map((e) => e.position)).toEqual([1, 2]);

    const shared = result.entries.filter((e) => e.shared);
    expect(shared).toHaveLength(2);
    expect(shared.every((e) => e.position === null)).toBe(true);
    expect(shared.map((e) => e.teamId).sort()).toEqual(["t2", "t4"]);
  });

  it("sygnalizuje brak finału", () => {
    const result = buildFinalClassification({
      scopeKey: "A",
      thirdPlaceMatch: false,
      bracketMatches: [
        { kind: "final", homeTeamId: "t1", awayTeamId: "t3", homeScore: null, awayScore: null },
      ],
      placementStandings: null,
      placementComplete: true,
    });

    expect(result.complete).toBe(false);
    expect(result.missing).toContain("finał");
  });

  it("sygnalizuje nieukończoną minigrupę", () => {
    const result = buildFinalClassification({
      scopeKey: "A",
      thirdPlaceMatch: true,
      bracketMatches: [
        { kind: "final", homeTeamId: "t1", awayTeamId: "t3", homeScore: 4, awayScore: 2 },
        { kind: "third_place", homeTeamId: "t4", awayTeamId: "t2", homeScore: 1, awayScore: 5 },
      ],
      placementStandings: placement,
      placementComplete: false,
    });

    expect(result.complete).toBe(false);
    expect(result.missing).toContain("minigrupa klasyfikacyjna");
  });
});
