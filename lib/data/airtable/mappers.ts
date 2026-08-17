import type {
  Group,
  Match,
  Scorer,
  Team,
  Tournament,
} from "@/types/tournament";

import type { AirtableAttachment, AirtableRecord } from "./client";

/**
 * Mapowanie rekordów Airtable na model domenowy.
 *
 * Ten moduł jest CZYSTY (bez IO, bez fetch, bez env) — dzięki temu jest
 * w całości testowalny i stanowi golden-master kontraktu odczytu.
 *
 * UWAGA: logika jest przeniesiona 1:1 z poprzedniego lib/airtable.ts.
 * Nie wolno jej zmieniać bez świadomej decyzji — od niej zależy to,
 * jakie mecze w ogóle trafiają do calculateStandings.
 */

export type TournamentFields = {
  slug?: string;
  title?: string;
  isActive?: boolean;

  scheduleImage?: AirtableAttachment[];
  regulationImage?: AirtableAttachment[];

  heroBannerImage?: AirtableAttachment[];
  campBannerImage?: AirtableAttachment[];
  campPosterLeft?: AirtableAttachment[];
  campPosterRight?: AirtableAttachment[];

  campStartDate?: string;
  campSignupLink?: string;
  tickerMessage?: string;
  showTopScorerTicker?: boolean;
};

export type TeamFields = {
  tournamentSlug?: string;
  tournamentSlugLookup?: string[];
  group?: string;
  teamId?: string;
  name?: string;
  shortName?: string;
  logo?: AirtableAttachment[];
  sourceOrder?: number;
};

export type MatchFields = {
  tournamentSlug?: string;
  tournamentSlugLookup?: string[];
  group?: string;
  matchId?: string;
  homeTeamId?: string;
  awayTeamId?: string;
  homeTeamIdLookup?: string[];
  awayTeamIdLookup?: string[];
  homeScore?: number;
  awayScore?: number;
};

export type ScorerFields = {
  tournamentSlug?: string;
  scorerId?: string;
  playerName?: string;
  jerseyNumber?: number;
  goals?: number;
  teamId?: string;
};

function getLookupFirst(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

export function mapTeams(records: AirtableRecord<TeamFields>[]): Group[] {
  const groupsMap = new Map<string, Team[]>();

  for (const record of records) {
    const fields = record.fields;

    if (!fields.group || !fields.teamId || !fields.name) continue;

    const logoAttachment = fields.logo?.[0];

    const team: Team = {
      id: fields.teamId,
      name: fields.name,
      shortName: fields.shortName,
      logoText: fields.shortName ?? "LOGO",
      logoUrl: logoAttachment?.url,
      logoName: logoAttachment?.filename,
      logoType: logoAttachment?.type,
      sourceOrder:
        typeof fields.sourceOrder === "number" ? fields.sourceOrder : 999,
    };

    const currentTeams = groupsMap.get(fields.group) ?? [];
    currentTeams.push(team);
    groupsMap.set(fields.group, currentTeams);
  }

  return Array.from(groupsMap.entries())
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([groupKey, teams]) => ({
      key: groupKey,
      name: `Grupa ${groupKey}`,
      teams: [...teams].sort((a, b) => a.sourceOrder - b.sourceOrder),
      matches: [],
    }));
}

export function mapMatches(records: AirtableRecord<MatchFields>[]): Match[] {
  const matches: Match[] = [];

  for (const record of records) {
    const fields = record.fields;

    const homeTeamId =
      fields.homeTeamId ?? getLookupFirst(fields.homeTeamIdLookup);
    const awayTeamId =
      fields.awayTeamId ?? getLookupFirst(fields.awayTeamIdLookup);

    if (
      !fields.group ||
      !fields.matchId ||
      !homeTeamId ||
      !awayTeamId ||
      typeof fields.homeScore !== "number" ||
      typeof fields.awayScore !== "number"
    ) {
      continue;
    }

    matches.push({
      id: fields.matchId,
      group: fields.group,
      homeTeamId,
      awayTeamId,
      homeScore: fields.homeScore,
      awayScore: fields.awayScore,
    });
  }

  return matches;
}

