import type { Group, Match, Team } from "@/types/tournament";

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

/**
 * Buduje grupę z listy identyfikatorów drużyn.
 * sourceOrder odpowiada kolejności na liście (1, 2, 3, ...).
 */
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

export function orderOf(rows: { teamId: string }[]) {
  return rows.map((row) => row.teamId);
}
