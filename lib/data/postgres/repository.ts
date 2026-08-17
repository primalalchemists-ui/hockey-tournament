import { randomUUID } from "node:crypto";

import { and, desc, eq, ne, notInArray, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type { Tournament } from "@/types/tournament";
import { getDb, type Database } from "@/lib/db/client";
import {
  groups,
  matches,
  scorers,
  teams,
  tournamentAssets,
  tournaments,
} from "@/lib/db/schema";

import {
  TournamentOperationError,
  type TournamentLoadResult,
  type TournamentRepository,
  type TournamentSummary,
} from "../types";
import { slugifyTournamentTitle } from "../slug";
import {
  ASSET_KINDS,
  assetFieldPrefix,
  buildTournamentFromRows,
  type AssetKind,
} from "./mappers";

type Statement = BatchItem<"pg">;

/* ==========================================================================
 * ODCZYT
 * ======================================================================== */

async function readBundleFor(
  db: Database,
  where: ReturnType<typeof eq>
) {
  const rows = await db.select().from(tournaments).where(where).limit(1);

  const tournament = rows[0];
  if (!tournament) return null;

  // Jeden batch = jeden round-trip HTTP na wszystkie tabele zależne.
  // Brak N+1: żadna kolekcja nie jest pobierana per wiersz rodzica.
  const [assetRows, groupRows, teamRows, matchRows, scorerRows] =
    await db.batch([
      db
        .select()
        .from(tournamentAssets)
        .where(eq(tournamentAssets.tournamentId, tournament.id)),
      db.select().from(groups).where(eq(groups.tournamentId, tournament.id)),
      db.select().from(teams).where(eq(teams.tournamentId, tournament.id)),
      db.select().from(matches).where(eq(matches.tournamentId, tournament.id)),
      db.select().from(scorers).where(eq(scorers.tournamentId, tournament.id)),
    ]);

  return {
    tournament,
    assets: assetRows,
    groups: groupRows,
    teams: teamRows,
    matches: matchRows,
    scorers: scorerRows,
  };
}

async function loadBundle(
  where: ReturnType<typeof eq>,
  label: string
): Promise<TournamentLoadResult> {
  try {
    const bundle = await readBundleFor(getDb(), where);

    if (!bundle) {
      return { status: "empty" };
    }

    return { status: "ok", tournament: buildTournamentFromRows(bundle) };
  } catch (error) {
    console.error(`[postgresRepo] ${label} failed:`, error);

    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Nieznany błąd odczytu danych",
    };
  }
}

/** Publiczny frontend: turniej oznaczony jako wyświetlany. */
async function getCurrentTournament(): Promise<TournamentLoadResult> {
  return loadBundle(eq(tournaments.isCurrent, true), "getCurrentTournament");
}

/** Panel admina: dowolny turniej po UUID, niezależnie od statusu publicznego. */
async function getTournamentById(id: string): Promise<TournamentLoadResult> {
  if (!id) return { status: "empty" };

  return loadBundle(eq(tournaments.id, id), "getTournamentById");
}

async function listTournaments(): Promise<TournamentSummary[]> {
  const rows = await getDb()
    .select({
      id: tournaments.id,
      title: tournaments.title,
      slug: tournaments.slug,
      isCurrent: tournaments.isCurrent,
      archivedAt: tournaments.archivedAt,
      createdAt: tournaments.createdAt,
    })
    .from(tournaments)
    .orderBy(desc(tournaments.createdAt));

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    slug: row.slug,
    isCurrent: row.isCurrent,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  }));
}

/* ==========================================================================
 * CYKL ŻYCIA TURNIEJU
 * ======================================================================== */

/** Slug musi być unikalny — dokładamy sufiks, gdy nazwa się powtarza. */
async function reserveUniqueSlug(
  db: Database,
  desiredSlug: string,
  excludeTournamentId?: string
) {
  const taken = await db
    .select({ slug: tournaments.slug, id: tournaments.id })
    .from(tournaments);

  const used = new Set(
    taken
      .filter((row) => row.id !== excludeTournamentId)
      .map((row) => row.slug)
  );

  if (!used.has(desiredSlug)) return desiredSlug;

  for (let suffix = 2; suffix < 500; suffix += 1) {
    const candidate = `${desiredSlug}-${suffix}`;
    if (!used.has(candidate)) return candidate;
  }

  throw new TournamentOperationError(
    "Nie udało się wygenerować unikalnego adresu dla tego tytułu."
  );
}

