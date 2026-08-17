import type { Tournament } from "@/types/tournament";

import type { TournamentLoadResult, TournamentRepository } from "../types";
import { slugifyTournamentTitle } from "../slug";
import { getAirtableConfig, isAirtableConfigured } from "./config";
import {
  airtableCreate,
  airtableDelete,
  airtableFetchAll,
  airtableUpdate,
  type AirtableRecord,
} from "./client";
import {
  buildTournament,
  type MatchFields,
  type ScorerFields,
  type TeamFields,
  type TournamentFields,
} from "./mappers";

/** Opcje fetch rozszerzone o rozszerzenie Next.js (Data Cache). */
type NextRequestInit = RequestInit & { next?: { revalidate?: number } };

/** Cache odczytu publicznego — Next Data Cache, TTL 60 s (jak dotychczas). */
const READ_CACHE: NextRequestInit = { next: { revalidate: 60 } };

/** Ścieżka zapisu i odczyty admina zawsze omijają cache. */
const NO_CACHE: NextRequestInit = { cache: "no-store" };

function toAttachment(url?: string, filename?: string) {
  if (!url) return [];
  return [{ url, filename }];
}

async function fetchActiveTournamentBundle(requestInit: RequestInit) {
  const { tables } = getAirtableConfig();

  const tournaments = await airtableFetchAll<TournamentFields>(
    tables.tournaments,
    { filterByFormula: "{isActive}=TRUE()", maxRecords: "1" },
    { requestInit }
  );

  const tournamentRecord = tournaments[0];

  if (!tournamentRecord) {
    return { kind: "empty" as const };
  }

  const slug = tournamentRecord.fields.slug;

  if (!slug) {
    return { kind: "empty" as const };
  }

  const [teamRecords, matchRecords, scorerRecords] = await Promise.all([
    airtableFetchAll<TeamFields>(
      tables.teams,
      {
        filterByFormula: `{tournamentSlug}="${slug}"`,
        "sort[0][field]": "group",
        "sort[0][direction]": "asc",
        "sort[1][field]": "sourceOrder",
        "sort[1][direction]": "asc",
      },
      { requestInit }
    ),
    airtableFetchAll<MatchFields>(
      tables.matches,
      {
        filterByFormula: `{tournamentSlug}="${slug}"`,
        "sort[0][field]": "group",
        "sort[0][direction]": "asc",
      },
      { requestInit }
    ),
    airtableFetchAll<ScorerFields>(
      tables.scorers,
      {
        filterByFormula: `{tournamentSlug}="${slug}"`,
        "sort[0][field]": "goals",
        "sort[0][direction]": "desc",
        "sort[1][field]": "playerName",
        "sort[1][direction]": "asc",
      },
      { requestInit }
    ),
  ]);

  return {
    kind: "ok" as const,
    tournament: buildTournament({
      slug,
      tournamentRecord,
      teamRecords,
      matchRecords,
      scorerRecords,
    }),
  };
}

async function getActiveTournament(): Promise<TournamentLoadResult> {
  if (!isAirtableConfigured()) {
    return {
      status: "error",
      message: "Brak konfiguracji Airtable (AIRTABLE_BASE_ID / AIRTABLE_TOKEN).",
    };
  }

  try {
    const bundle = await fetchActiveTournamentBundle(READ_CACHE);

    if (bundle.kind === "empty") {
      return { status: "empty" };
    }

    return { status: "ok", tournament: bundle.tournament };
  } catch (error) {
    console.error("[airtableRepo] getActiveTournament failed:", error);

    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Nieznany błąd odczytu danych",
    };
  }
}