export function mapScorers(records: AirtableRecord<ScorerFields>[]): Scorer[] {
  const scorers: Scorer[] = [];

  for (const record of records) {
    const fields = record.fields;

    if (
      !fields.scorerId ||
      !fields.playerName ||
      !fields.teamId ||
      typeof fields.goals !== "number"
    ) {
      continue;
    }

    scorers.push({
      id: fields.scorerId,
      playerName: fields.playerName,
      jerseyNumber:
        typeof fields.jerseyNumber === "number" ? fields.jerseyNumber : undefined,
      goals: fields.goals,
      teamId: fields.teamId,
    });
  }

  return scorers.sort((a, b) => {
    if (b.goals !== a.goals) return b.goals - a.goals;
    return a.playerName.localeCompare(b.playerName);
  });
}

/**
 * Składa pełny obiekt turnieju z czterech zestawów rekordów.
 * Odpowiednik końcówki poprzedniego getAirtableTournament().
 */
export function buildTournament(input: {
  slug: string;
  tournamentRecord: AirtableRecord<TournamentFields>;
  teamRecords: AirtableRecord<TeamFields>[];
  matchRecords: AirtableRecord<MatchFields>[];
  scorerRecords: AirtableRecord<ScorerFields>[];
}): Partial<Tournament> {
  const { slug, tournamentRecord, teamRecords, matchRecords, scorerRecords } =
    input;
  const fields = tournamentRecord.fields;

  const groups = mapTeams(teamRecords);
  const matches = mapMatches(matchRecords);
  const scorers = mapScorers(scorerRecords);

  for (const group of groups) {
    group.matches = matches.filter((match) => match.group === group.key);
  }

  const scheduleAttachment = fields.scheduleImage?.[0];
  const regulationAttachment = fields.regulationImage?.[0];
  const heroBannerAttachment = fields.heroBannerImage?.[0];
  const campBannerAttachment = fields.campBannerImage?.[0];
  const campPosterLeftAttachment = fields.campPosterLeft?.[0];
  const campPosterRightAttachment = fields.campPosterRight?.[0];

  return {
    id: slug,
    title: fields.title ?? "Turniej Hokejowy",
    campStartDate: fields.campStartDate ?? "",
    campSignupLink: fields.campSignupLink ?? "",
    tickerMessage: fields.tickerMessage ?? "",
    showTopScorerTicker: fields.showTopScorerTicker ?? true,
    assets: {
      scheduleImage: scheduleAttachment?.url ?? "",
      scheduleImageType: scheduleAttachment?.type ?? "",
      scheduleImageName: scheduleAttachment?.filename ?? "",

      regulationImage: regulationAttachment?.url ?? "",
      regulationImageType: regulationAttachment?.type ?? "",
      regulationImageName: regulationAttachment?.filename ?? "",

      heroBannerImage: heroBannerAttachment?.url ?? "",
      heroBannerImageType: heroBannerAttachment?.type ?? "",
      heroBannerImageName: heroBannerAttachment?.filename ?? "",

      campBannerImage: campBannerAttachment?.url ?? "",
      campBannerImageType: campBannerAttachment?.type ?? "",
      campBannerImageName: campBannerAttachment?.filename ?? "",

      campPosterLeft: campPosterLeftAttachment?.url ?? "",
      campPosterLeftType: campPosterLeftAttachment?.type ?? "",
      campPosterLeftName: campPosterLeftAttachment?.filename ?? "",

      campPosterRight: campPosterRightAttachment?.url ?? "",
      campPosterRightType: campPosterRightAttachment?.type ?? "",
      campPosterRightName: campPosterRightAttachment?.filename ?? "",
    },
    groups,
    scorers,
  };
}