async function createTournament(title: string) {
  const trimmed = title.trim();

  if (!trimmed) {
    throw new TournamentOperationError("Nazwa turnieju nie może być pusta.");
  }

  const db = getDb();
  const slug = await reserveUniqueSlug(db, slugifyTournamentTitle(trimmed));
  const id = randomUUID();

  // Świadomie NIE ustawiamy isCurrent — nowy turniej nie może podmienić
  // tego, co widzą kibice, dopóki admin tego jawnie nie zrobi.
  await db.insert(tournaments).values({
    id,
    slug,
    title: trimmed,
    isCurrent: false,
  });

  return { id, slug };
}

async function setCurrentTournament(tournamentId: string) {
  const db = getDb();

  const rows = await db
    .select({ id: tournaments.id, archivedAt: tournaments.archivedAt })
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId))
    .limit(1);

  if (!rows[0]) {
    throw new TournamentOperationError("Turniej nie istnieje.");
  }

  if (rows[0].archivedAt) {
    throw new TournamentOperationError(
      "Nie można wyświetlić zarchiwizowanego turnieju. Najpierw przywróć go z archiwum."
    );
  }

  // Atomowo: w jednej transakcji gaśnie stary current i zapala się nowy.
  // Kolejność ma znaczenie — częściowy indeks unikalny nie dopuściłby
  // stanu z dwoma wyświetlanymi turniejami.
  await db.batch([
    db
      .update(tournaments)
      .set({ isCurrent: false })
      .where(and(eq(tournaments.isCurrent, true), ne(tournaments.id, tournamentId))),
    db
      .update(tournaments)
      .set({ isCurrent: true, updatedAt: new Date() })
      .where(eq(tournaments.id, tournamentId)),
  ]);
}

async function setTournamentArchived(tournamentId: string, archived: boolean) {
  const db = getDb();

  const rows = await db
    .select({ id: tournaments.id, isCurrent: tournaments.isCurrent })
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId))
    .limit(1);

  if (!rows[0]) {
    throw new TournamentOperationError("Turniej nie istnieje.");
  }

  if (archived && rows[0].isCurrent) {
    throw new TournamentOperationError(
      "Ten turniej jest wyświetlany na stronie. Najpierw ustaw inny turniej jako wyświetlany."
    );
  }

  await db
    .update(tournaments)
    .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
    .where(eq(tournaments.id, tournamentId));
}

/* ==========================================================================
 * ZAPIS
 * ======================================================================== */

/** Odczytuje mapy external_id -> uuid, żeby zapis nie tworzył duplikatów. */
async function readIdentityMaps(db: Database, tournamentId: string) {
  const [groupRows, teamRows, matchRows, scorerRows, assetRows] =
    await db.batch([
      db
        .select({ id: groups.id, key: groups.key })
        .from(groups)
        .where(eq(groups.tournamentId, tournamentId)),
      db
        .select({
          id: teams.id,
          externalId: teams.externalId,
          logoPublicId: teams.logoPublicId,
        })
        .from(teams)
        .where(eq(teams.tournamentId, tournamentId)),
      db
        .select({ id: matches.id, externalId: matches.externalId })
        .from(matches)
        .where(eq(matches.tournamentId, tournamentId)),
      db
        .select({ id: scorers.id, externalId: scorers.externalId })
        .from(scorers)
        .where(eq(scorers.tournamentId, tournamentId)),
      db
        .select({
          id: tournamentAssets.id,
          kind: tournamentAssets.kind,
          publicId: tournamentAssets.publicId,
        })
        .from(tournamentAssets)
        .where(eq(tournamentAssets.tournamentId, tournamentId)),
    ]);

  return {
    groupIdByKey: new Map(groupRows.map((row) => [row.key, row.id])),
    teamIdByExternalId: new Map(
      teamRows.map((row) => [row.externalId, row.id])
    ),
    matchIdByExternalId: new Map(
      matchRows.map((row) => [row.externalId, row.id])
    ),
    scorerIdByExternalId: new Map(
      scorerRows.map((row) => [row.externalId, row.id])
    ),
    assetIdByKind: new Map(assetRows.map((row) => [row.kind, row.id])),

    // Model domenowy NIE przenosi public_id przy odczycie (adapter Airtable
    // go nie zwraca), więc payload zapisu z panelu go nie zawiera. Bez
    // zapamiętania obecnych wartości zwykły zapis wyzerowałby identyfikatory
    // Cloudinary i zepsuł sprzątanie starych plików.
    teamLogoPublicIdByExternalId: new Map(
      teamRows.map((row) => [row.externalId, row.logoPublicId])
    ),
    assetPublicIdByKind: new Map(
      assetRows.map((row) => [row.kind, row.publicId])
    ),
  };
}

