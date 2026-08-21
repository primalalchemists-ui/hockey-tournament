import type { Group, Match, StandingRow, Team } from "@/types/tournament";

function getPoints(homeScore: number, awayScore: number) {
  if (homeScore > awayScore) return { home: 3, away: 0 };
  if (homeScore < awayScore) return { home: 0, away: 3 };
  return { home: 1, away: 1 };
}

function buildEmptyRow(team: Team): StandingRow {
  return {
    position: 0,
    teamId: team.id,
    teamName: team.name,
    logoText: team.logoText,
    logoUrl: team.logoUrl,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    points: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    sourceOrder: team.sourceOrder,
    isTieUnresolved: false,
    tieWithTeamIds: [],
    tieNote: undefined,
  };
}

function applyMatch(
  row: StandingRow,
  scored: number,
  conceded: number,
  points: number
) {
  row.played += 1;
  row.goalsFor += scored;
  row.goalsAgainst += conceded;
  row.points += points;

  if (scored > conceded) row.wins += 1;
  else if (scored < conceded) row.losses += 1;
  else row.draws += 1;

  row.goalDifference = row.goalsFor - row.goalsAgainst;
}

function getDirectMatchResult(
  teamAId: string,
  teamBId: string,
  matches: Match[]
): number {
  const directMatch = matches.find(
    (m) =>
      (m.homeTeamId === teamAId && m.awayTeamId === teamBId) ||
      (m.homeTeamId === teamBId && m.awayTeamId === teamAId)
  );

  if (!directMatch) return 0;

  let aScore = 0;
  let bScore = 0;

  if (directMatch.homeTeamId === teamAId) {
    aScore = directMatch.homeScore;
    bScore = directMatch.awayScore;
  } else {
    aScore = directMatch.awayScore;
    bScore = directMatch.homeScore;
  }

  if (aScore > bScore) return -1;
  if (aScore < bScore) return 1;
  return 0;
}

function compareOverall(a: StandingRow, b: StandingRow): number {
  // 3. różnica bramek
  if (b.goalDifference !== a.goalDifference) {
    return b.goalDifference - a.goalDifference;
  }

  // 4. liczba strzelonych bramek
  if (b.goalsFor !== a.goalsFor) {
    return b.goalsFor - a.goalsFor;
  }

  // 5. mniejsza liczba straconych bramek
  if (a.goalsAgainst !== b.goalsAgainst) {
    return a.goalsAgainst - b.goalsAgainst;
  }

  // fallback techniczny
  return a.sourceOrder - b.sourceOrder;
}

/**
 * REMIS DOKŁADNIE DWÓCH DRUŻYN — regulaminowe punkty 1-5.
 *
 * Zachowanie przeniesione jeden do jednego z poprzedniej wersji: decyduje
 * mecz bezpośredni, a gdy był remisowy — bilans, bramki zdobyte i stracone.
 * Ta ścieżka nie została zmieniona ani o krok.
 */
function resolveTwoTeamTie(
  tiedRows: StandingRow[],
  matches: Match[]
): { sortedTiedRows: StandingRow[]; unresolvedGroups: StandingRow[][] } {
  const sortedTiedRows = [...tiedRows].sort((a, b) => {
    const direct = getDirectMatchResult(a.teamId, b.teamId, matches);
    if (direct !== 0) return direct;

    return compareOverall(a, b);
  });

  const signatureGroups = new Map<string, StandingRow[]>();

  for (const row of sortedTiedRows) {
    const signature = getTieSignature(row);
    const list = signatureGroups.get(signature) ?? [];
    list.push(row);
    signatureGroups.set(signature, list);
  }

  const unresolvedGroups: StandingRow[][] = [];

  for (const groupRows of signatureGroups.values()) {
    if (groupRows.length <= 1) continue;

    // Mecz bezpośredni rozstrzygnął — remis nie jest nierozstrzygnięty.
    const [first, second] = groupRows;
    if (getDirectMatchResult(first.teamId, second.teamId, matches) !== 0) {
      continue;
    }

    unresolvedGroups.push(groupRows);
  }

  return { sortedTiedRows, unresolvedGroups };
}

/* ==========================================================================
 * MAŁA TABELA (regulamin, punkt 6)
 * ======================================================================== */

export type MiniTableRow = {
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
};

/**
 * Tabela liczona WYŁĄCZNIE z meczów między zainteresowanymi drużynami.
 *
 * „Zainteresowane" to komplet drużyn z jednego koszyka punktowego. Mecz
 * wchodzi do małej tabeli tylko wtedy, gdy OBIE strony do niego należą —
 * spotkanie z drużyną spoza koszyka nie ma tu żadnego znaczenia.
 */
export function buildHeadToHeadMiniTable(
  teamIds: string[],
  matches: Match[]
): Map<string, MiniTableRow> {
  const involved = new Set(teamIds);
  const table = new Map<string, MiniTableRow>(
    teamIds.map((teamId) => [
      teamId,
      { goalsFor: 0, goalsAgainst: 0, goalDifference: 0 },
    ])
  );

  for (const match of matches) {
    if (!involved.has(match.homeTeamId)) continue;
    if (!involved.has(match.awayTeamId)) continue;

    const home = table.get(match.homeTeamId)!;
    const away = table.get(match.awayTeamId)!;

    home.goalsFor += match.homeScore;
    home.goalsAgainst += match.awayScore;
    away.goalsFor += match.awayScore;
    away.goalsAgainst += match.homeScore;
  }

  for (const row of table.values()) {
    row.goalDifference = row.goalsFor - row.goalsAgainst;
  }

  return table;
}

