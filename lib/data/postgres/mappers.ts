import type {
  Group,
  Match,
  Scorer,
  Team,
  Tournament,
  TournamentAssets,
} from "@/types/tournament";

import type {
  GroupRow,
  MatchRow,
  ScorerRow,
  TeamRow,
  TournamentAssetRow,
  TournamentRow,
} from "@/lib/db/schema";

/**
 * Mapowanie wierszy PostgreSQL na model domenowy.
 *
 * Czyste funkcje, bez IO — testowalne bez bazy.
 *
 * KONTRAKT: wynik musi być identyczny z tym, co produkuje adapter Airtable
 * (lib/data/airtable/mappers.ts). Każda różnica tutaj to różnica widoczna
 * dla użytkownika po przełączeniu DATA_SOURCE.
 */

export type TournamentBundleRows = {
  tournament: TournamentRow;
  assets: TournamentAssetRow[];
  groups: GroupRow[];
  teams: TeamRow[];
  matches: MatchRow[];
  scorers: ScorerRow[];
};

/** Kolumny NULL w SQL odpowiadają polom `undefined` w modelu domenowym. */
function orUndefined(value: string | null | undefined): string | undefined {
  return value ?? undefined;
}

/** Mapowanie rodzaju assetu na prefiks pól w TournamentAssets. */
const ASSET_KIND_TO_FIELD = {
  schedule: "scheduleImage",
  regulation: "regulationImage",
  hero_banner: "heroBannerImage",
  camp_banner: "campBannerImage",
  camp_poster_left: "campPosterLeft",
  camp_poster_right: "campPosterRight",
} as const;

export type AssetKind = keyof typeof ASSET_KIND_TO_FIELD;

export const ASSET_KINDS = Object.keys(ASSET_KIND_TO_FIELD) as AssetKind[];

export function assetFieldPrefix(kind: AssetKind) {
  return ASSET_KIND_TO_FIELD[kind];
}

/**
 * Buduje płaski obiekt assetów.
 * Puste sloty to "" — dokładnie jak w adapterze Airtable.
 */
export function buildAssets(rows: TournamentAssetRow[]): TournamentAssets {
  const assets: Record<string, string> = {};

  for (const kind of ASSET_KINDS) {
    const prefix = ASSET_KIND_TO_FIELD[kind];
    const row = rows.find((item) => item.kind === kind);

    assets[prefix] = row?.url ?? "";
    assets[`${prefix}Type`] = row?.mimeType ?? "";
    assets[`${prefix}Name`] = row?.fileName ?? "";
  }

  return assets as TournamentAssets;
}

export function buildTeam(row: TeamRow): Team {
  return {
    id: row.externalId,
    name: row.name,
    shortName: orUndefined(row.shortName),
    logoText: row.shortName ?? "LOGO",
    logoUrl: orUndefined(row.logoUrl),
    logoName: orUndefined(row.logoName),
    logoType: orUndefined(row.logoType),
    sourceOrder: row.sourceOrder,
    // logoPublicId celowo NIE jest wystawiany: adapter Airtable go nie zwraca,
    // a ujawnienie go zmieniłoby zachowanie panelu (kasowanie starych plików).
    // Kolumna w bazie jest wypełniana — dane nie giną.
  };
}

export function buildScorers(
  rows: ScorerRow[],
  teamExternalIdByUuid: Map<string, string>
): Scorer[] {
  const scorers: Scorer[] = [];

  for (const row of rows) {
    const teamId = teamExternalIdByUuid.get(row.teamId);
    if (!teamId) continue;

    scorers.push({
      id: row.externalId,
      playerName: row.playerName,
      jerseyNumber: row.jerseyNumber ?? undefined,
      goals: row.goals,
      teamId,
    });
  }

  return scorers.sort((a, b) => {
    if (b.goals !== a.goals) return b.goals - a.goals;
    return a.playerName.localeCompare(b.playerName);
  });
}

/**
 * Mecze fazy grupowej w postaci wymaganej przez calculateStandings.
 *
 * Pomijamy mecze bez kompletnego wyniku i bez rozstrzygniętych uczestników —
 * tak samo jak adapter Airtable, w którym rekord bez wyniku w ogóle nie
 * przechodził mapowania.
 */
export function buildMatches(
  rows: MatchRow[],
  teamExternalIdByUuid: Map<string, string>,
  groupKeyByUuid: Map<string, string>
): Match[] {
  const matches: Match[] = [];

  for (const row of [...rows].sort((a, b) => a.sourceOrder - b.sourceOrder)) {
    if (row.homeScore === null || row.awayScore === null) continue;
    if (!row.homeTeamId || !row.awayTeamId || !row.groupId) continue;

    const homeTeamId = teamExternalIdByUuid.get(row.homeTeamId);
    const awayTeamId = teamExternalIdByUuid.get(row.awayTeamId);
    const group = groupKeyByUuid.get(row.groupId);

    if (!homeTeamId || !awayTeamId || !group) continue;

    matches.push({
      id: row.externalId,
      group,
      homeTeamId,
      awayTeamId,
      homeScore: row.homeScore,
      awayScore: row.awayScore,
    });
  }

  return matches;
}

export function buildTournamentFromRows(
  bundle: TournamentBundleRows
): Partial<Tournament> {
  const { tournament, assets, groups, teams, matches, scorers } = bundle;

  const teamExternalIdByUuid = new Map(
    teams.map((row) => [row.id, row.externalId])
  );
  const groupKeyByUuid = new Map(groups.map((row) => [row.id, row.key]));

  const domainMatches = buildMatches(
    matches,
    teamExternalIdByUuid,
    groupKeyByUuid
  );

  // Kolejność grup jak w adapterze Airtable: naturalne sortowanie po kluczu.
  const sortedGroups = [...groups].sort((a, b) =>
    a.key.localeCompare(b.key, undefined, { numeric: true })
  );

  const domainGroups: Group[] = sortedGroups.map((groupRow) => ({
    key: groupRow.key,
    name: groupRow.name,
    teams: teams
      .filter((team) => team.groupId === groupRow.id)
      .sort((a, b) => a.sourceOrder - b.sourceOrder)
      .map(buildTeam),
    matches: domainMatches.filter((match) => match.group === groupRow.key),
  }));

  return {
    // Tożsamość domenowa pozostaje slugiem — tak jak w Airtable.
    // Wewnętrzny UUID nigdy nie opuszcza warstwy danych.
    id: tournament.slug,
    title: tournament.title,
    campStartDate: tournament.campStartDate ?? "",
    campSignupLink: tournament.campSignupLink ?? "",
    tickerMessage: tournament.tickerMessage ?? "",
    showTopScorerTicker: tournament.showTopScorerTicker,
    assets: buildAssets(assets),
    groups: domainGroups,
    scorers: buildScorers(scorers, teamExternalIdByUuid),
  };
}
