import type { StandingRow } from "@/types/tournament";

/**
 * STATYSTYKI CAŁEGO TURNIEJU — czysta funkcja, zero IO.
 *
 * W formacie z play-offem Ranking nie kończy życia po fazie grupowej:
 * do M/W/R/P/Pkt/G+/G-/Bil. wchodzą WSZYSTKIE rozegrane mecze drużyny —
 * grupowe, pucharowe, mecz o 3. miejsce i minigrupa klasyfikacyjna.
 *
 * Świadomie NIE ruszamy calculateStandings: tamta funkcja odpowiada za
 * SPORTOWĄ kolejność w tabeli round-robin i ma własny golden master.
 * Tutaj liczymy wyłącznie sumy — kolejność ustala osobna warstwa.
 */

/** Punktacja zamrożona regulaminowo: zwycięstwo 3, remis 1, porażka 0. */
export const WIN_POINTS = 3;
export const DRAW_POINTS = 1;

export type AggregatableMatch = {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
};

export type TeamStats = {
  teamId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
};

function emptyStats(teamId: string): TeamStats {
  return {
    teamId,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    points: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
  };
}

/**
 * Sumuje statystyki drużyn ze wszystkich podanych meczów.
 *
 * Mecz bez kompletu bramek jest po prostu pomijany — terminarz nie
 * wpływa na statystyki, liczy się wyłącznie to, co rozegrane.
 */
export function aggregateTeamStats(input: {
  teamIds: string[];
  matches: AggregatableMatch[];
}): Map<string, TeamStats> {
  const stats = new Map<string, TeamStats>(
    input.teamIds.map((teamId) => [teamId, emptyStats(teamId)])
  );

  function statsFor(teamId: string): TeamStats {
    const existing = stats.get(teamId);
    if (existing) return existing;

    const created = emptyStats(teamId);
    stats.set(teamId, created);
    return created;
  }

  for (const match of input.matches) {
    if (match.homeScore === null || match.awayScore === null) continue;
    if (!match.homeTeamId || !match.awayTeamId) continue;

    const home = statsFor(match.homeTeamId);
    const away = statsFor(match.awayTeamId);

    home.played += 1;
    away.played += 1;

    home.goalsFor += match.homeScore;
    home.goalsAgainst += match.awayScore;
    away.goalsFor += match.awayScore;
    away.goalsAgainst += match.homeScore;

    if (match.homeScore > match.awayScore) {
      home.wins += 1;
      home.points += WIN_POINTS;
      away.losses += 1;
    } else if (match.homeScore < match.awayScore) {
      away.wins += 1;
      away.points += WIN_POINTS;
      home.losses += 1;
    } else {
      // Remis jest możliwy wyłącznie w fazie round-robin; play-off i
      // minigrupa trafiają do systemu z wynikiem już rozstrzygniętym.
      home.draws += 1;
      away.draws += 1;
      home.points += DRAW_POINTS;
      away.points += DRAW_POINTS;
    }

    home.goalDifference = home.goalsFor - home.goalsAgainst;
    away.goalDifference = away.goalsFor - away.goalsAgainst;
  }

  return stats;
}

/**
 * Składa wiersz Rankingu: KOLEJNOŚĆ z zewnątrz, LICZBY z agregatu.
 *
 * Rozdzielenie jest celowe. Po zamrożeniu fazy grupowej tabela nie może
 * przeskakiwać po każdym meczu play-off, ale liczby mają żyć.
 */
export function buildRankingRows(input: {
  /** Identyfikatory drużyn w docelowej kolejności wyświetlania. */
  orderedTeamIds: string[];
  stats: Map<string, TeamStats>;
  /** Dane prezentacyjne drużyny — nazwa, logo, kolejność źródłowa. */
  presentation: Map<
    string,
    { teamName: string; logoText?: string; logoUrl?: string; sourceOrder: number }
  >;
}): StandingRow[] {
  return input.orderedTeamIds.map((teamId, index) => {
    const stats = input.stats.get(teamId) ?? emptyStats(teamId);
    const presentation = input.presentation.get(teamId);

    return {
      position: index + 1,
      teamId,
      teamName: presentation?.teamName ?? teamId,
      logoText: presentation?.logoText,
      logoUrl: presentation?.logoUrl,
      played: stats.played,
      wins: stats.wins,
      draws: stats.draws,
      losses: stats.losses,
      points: stats.points,
      goalsFor: stats.goalsFor,
      goalsAgainst: stats.goalsAgainst,
      goalDifference: stats.goalDifference,
      sourceOrder: presentation?.sourceOrder ?? index,
    };
  });
}
