import "server-only";

import type { Tournament } from "@/types/tournament";

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

const AIRTABLE_TOURNAMENTS_TABLE =
  process.env.AIRTABLE_TOURNAMENTS_TABLE ?? "Tournaments";
const AIRTABLE_TEAMS_TABLE = process.env.AIRTABLE_TEAMS_TABLE ?? "Teams";
const AIRTABLE_MATCHES_TABLE = process.env.AIRTABLE_MATCHES_TABLE ?? "Matches";

type AirtableRecord<TFields> = {
  id: string;
  fields: TFields;
};

type TournamentFields = {
  slug?: string;
  title?: string;
  isActive?: boolean;
  scheduleImage?: Array<{ url: string; filename?: string }>;
  regulationImage?: Array<{ url: string; filename?: string }>;
};

type TeamFields = {
  tournamentSlug?: string;
  group?: string;
  teamId?: string;
  name?: string;
  shortName?: string;
  logo?: Array<{ url: string; filename?: string }>;
  sourceOrder?: number;
};

type MatchFields = {
  tournamentSlug?: string;
  group?: string;
  matchId?: string;
  homeTeamId?: string;
  awayTeamId?: string;
  homeScore?: number;
  awayScore?: number;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function getHeaders() {
  if (!AIRTABLE_TOKEN) {
    throw new Error("Missing AIRTABLE_TOKEN");
  }

  return {
    Authorization: `Bearer ${AIRTABLE_TOKEN}`,
    "Content-Type": "application/json",
  };
}

function getTableUrl(tableName: string) {
  if (!AIRTABLE_BASE_ID) {
    throw new Error("Missing AIRTABLE_BASE_ID");
  }

  return `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    tableName
  )}`;
}

async function airtableFetch<TFields>(
  tableName: string,
  params?: Record<string, string>
): Promise<AirtableRecord<TFields>[]> {
  const searchParams = new URLSearchParams(params);
  const response = await fetch(`${getTableUrl(tableName)}?${searchParams.toString()}`, {
    headers: getHeaders(),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Airtable fetch failed: ${tableName} ${response.status} ${text}`);
  }

  const json = (await response.json()) as {
    records?: AirtableRecord<TFields>[];
  };

  return json.records ?? [];
}

async function airtableCreate<TFields extends Record<string, unknown>>(
  tableName: string,
  fields: TFields
) {
  const response = await fetch(getTableUrl(tableName), {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      records: [{ fields }],
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Airtable create failed: ${tableName} ${response.status} ${text}`);
  }

  return response.json();
}

async function airtableUpdate<TFields extends Record<string, unknown>>(
  tableName: string,
  recordId: string,
  fields: TFields
) {
  const response = await fetch(getTableUrl(tableName), {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify({
      records: [{ id: recordId, fields }],
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Airtable update failed: ${tableName} ${response.status} ${text}`);
  }

  return response.json();
}

async function airtableDelete(tableName: string, recordIds: string[]) {
  if (recordIds.length === 0) return;

  for (let i = 0; i < recordIds.length; i += 10) {
    const batch = recordIds.slice(i, i + 10);

    const searchParams = new URLSearchParams();
    batch.forEach((id) => searchParams.append("records[]", id));

    const response = await fetch(
      `${getTableUrl(tableName)}?${searchParams.toString()}`,
      {
        method: "DELETE",
        headers: getHeaders(),
        cache: "no-store",
      }
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Airtable delete failed: ${tableName} ${response.status} ${text}`
      );
    }
  }
}

function toAttachment(url?: string, filename?: string) {
  if (!url) return [];
  return [{ url, filename }];
}

export async function saveAdminDraft(tournament: Tournament) {
  const nextSlug = slugify(tournament.title || "nowy-turniej") || "nowy-turniej";

  const tournaments = await airtableFetch<TournamentFields>(AIRTABLE_TOURNAMENTS_TABLE, {
    maxRecords: "50",
  });

  const activeTournamentRecord =
    tournaments.find((record) => record.fields.isActive === true) ?? null;

  // wyłącz wszystkie poprzednie aktywne
  for (const record of tournaments) {
    if (record.fields.isActive) {
      await airtableUpdate<TournamentFields>(AIRTABLE_TOURNAMENTS_TABLE, record.id, {
        isActive: false,
      });
    }
  }

  let tournamentRecordId: string;

  if (activeTournamentRecord) {
    await airtableUpdate<TournamentFields>(AIRTABLE_TOURNAMENTS_TABLE, activeTournamentRecord.id, {
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
    });

    tournamentRecordId = activeTournamentRecord.id;
  } else {
    const created = await airtableCreate<TournamentFields>(AIRTABLE_TOURNAMENTS_TABLE, {
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
    });

    tournamentRecordId = created.records[0].id;
  }

  const existingTeams = await airtableFetch<TeamFields>(AIRTABLE_TEAMS_TABLE, {
    filterByFormula: `{tournamentSlug}="${nextSlug}"`,
  });

  const existingMatches = await airtableFetch<MatchFields>(AIRTABLE_MATCHES_TABLE, {
    filterByFormula: `{tournamentSlug}="${nextSlug}"`,
  });

  const nextTeams = tournament.groups.flatMap((group) =>
    group.teams.map((team) => ({
      groupKey: group.key,
      team,
    }))
  );

  const nextMatches = tournament.groups.flatMap((group) =>
    group.matches.map((match) => ({
      groupKey: group.key,
      match,
    }))
  );

  const existingTeamsByTeamId = new Map(
    existingTeams.map((record) => [record.fields.teamId ?? "", record])
  );

  const existingMatchesByMatchId = new Map(
    existingMatches.map((record) => [record.fields.matchId ?? "", record])
  );

  const nextTeamIds = new Set(nextTeams.map((item) => item.team.id));
  const nextMatchIds = new Set(nextMatches.map((item) => item.match.id));

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

  if (teamIdsToDelete.length) {
    await airtableDelete(AIRTABLE_TEAMS_TABLE, teamIdsToDelete);
  }

  if (matchIdsToDelete.length) {
    await airtableDelete(AIRTABLE_MATCHES_TABLE, matchIdsToDelete);
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
      await airtableUpdate(AIRTABLE_TEAMS_TABLE, existing.id, fields);
    } else {
      await airtableCreate(AIRTABLE_TEAMS_TABLE, fields);
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
      await airtableUpdate(AIRTABLE_MATCHES_TABLE, existing.id, fields);
    } else {
      await airtableCreate(AIRTABLE_MATCHES_TABLE, fields);
    }
  }

  return {
    tournamentRecordId,
    slug: nextSlug,
  };
}