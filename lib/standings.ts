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

    const sortedTiedRows = [...tiedRows].sort((a, b) => {
      // tylko dla remisu dokładnie 2 drużyn
      if (tiedRows.length === 2) {
        const direct = getDirectMatchResult(a.teamId, b.teamId, group.matches);
        if (direct !== 0) return direct;
      }

      // dla 3+ albo gdy bezpośredni mecz remisowy
      return compareOverall(a, b);
    });

    const signatureGroups = new Map<string, StandingRow[]>();

    for (const row of sortedTiedRows) {
      const signature = getTieSignature(row);
      const list = signatureGroups.get(signature) ?? [];
      list.push(row);
      signatureGroups.set(signature, list);
    }

    for (const groupRows of signatureGroups.values()) {
      if (groupRows.length <= 1) continue;

      // jeśli remisują dokładnie 2 drużyny i bezpośredni mecz rozstrzyga,
      // to nie oznaczamy ich jako nierozstrzygniętych
      if (groupRows.length === 2) {
        const [first, second] = groupRows;
        const direct = getDirectMatchResult(first.teamId, second.teamId, group.matches);

        if (direct !== 0) {
          continue;
        }
      }

      const teamIdsInTie = groupRows.map((row) => row.teamId);

      for (const row of groupRows) {
        row.isTieUnresolved = true;
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