/**
 * REMIS TRZECH LUB WIĘCEJ DRUŻYN — regulaminowy punkt 6.
 *
 * Kolejność kryteriów, w tej i tylko tej kolejności:
 *
 *   1. bilans bramek w małej tabeli,
 *   2. bramki zdobyte w CAŁYM turnieju,
 *   3. bramki stracone w całym turnieju (mniej = wyżej),
 *   4. rzuty karne — czyli, dopóki nie ma ich gdzie wpisać, remis zostaje
 *      nierozstrzygnięty.
 *
 * Świadomie NIE ma tu meczu bezpośredniego. Punkt 6 uruchomił się dlatego,
 * że remisowały co najmniej trzy drużyny — i obowiązuje w całości, także
 * dla par, które zostaną związane po małej tabeli. Powrót do „meczu
 * bezpośredniego" byłby mieszaniem dwóch różnych ścieżek regulaminu.
 */
function resolveMultiTeamTie(
  tiedRows: StandingRow[],
  matches: Match[]
): { sorted: StandingRow[]; unresolved: StandingRow[][] } {
  const mini = buildHeadToHeadMiniTable(
    tiedRows.map((row) => row.teamId),
    matches
  );

  const sorted = [...tiedRows].sort((a, b) => {
    const left = mini.get(a.teamId)!;
    const right = mini.get(b.teamId)!;

    // 1. bilans w meczach między zainteresowanymi
    if (right.goalDifference !== left.goalDifference) {
      return right.goalDifference - left.goalDifference;
    }

    // 2. bramki zdobyte w całym turnieju
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;

    // 3. bramki stracone w całym turnieju
    if (a.goalsAgainst !== b.goalsAgainst) {
      return a.goalsAgainst - b.goalsAgainst;
    }

    /*
      Wszystkie kryteria sportowe wyczerpane. `sourceOrder` daje wyłącznie
      STABILNY porządek renderowania — nie jest rozstrzygnięciem i nie gasi
      flagi remisu. O miejscu decydują rzuty karne.
    */
    return a.sourceOrder - b.sourceOrder;
  });

  /* Które drużyny NADAL są związane po wyczerpaniu kryteriów. */
  const buckets = new Map<string, StandingRow[]>();

  for (const row of sorted) {
    const table = mini.get(row.teamId)!;
    const key = `${table.goalDifference}|${row.goalsFor}|${row.goalsAgainst}`;
    const list = buckets.get(key) ?? [];
    list.push(row);
    buckets.set(key, list);
  }

  return {
    sorted,
    unresolved: [...buckets.values()].filter((rows) => rows.length > 1),
  };
}

function getTieSignature(row: StandingRow): string {
  return JSON.stringify({
    points: row.points,
    goalDifference: row.goalDifference,
    goalsFor: row.goalsFor,
    goalsAgainst: row.goalsAgainst,
  });
}

function getExpectedMatchCount(teamCount: number) {
  return (teamCount * (teamCount - 1)) / 2;
}

function isGroupComplete(group: Group) {
  return group.matches.length >= getExpectedMatchCount(group.teams.length);
}

export function calculateStandings(group: Group): StandingRow[] {
  const rowsMap = new Map<string, StandingRow>();

  for (const team of group.teams) {
    rowsMap.set(team.id, buildEmptyRow(team));
  }

  for (const match of group.matches) {
    const home = rowsMap.get(match.homeTeamId);
    const away = rowsMap.get(match.awayTeamId);
    if (!home || !away) continue;

    const pts = getPoints(match.homeScore, match.awayScore);

    applyMatch(home, match.homeScore, match.awayScore, pts.home);
    applyMatch(away, match.awayScore, match.homeScore, pts.away);
  }

  const rows = Array.from(rowsMap.values());
  const groupComplete = isGroupComplete(group);

  const groupsByPoints = new Map<number, StandingRow[]>();
  for (const row of rows) {
    const list = groupsByPoints.get(row.points) ?? [];
    list.push(row);
    groupsByPoints.set(row.points, list);
  }

  const sortedPointValues = Array.from(groupsByPoints.keys()).sort((a, b) => b - a);

  const finalRows: StandingRow[] = [];

  for (const points of sortedPointValues) {
    const tiedRows = groupsByPoints.get(points) ?? [];

    if (tiedRows.length === 1) {
      finalRows.push(tiedRows[0]);
      continue;
    }

    /*
      DWIE ŚCIEŻKI REGULAMINU, JAWNIE ROZDZIELONE.

      Remis dwóch drużyn rozstrzyga mecz bezpośredni (punkty 1-5). Remis
      trzech lub więcej uruchamia punkt 6, czyli małą tabelę — i wtedy mecz
      bezpośredni nie wraca do gry na żadnym etapie.
    */
    const { sortedTiedRows, unresolvedGroups } =
      tiedRows.length === 2
        ? resolveTwoTeamTie(tiedRows, group.matches)
        : (() => {
            const result = resolveMultiTeamTie(tiedRows, group.matches);
            return {
              sortedTiedRows: result.sorted,
              unresolvedGroups: result.unresolved,
            };
          })();

    for (const groupRows of unresolvedGroups) {
      const teamIdsInTie = groupRows.map((row) => row.teamId);

      for (const row of groupRows) {
        row.isTieUnresolved = true;
        // Wskazuje drużyny NADAL związane, a nie cały pierwotny koszyk.
        row.tieWithTeamIds = teamIdsInTie.filter((id) => id !== row.teamId);
        row.tieNote = groupComplete
          ? "Remis nierozstrzygnięty według kryteriów tabeli — o kolejności decydują rzuty karne."
          : undefined;
      }
    }

    finalRows.push(...sortedTiedRows);
  }

  return finalRows.map((row, index) => ({
    ...row,
    position: index + 1,
  }));
}