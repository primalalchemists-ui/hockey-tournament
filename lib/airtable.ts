import "server-only";

import type { Group, Match, Scorer, Team, Tournament } from "@/types/tournament";

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

const AIRTABLE_TOURNAMENTS_TABLE =
  process.env.AIRTABLE_TOURNAMENTS_TABLE ?? "Tournaments";
const AIRTABLE_TEAMS_TABLE = process.env.AIRTABLE_TEAMS_TABLE ?? "Teams";
const AIRTABLE_MATCHES_TABLE = process.env.AIRTABLE_MATCHES_TABLE ?? "Matches";
const AIRTABLE_SCORERS_TABLE = process.env.AIRTABLE_SCORERS_TABLE ?? "Scorers";

type AirtableRecord<TFields> = {
  id: string;
  fields: TFields;
};

type AirtableAttachment = {
  id: string;
  url: string;
  filename?: string;
  type?: string;
};

type TournamentFields = {
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

type TeamFields = {
  tournamentSlug?: string;
  tournamentSlugLookup?: string[];
  group?: string;
  teamId?: string;
  name?: string;
  shortName?: string;
  logo?: AirtableAttachment[];
  sourceOrder?: number;
};

type MatchFields = {
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

type ScorerFields = {
  tournamentSlug?: string;
  scorerId?: string;
  playerName?: string;
  jerseyNumber?: number;
  goals?: number;
  teamId?: string;
};

function isAirtableConfigured() {
  return Boolean(AIRTABLE_BASE_ID && AIRTABLE_TOKEN);
}

function getLookupFirst(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

async function airtableFetch<TFields>(
  tableName: string,
  params?: Record<string, string>
): Promise<AirtableRecord<TFields>[]> {
  if (!AIRTABLE_BASE_ID || !AIRTABLE_TOKEN) {
    return [];
  }

  const searchParams = new URLSearchParams(params);
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    tableName
  )}?${searchParams.toString()}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${AIRTABLE_TOKEN}`,
    },
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    console.error("Airtable fetch failed:", tableName, response.status, response.statusText);
    const text = await response.text().catch(() => "");
    if (text) {
      console.error(text);
    }
    return [];
  }

  const json = (await response.json()) as {
    records?: AirtableRecord<TFields>[];
  };

  return json.records ?? [];
}

function mapTeams(records: AirtableRecord<TeamFields>[]): Group[] {
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
      sourceOrder: typeof fields.sourceOrder === "number" ? fields.sourceOrder : 999,
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

function mapMatches(records: AirtableRecord<MatchFields>[]): Match[] {
  return records
    .map((record) => {
      const fields = record.fields;

      const homeTeamId = fields.homeTeamId ?? getLookupFirst(fields.homeTeamIdLookup);
      const awayTeamId = fields.awayTeamId ?? getLookupFirst(fields.awayTeamIdLookup);

      if (
        !fields.group ||
        !fields.matchId ||
        !homeTeamId ||
        !awayTeamId ||
        typeof fields.homeScore !== "number" ||
        typeof fields.awayScore !== "number"
      ) {
        return null;
      }

      return {
        id: fields.matchId,
        group: fields.group,
        homeTeamId,
        awayTeamId,
        homeScore: fields.homeScore,
        awayScore: fields.awayScore,
      } satisfies Match;
    })
    .filter(Boolean) as Match[];
}

function mapScorers(records: AirtableRecord<ScorerFields>[]): Scorer[] {
  return records
    .map((record) => {
      const fields = record.fields;

      if (
        !fields.scorerId ||
        !fields.playerName ||
        !fields.teamId ||
        typeof fields.goals !== "number"
      ) {
        return null;
      }

      return {
        id: fields.scorerId,
        playerName: fields.playerName,
        jerseyNumber:
          typeof fields.jerseyNumber === "number" ? fields.jerseyNumber : undefined,
        goals: fields.goals,
        teamId: fields.teamId,
      } satisfies Scorer;
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (b.goals !== a.goals) return b.goals - a.goals;
      return a.playerName.localeCompare(b.playerName);
    }) as Scorer[];
}

export async function getAirtableTournament(): Promise<Partial<Tournament> | null> {
  if (!isAirtableConfigured()) {
    return null;
  }

  const tournaments = await airtableFetch<TournamentFields>(
    AIRTABLE_TOURNAMENTS_TABLE,
    {
      filterByFormula: "{isActive}=TRUE()",
      maxRecords: "1",
    }
  );

  const tournamentRecord = tournaments[0];

  if (!tournamentRecord) {
    console.error(`No active tournament found in table "${AIRTABLE_TOURNAMENTS_TABLE}"`);
    return null;
  }

  const activeSlug = tournamentRecord.fields.slug;

  if (!activeSlug) {
    console.error("Active tournament exists but has no slug");
    return null;
  }

  const teamsRecords = await airtableFetch<TeamFields>(AIRTABLE_TEAMS_TABLE, {
    filterByFormula: `{tournamentSlug}="${activeSlug}"`,
    "sort[0][field]": "group",
    "sort[0][direction]": "asc",
    "sort[1][field]": "sourceOrder",
    "sort[1][direction]": "asc",
  });

  const matchesRecords = await airtableFetch<MatchFields>(AIRTABLE_MATCHES_TABLE, {
    filterByFormula: `{tournamentSlug}="${activeSlug}"`,
    "sort[0][field]": "group",
    "sort[0][direction]": "asc",
  });

  const scorersRecords = await airtableFetch<ScorerFields>(AIRTABLE_SCORERS_TABLE, {
    filterByFormula: `{tournamentSlug}="${activeSlug}"`,
    "sort[0][field]": "goals",
    "sort[0][direction]": "desc",
    "sort[1][field]": "playerName",
    "sort[1][direction]": "asc",
  });

  const groups = mapTeams(teamsRecords);
  const matches = mapMatches(matchesRecords);
  const scorers = mapScorers(scorersRecords);

  for (const group of groups) {
    group.matches = matches.filter((match) => match.group === group.key);
  }

  const scheduleAttachment = tournamentRecord.fields.scheduleImage?.[0];
  const regulationAttachment = tournamentRecord.fields.regulationImage?.[0];
  const heroBannerAttachment = tournamentRecord.fields.heroBannerImage?.[0];
  const campBannerAttachment = tournamentRecord.fields.campBannerImage?.[0];
  const campPosterLeftAttachment = tournamentRecord.fields.campPosterLeft?.[0];
  const campPosterRightAttachment = tournamentRecord.fields.campPosterRight?.[0];

  return {
    id: activeSlug,
    title: tournamentRecord.fields.title ?? "Turniej Hokejowy",
    campStartDate: tournamentRecord.fields.campStartDate ?? "",
    campSignupLink: tournamentRecord.fields.campSignupLink ?? "",
    tickerMessage: tournamentRecord.fields.tickerMessage ?? "",
    showTopScorerTicker: tournamentRecord.fields.showTopScorerTicker ?? true,
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