/**
 * Wybiera public_id do zapisania.
 *
 * - payload podaje wartość  -> nowy upload, nadpisujemy,
 * - payload nie podaje, ale asset dalej istnieje -> zachowujemy obecną,
 * - assetu nie ma (pusty URL) -> czyścimy.
 */
function resolvePublicId(
  incoming: string | undefined,
  existing: string | null | undefined,
  hasAsset: boolean
): string | null {
  if (!hasAsset) return null;
  if (incoming) return incoming;
  return existing ?? null;
}

type AssetInput = {
  kind: AssetKind;
  url: string;
  mimeType: string;
  fileName: string;
  publicId: string;
};

/** Wyciąga assety z płaskiego obiektu domenowego. */
function collectAssets(tournament: Tournament): AssetInput[] {
  const source = tournament.assets as unknown as Record<string, string | undefined>;
  const collected: AssetInput[] = [];

  for (const kind of ASSET_KINDS) {
    const prefix = assetFieldPrefix(kind);
    const url = source[prefix];

    if (!url) continue;

    collected.push({
      kind,
      url,
      mimeType: source[`${prefix}Type`] ?? "",
      fileName: source[`${prefix}Name`] ?? "",
      publicId: source[`${prefix}PublicId`] ?? "",
    });
  }

  return collected;
}