async function saveTournament(tournament: Tournament) {
  const { tables } = getAirtableConfig();
  const nextSlug = slugifyTournamentTitle(tournament.title || "");

  const tournaments = await airtableFetchAll<TournamentFields>(
    tables.tournaments,
    { maxRecords: "50" },
    { requestInit: NO_CACHE }
  );

  const activeTournamentRecord =
    tournaments.find((record) => record.fields.isActive === true) ?? null;

  for (const record of tournaments) {
    if (record.fields.isActive) {
      await airtableUpdate<TournamentFields>(tables.tournaments, record.id, {
        isActive: false,
      });
    }
  }

  const tournamentFields: TournamentFields = {
    slug: nextSlug,
    title: tournament.title,
    isActive: true,

    scheduleImage: toAttachment(
      tournament.assets.scheduleImage,
      tournament.assets.scheduleImageName || "schedule-file"
    ),
    regulationImage: toAttachment(
      tournament.assets.regulationImage,
      tournament.assets.regulationImageName || "regulation-file"
    ),

    heroBannerImage: toAttachment(
      tournament.assets.heroBannerImage,
      tournament.assets.heroBannerImageName || "hero-banner"
    ),
    campBannerImage: toAttachment(
      tournament.assets.campBannerImage,
      tournament.assets.campBannerImageName || "camp-banner"
    ),
    campPosterLeft: toAttachment(
      tournament.assets.campPosterLeft,
      tournament.assets.campPosterLeftName || "camp-poster-left"
    ),
    campPosterRight: toAttachment(
      tournament.assets.campPosterRight,
      tournament.assets.campPosterRightName || "camp-poster-right"
    ),

    campStartDate: tournament.campStartDate || "",
    campSignupLink: tournament.campSignupLink || "",
    tickerMessage: tournament.tickerMessage || "",
    showTopScorerTicker: tournament.showTopScorerTicker ?? true,
  };

  if (activeTournamentRecord) {
    await airtableUpdate<TournamentFields>(
      tables.tournaments,
      activeTournamentRecord.id,
      tournamentFields
    );
  } else {
    await airtableCreate<TournamentFields>(tables.tournaments, tournamentFields);
  }

  const existingTeams = await airtableFetchAll<TeamFields>(
    tables.teams,
    { filterByFormula: `{tournamentSlug}="${nextSlug}"` },
    { requestInit: NO_CACHE }
  );

  const existingMatches = await airtableFetchAll<MatchFields>(
    tables.matches,
    { filterByFormula: `{tournamentSlug}="${nextSlug}"` },
    { requestInit: NO_CACHE }
  );

  const existingScorers = await airtableFetchAll<ScorerFields>(
    tables.scorers,
    { filterByFormula: `{tournamentSlug}="${nextSlug}"` },
    { requestInit: NO_CACHE }
  );

  const nextTeams = tournament.groups.flatMap((group) =>
    group.teams.map((team) => ({ groupKey: group.key, team }))
  );

  const nextMatches = tournament.groups.flatMap((group) =>
    group.matches.map((match) => ({ groupKey: group.key, match }))
  );

  const nextScorers = (tournament.scorers ?? []).map((scorer) => ({ scorer }));

  const existingTeamsByTeamId = new Map(
    existingTeams.map((record) => [record.fields.teamId ?? "", record])
  );

  const existingMatchesByMatchId = new Map(
    existingMatches.map((record) => [record.fields.matchId ?? "", record])
  );

  const existingScorersByScorerId = new Map(
    existingScorers.map((record) => [record.fields.scorerId ?? "", record])
  );

  const nextTeamIds = new Set(nextTeams.map((item) => item.team.id));
  const nextMatchIds = new Set(nextMatches.map((item) => item.match.id));
  const nextScorerIds = new Set(nextScorers.map((item) => item.scorer.id));

  const teamIdsToDelete = existingTeams
    .filter((record) => {
      const teamId = record.fields.teamId ?? "";
      return teamId && !nextTeamIds.has(teamId);
    })
    .map((record) => record.id);

  const matchIdsToDelete = existingMatches
    .filter((record) => {
      const matchId = record.fields.matchId ?? "";
      return matchId && !nextMatchIds.has(matchId);
    })
    .map((record) => record.id);

  const scorerIdsToDelete = existingScorers
    .filter((record) => {
      const scorerId = record.fields.scorerId ?? "";
      return scorerId && !nextScorerIds.has(scorerId);
    })
    .map((record) => record.id);

  if (teamIdsToDelete.length) {
    await airtableDelete(tables.teams, teamIdsToDelete);
  }

  if (matchIdsToDelete.length) {
    await airtableDelete(tables.matches, matchIdsToDelete);
  }

  if (scorerIdsToDelete.length) {
    await airtableDelete(tables.scorers, scorerIdsToDelete);
  }

  for (const item of nextTeams) {
    const fields: TeamFields = {
      tournamentSlug: nextSlug,
      group: item.groupKey,
      teamId: item.team.id,
      name: item.team.name,
      shortName: item.team.shortName,
      logo: toAttachment(
        item.team.logoUrl,
        item.team.logoName || `${item.team.id}-logo`
      ),
      sourceOrder: item.team.sourceOrder,
    };

    const existing = existingTeamsByTeamId.get(item.team.id);

    if (existing) {
      await airtableUpdate(tables.teams, existing.id, fields);
    } else {
      await airtableCreate(tables.teams, fields);
    }
  }

  for (const item of nextMatches) {
    const fields: MatchFields = {
      tournamentSlug: nextSlug,
      group: item.groupKey,
      matchId: item.match.id,
      homeTeamId: item.match.homeTeamId,
      awayTeamId: item.match.awayTeamId,
      homeScore: item.match.homeScore,
      awayScore: item.match.awayScore,
    };

    const existing = existingMatchesByMatchId.get(item.match.id);

    if (existing) {
      await airtableUpdate(tables.matches, existing.id, fields);
    } else {
      await airtableCreate(tables.matches, fields);
    }
  }

  for (const item of nextScorers) {
    const fields: ScorerFields = {
      tournamentSlug: nextSlug,
      scorerId: item.scorer.id,
      playerName: item.scorer.playerName,
      jerseyNumber: item.scorer.jerseyNumber,
      goals: item.scorer.goals,
      teamId: item.scorer.teamId,
    };

    const existing = existingScorersByScorerId.get(item.scorer.id);

    if (existing) {
      await airtableUpdate(tables.scorers, existing.id, fields);
    } else {
      await airtableCreate(tables.scorers, fields);
    }
  }

  return { slug: nextSlug };
}

export const airtableRepository: TournamentRepository = {
  name: "airtable",
  getActiveTournament,
  saveTournament,
};

/** Eksport wyłącznie dla skryptów diagnostycznych / eksportu fixtures. */
export const __internal = { fetchActiveTournamentBundle };

export type { AirtableRecord };
