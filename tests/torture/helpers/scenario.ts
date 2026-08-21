import type { Group, Match, StandingRow, Team } from "@/types/tournament";

/**
 * WSPÓLNE KLOCKI TORTURE SUITE — warstwa czysta, bez bazy.
 *
 * Celowo minimalne: repozytorium ma już `tests/helpers/build-group.ts`
 * i z niego korzystamy wszędzie, gdzie wystarcza. Tutaj lądują wyłącznie
 * konstrukcje, których tamten helper nie zna — round-robin z zadanymi
 * wynikami i skróty do asercji niezmienników.
 */

export function team(id: string, sourceOrder: number): Team {
  return {
    id,
    name: `Team ${id.toUpperCase()}`,
    shortName: id.toUpperCase(),
    logoText: id.toUpperCase(),
    sourceOrder,
  };
}

export function match(
  homeTeamId: string,
  awayTeamId: string,
  homeScore: number,
  awayScore: number,
  groupKey = "A"
): Match {
  return {
    id: `${groupKey}-${homeTeamId}-${awayTeamId}`,
    group: groupKey,
    homeTeamId,
    awayTeamId,
    homeScore,
    awayScore,
  };
}

export function buildGroup(
  teamIds: string[],
  matches: Match[],
  groupKey = "A"
): Group {
  return {
    key: groupKey,
    name: `Grupa ${groupKey}`,
    teams: teamIds.map((id, index) => team(id, index + 1)),
    matches,
  };
}

export const orderOf = (rows: Array<{ teamId: string }>) =>
  rows.map((row) => row.teamId);

export const idsOf = (count: number, prefix = "t") =>
  Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`);

/**
 * Pełny round-robin, w którym niższy indeks zawsze wygrywa 1:0.
 *
 * Daje jednoznaczną tabelę 1..n bez remisów — punkt wyjścia dla scenariuszy,
 * które potrzebują „normalnej" grupy i modyfikują z niej pojedyncze mecze.
 */
export function deterministicRoundRobin(
  teamIds: string[],
  groupKey = "A"
): Match[] {
  const result: Match[] = [];

  for (let i = 0; i < teamIds.length; i += 1) {
    for (let j = i + 1; j < teamIds.length; j += 1) {
      result.push(match(teamIds[i], teamIds[j], 1, 0, groupKey));
    }
  }

  return result;
}

/** Liczba spotkań pełnego round-robin. */
export const expectedPairCount = (teamCount: number) =>
  (teamCount * (teamCount - 1)) / 2;

/* ==========================================================================
 * NIEZMIENNIKI (INV-01..INV-13)
 * ======================================================================== */

/** INV-01, INV-02, INV-03 — arytmetyka pojedynczego wiersza. */
export function assertRowArithmetic(
  row: StandingRow,
  expect: (value: unknown) => { toBe: (expected: unknown) => void }
) {
  expect(row.played).toBe(row.wins + row.draws + row.losses);
  expect(row.goalDifference).toBe(row.goalsFor - row.goalsAgainst);
  expect(row.points).toBe(3 * row.wins + row.draws);
}

/** INV-04 — w zamkniętym zestawie meczów suma strzelonych równa się straconym. */
export const totalGoalsFor = (rows: StandingRow[]) =>
  rows.reduce((sum, row) => sum + row.goalsFor, 0);

export const totalGoalsAgainst = (rows: StandingRow[]) =>
  rows.reduce((sum, row) => sum + row.goalsAgainst, 0);

/** INV-06 — każdy mecz dokłada dwa wystąpienia. */
export const totalPlayed = (rows: StandingRow[]) =>
  rows.reduce((sum, row) => sum + row.played, 0);

/** INV-10, INV-11, INV-12 — unikalność par w round-robin. */
export function pairKeys(matches: Match[]): string[] {
  return matches.map((entry) =>
    [entry.homeTeamId, entry.awayTeamId].sort().join("|")
  );
}

export const hasSelfMatch = (matches: Match[]) =>
  matches.some((entry) => entry.homeTeamId === entry.awayTeamId);