async function saveTournament(tournamentId: string, tournament: Tournament) {
  const db = getDb();

  if (!tournamentId) {
    throw new TournamentOperationError(
      "Zapis wymaga jawnego identyfikatora turnieju."
    );
  }

  // Turniej MUSI już istnieć. Zapis nigdy nie zgaduje, który turniej
  // modyfikować, i nigdy nie tworzy nowego przy okazji — tworzenie ma
  // własną, jawną operację createTournament().
  const existingRows = await db
    .select({ id: tournaments.id, isCurrent: tournaments.isCurrent })
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId))
    .limit(1);

  const existing = existingRows[0];

  if (!existing) {
    throw new TournamentOperationError(
      "Turniej o podanym identyfikatorze nie istnieje."
    );
  }

  const nextSlug = await reserveUniqueSlug(
    db,
    slugifyTournamentTitle(tournament.title || ""),
    tournamentId
  );

  const isNewTournament = false;

  const maps = isNewTournament
    ? {
        groupIdByKey: new Map<string, string>(),
        teamIdByExternalId: new Map<string, string>(),
        matchIdByExternalId: new Map<string, string>(),
        scorerIdByExternalId: new Map<string, string>(),
        assetIdByKind: new Map<string, string>(),
        teamLogoPublicIdByExternalId: new Map<string, string | null>(),
        assetPublicIdByKind: new Map<string, string | null>(),
      }
    : await readIdentityMaps(db, tournamentId);

  const statements: Statement[] = [];

  /* --- turniej -------------------------------------------------------- */

  // UWAGA: zapis danych NIE dotyka isCurrent ani archivedAt.
  // Który turniej jest wyświetlany publicznie zmienia wyłącznie
  // setCurrentTournament() — edycja treści nigdy nie przejmuje strony.
  statements.push(
    db
      .update(tournaments)
      .set({
        slug: nextSlug,
        title: tournament.title,
        campStartDate: tournament.campStartDate || "",
        campSignupLink: tournament.campSignupLink || "",
        tickerMessage: tournament.tickerMessage || "",
        showTopScorerTicker: tournament.showTopScorerTicker ?? true,
        updatedAt: new Date(),
      })
      .where(eq(tournaments.id, tournamentId)) as Statement
  );

  /* --- assety --------------------------------------------------------- */

  const assetInputs = collectAssets(tournament);

  if (assetInputs.length) {
    statements.push(
      db
        .insert(tournamentAssets)
        .values(
          assetInputs.map((asset) => ({
            id: maps.assetIdByKind.get(asset.kind) ?? randomUUID(),
            tournamentId,
            kind: asset.kind,
            url: asset.url,
            mimeType: asset.mimeType || null,
            fileName: asset.fileName || null,
            publicId: resolvePublicId(
              asset.publicId,
              maps.assetPublicIdByKind.get(asset.kind),
              true
            ),
          }))
        )
        .onConflictDoUpdate({
          target: [tournamentAssets.tournamentId, tournamentAssets.kind],
          set: {
            url: sql`excluded.url`,
            mimeType: sql`excluded.mime_type`,
            fileName: sql`excluded.file_name`,
            publicId: sql`excluded.public_id`,
          },
        }) as Statement
    );
  }

  statements.push(
    buildDeleteStale(
      db,
      tournamentAssets,
      tournamentAssets.tournamentId,
      tournamentId,
      tournamentAssets.kind,
      assetInputs.map((asset) => asset.kind)
    )
  );

  /* --- grupy ---------------------------------------------------------- */

  const groupInputs = tournament.groups.map((group, index) => ({
    id: maps.groupIdByKey.get(group.key) ?? randomUUID(),
    tournamentId,
    key: group.key,
    name: group.name,
    sortOrder: index,
  }));

  const groupIdByKey = new Map(groupInputs.map((g) => [g.key, g.id]));

  if (groupInputs.length) {
    statements.push(
      db
        .insert(groups)
        .values(groupInputs)
        .onConflictDoUpdate({
          target: [groups.tournamentId, groups.key],
          set: {
            name: sql`excluded.name`,
            sortOrder: sql`excluded.sort_order`,
          },
        }) as Statement
    );
  }

  statements.push(
    buildDeleteStale(db, groups, groups.tournamentId, tournamentId, groups.key, [
      ...groupIdByKey.keys(),
    ])
  );

  /* --- drużyny -------------------------------------------------------- */

  const teamInputs = tournament.groups.flatMap((group) =>
    group.teams.map((team) => ({
      id: maps.teamIdByExternalId.get(team.id) ?? randomUUID(),
      tournamentId,
      groupId: groupIdByKey.get(group.key)!,
      externalId: team.id,
      name: team.name,
      shortName: team.shortName || null,
      logoUrl: team.logoUrl || null,
      logoName: team.logoName || null,
      logoType: team.logoType || null,
      logoPublicId: resolvePublicId(
        team.logoPublicId,
        maps.teamLogoPublicIdByExternalId.get(team.id),
        Boolean(team.logoUrl)
      ),
      sourceOrder: team.sourceOrder,
    }))
  );

  const teamIdByExternalId = new Map(
    teamInputs.map((team) => [team.externalId, team.id])
  );

  if (teamInputs.length) {
    statements.push(
      db
        .insert(teams)
        .values(teamInputs)
        .onConflictDoUpdate({
          target: [teams.tournamentId, teams.externalId],
          set: {
            groupId: sql`excluded.group_id`,
            name: sql`excluded.name`,
            shortName: sql`excluded.short_name`,
            logoUrl: sql`excluded.logo_url`,
            logoName: sql`excluded.logo_name`,
            logoType: sql`excluded.logo_type`,
            logoPublicId: sql`excluded.logo_public_id`,
            sourceOrder: sql`excluded.source_order`,
          },
        }) as Statement
    );
  }

  statements.push(
    buildDeleteStale(
      db,
      teams,
      teams.tournamentId,
      tournamentId,
      teams.externalId,
      [...teamIdByExternalId.keys()]
    )
  );

  /* --- mecze ---------------------------------------------------------- */

  let matchOrder = 0;

  const matchInputs = tournament.groups.flatMap((group) =>
    group.matches.map((match) => ({
      id: maps.matchIdByExternalId.get(match.id) ?? randomUUID(),
      tournamentId,
      groupId: groupIdByKey.get(group.key)!,
      externalId: match.id,
      stage: "group" as const,
      // Mecz z wynikiem jest zakończony. Status jest ustawiany JAWNIE,
      // bez polegania na wartości domyślnej kolumny.
      status: "finished" as const,
      homeTeamId: teamIdByExternalId.get(match.homeTeamId) ?? null,
      awayTeamId: teamIdByExternalId.get(match.awayTeamId) ?? null,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      sourceOrder: matchOrder++,
    }))
  );

  const validMatchInputs = matchInputs.filter(
    (match) => match.homeTeamId && match.awayTeamId
  );

  if (validMatchInputs.length) {
    statements.push(
      db
        .insert(matches)
        .values(validMatchInputs)
        .onConflictDoUpdate({
          target: [matches.tournamentId, matches.externalId],
          set: {
            groupId: sql`excluded.group_id`,
            stage: sql`excluded.stage`,
            status: sql`excluded.status`,
            homeTeamId: sql`excluded.home_team_id`,
            awayTeamId: sql`excluded.away_team_id`,
            homeScore: sql`excluded.home_score`,
            awayScore: sql`excluded.away_score`,
            sourceOrder: sql`excluded.source_order`,
          },
        }) as Statement
    );
  }

  statements.push(
    buildDeleteStale(
      db,
      matches,
      matches.tournamentId,
      tournamentId,
      matches.externalId,
      validMatchInputs.map((match) => match.externalId)
    )
  );

  /* --- strzelcy ------------------------------------------------------- */

  const scorerInputs = (tournament.scorers ?? [])
    .map((scorer) => ({
      id: maps.scorerIdByExternalId.get(scorer.id) ?? randomUUID(),
      tournamentId,
      teamId: teamIdByExternalId.get(scorer.teamId) ?? null,
      externalId: scorer.id,
      playerName: scorer.playerName,
      jerseyNumber: scorer.jerseyNumber ?? null,
      goals: scorer.goals,
    }))
    .filter(
      (scorer): scorer is typeof scorer & { teamId: string } =>
        scorer.teamId !== null
    );

  if (scorerInputs.length) {
    statements.push(
      db
        .insert(scorers)
        .values(scorerInputs)
        .onConflictDoUpdate({
          target: [scorers.tournamentId, scorers.externalId],
          set: {
            teamId: sql`excluded.team_id`,
            playerName: sql`excluded.player_name`,
            jerseyNumber: sql`excluded.jersey_number`,
            goals: sql`excluded.goals`,
          },
        }) as Statement
    );
  }

  statements.push(
    buildDeleteStale(
      db,
      scorers,
      scorers.tournamentId,
      tournamentId,
      scorers.externalId,
      scorerInputs.map((scorer) => scorer.externalId)
    )
  );

  // Cały zapis w JEDNEJ transakcji i JEDNYM round-tripie.
  // Airtable potrzebował ~89 sekwencyjnych żądań bez żadnej atomowości.
  await db.batch(statements as [Statement, ...Statement[]]);

  return { slug: nextSlug };
}

