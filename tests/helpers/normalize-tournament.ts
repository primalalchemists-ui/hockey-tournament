import type { StandingRow, Tournament } from "@/types/tournament";

/**
 * Normalizacja przed porównaniem adapterów Airtable vs Postgres.
 *
 * Adresy assetów są JEDYNĄ rzeczą, która może różnić się technicznie:
 * Airtable generuje nowy podpisany URL przy każdym odczycie, a w bazie
 * mamy adres utrwalony w momencie importu.
 *
 * Dlatego URL zamieniamy na flagę "czy asset istnieje". Wykrywa to
 * zgubiony albo nadmiarowy asset, a ignoruje wyłącznie zmienną sygnaturę.
 *
 * NIE normalizujemy niczego, co wpływa na klasyfikację: wyników, kolejności
 * drużyn, sourceOrder, grup ani strzelców.
 */

function urlPresence(value: string | undefined | null) {
  return value ? "<asset-present>" : "<asset-absent>";
}

const ASSET_URL_FIELDS = [
  "scheduleImage",
  "regulationImage",
  "heroBannerImage",
  "campBannerImage",
  "campPosterLeft",
  "campPosterRight",
] as const;

export function normalizeTournament(tournament: Tournament) {
  const assets: Record<string, string> = {};

  for (const [key, value] of Object.entries(tournament.assets)) {
    assets[key] = (ASSET_URL_FIELDS as readonly string[]).includes(key)
      ? urlPresence(value as string)
      : ((value as string) ?? "");
  }

  return {
    id: tournament.id,
    title: tournament.title,
    campStartDate: tournament.campStartDate ?? "",
    campSignupLink: tournament.campSignupLink ?? "",
    tickerMessage: tournament.tickerMessage ?? "",
    showTopScorerTicker: tournament.showTopScorerTicker,
    assets,
    groups: tournament.groups.map((group) => ({
      key: group.key,
      name: group.name,
      teams: group.teams.map((team) => ({
        id: team.id,
        name: team.name,
        shortName: team.shortName ?? null,
        logoText: team.logoText ?? null,
        logoName: team.logoName ?? null,
        logoType: team.logoType ?? null,
        logo: urlPresence(team.logoUrl),
        sourceOrder: team.sourceOrder,
      })),
      matches: group.matches.map((match) => ({
        id: match.id,
        group: match.group,
        homeTeamId: match.homeTeamId,
        awayTeamId: match.awayTeamId,
        homeScore: match.homeScore,
        awayScore: match.awayScore,
      })),
    })),
    scorers: tournament.scorers.map((scorer) => ({
      id: scorer.id,
      playerName: scorer.playerName,
      jerseyNumber: scorer.jerseyNumber ?? null,
      goals: scorer.goals,
      teamId: scorer.teamId,
    })),
  };
}

/** Wiersz tabeli bez zmiennego URL-a logo — reszta porównywana 1:1. */
export function normalizeStandings(rows: StandingRow[]) {
  return rows.map((row) => ({
    ...row,
    logoUrl: urlPresence(row.logoUrl),
  }));
}
