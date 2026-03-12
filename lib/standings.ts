// lib/standings.ts
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
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    points: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    sourceOrder: team.sourceOrder,
  };
}

function applyMatch(row: StandingRow, scored: number, conceded: number, points: number) {
  row.played += 1;
  row.goalsFor += scored;
  row.goalsAgainst += conceded;
  row.points += points;

  if (scored > conceded) row.wins += 1;
  else if (scored < conceded) row.losses += 1;
  else row.draws += 1;

  row.goalDifference = row.goalsFor - row.goalsAgainst;
}

function headToHeadWinner(teamAId: string, teamBId: string, matches: Match[]): number {
  const directMatches = matches.filter(
    (m) =>
      (m.homeTeamId === teamAId && m.awayTeamId === teamBId) ||
      (m.homeTeamId === teamBId && m.awayTeamId === teamAId)
  );

  if (directMatches.length === 0) return 0;

  let aPoints = 0;
  let bPoints = 0;

  for (const match of directMatches) {
    const pts = getPoints(match.homeScore, match.awayScore);

    if (match.homeTeamId === teamAId) {
      aPoints += pts.home;
      bPoints += pts.away;
    } else {
      aPoints += pts.away;
      bPoints += pts.home;
    }
  }

  if (aPoints > bPoints) return -1;
  if (aPoints < bPoints) return 1;
  return 0;
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

  const pointsCount = new Map<number, number>();
  for (const row of rows) {
    pointsCount.set(row.points, (pointsCount.get(row.points) ?? 0) + 1);
  }

  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;

    const tiedCount = pointsCount.get(a.points) ?? 0;

    // only for exactly 2 tied teams -> head to head
    if (tiedCount === 2) {
      const h2h = headToHeadWinner(a.teamId, b.teamId, group.matches);
      if (h2h !== 0) return h2h;
    }

    if (b.goalDifference !== a.goalDifference) {
      return b.goalDifference - a.goalDifference;
    }

    if (b.goalsFor !== a.goalsFor) {
      return b.goalsFor - a.goalsFor;
    }

    return a.sourceOrder - b.sourceOrder;
  });

  return rows.map((row, index) => ({
    ...row,
    position: index + 1,
  }));
}