/* ==========================================================================
 * POMOCNICZE
 * ======================================================================== */

type AnyTable = Parameters<Database["delete"]>[0];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyColumn = any;

/**
 * Usuwa wiersze turnieju, których nie ma w zapisywanym payloadzie.
 * Pusta lista "do zachowania" oznacza usunięcie wszystkich — `notInArray`
 * z pustą tablicą wygenerowałoby niepoprawny SQL.
 */
function buildDeleteStale(
  db: Database,
  table: AnyTable,
  tournamentColumn: AnyColumn,
  tournamentId: string,
  keyColumn: AnyColumn,
  keepKeys: string[]
): Statement {
  if (keepKeys.length === 0) {
    return db
      .delete(table)
      .where(eq(tournamentColumn, tournamentId)) as Statement;
  }

  return db
    .delete(table)
    .where(
      and(
        eq(tournamentColumn, tournamentId),
        notInArray(keyColumn, keepKeys)
      )
    ) as Statement;
}

export const postgresRepository: TournamentRepository = {
  name: "postgres",
  supportsMultipleTournaments: true,
  getCurrentTournament,
  listTournaments,
  getTournamentById,
  createTournament,
  saveTournament,
  setCurrentTournament,
  setTournamentArchived,
};

export const __internal = { collectAssets, reserveUniqueSlug };
