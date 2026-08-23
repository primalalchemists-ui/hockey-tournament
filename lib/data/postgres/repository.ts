import { randomUUID } from "node:crypto";

import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  ne,
  notInArray,
  sql,
} from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type { Tournament } from "@/types/tournament";
import { getDb, type Database } from "@/lib/db/client";
import {
  groups,
  matches,
  scorers,
  teamLogoAssets,
  teams,
  tournamentAssets,
  tournaments,
} from "@/lib/db/schema";

import {
  MAIN_POOL_KEY,
  MAIN_POOL_NAME,
  parseTournamentSettings,
  readTournamentSettings,
  type TournamentSettings,
} from "@/types/tournament-config";
import {
  TournamentOperationError,
  type TournamentLoadResult,
  type TournamentRepository,
  type TournamentSummary,
  type CreateTournamentInput,
  type UpdateTournamentSettingsInput,
  type GroupResultInput,
} from "../types";
import type { MediaAsset } from "../types";
import {
  MEDIA_CATEGORIES,
  acceptsMimeType,
  type MediaCategory,
} from "@/lib/media/categories";
import { slugifyTournamentTitle } from "../slug";
import { normalizeColorToHex } from "@/lib/public/color";
import { bumpPublicRevisionStatement } from "./public-revision";
import { pruneEmptyCollections } from "./collections";
import { learnAlias, resolveLogoAssetIds } from "./logo-library";
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

  /*
    Slugi logotypów dociągamy tylko wtedy, gdy jakaś drużyna faktycznie
    korzysta już z biblioteki. Turnieje sprzed migracji nie płacą za to
    ani jednym dodatkowym zapytaniem.
  */
  const assetIds = [
    ...new Set(
      teamRows
        .map((row) => row.logoAssetId)
        .filter((value): value is string => Boolean(value))
    ),
  ];

  let logoSlugByAssetId: Map<string, string> | undefined;

  if (assetIds.length > 0) {
    const logoRows = await db
      .select({ id: teamLogoAssets.id, slug: teamLogoAssets.slug })
      .from(teamLogoAssets)
      .where(inArray(teamLogoAssets.id, assetIds));

    logoSlugByAssetId = new Map(logoRows.map((row) => [row.id, row.slug]));
  }

  return {
    tournament,
    assets: assetRows,
    groups: groupRows,
    teams: teamRows,
    matches: matchRows,
    scorers: scorerRows,
    logoSlugByAssetId,
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

    return {
      status: "ok",
      tournament: buildTournamentFromRows(bundle),
      settings: readTournamentSettings({
        structure: bundle.tournament.structure,
        format: bundle.tournament.format,
        playoffConfig: bundle.tournament.playoffConfig,
        scorersEnabled: bundle.tournament.scorersEnabled,
      }),
    };
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
      structure: tournaments.structure,
      format: tournaments.format,
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
    ...readTournamentSettings({
      structure: row.structure,
      format: row.format,
      playoffConfig: null,
    }),
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

async function createTournament(input: CreateTournamentInput) {
  const trimmed = input.title.trim();

  if (!trimmed) {
    throw new TournamentOperationError("Nazwa turnieju nie może być pusta.");
  }

  // Walidacja PRZED zapisem — do bazy nie trafia konfiguracja półpoprawna.
  const settings = parseTournamentSettings(input.settings);

  const db = getDb();
  const slug = await reserveUniqueSlug(db, slugifyTournamentTitle(trimmed));
  const id = randomUUID();

  // Turniej i jego struktura startowa powstają w JEDNEJ transakcji —
  // nie ma momentu, w którym turniej istnieje bez poprawnej konfiguracji.
  //
  //  structure = "groups" -> od razu "Grupa A", bez zbędnego klikania,
  //  structure = "single" -> jedna techniczna pula, niewidoczna w UI,
  //                          dzięki której calculateStandings działa bez zmian.
  const isSingle = settings.structure === "single";

  await db.batch([
    db.insert(tournaments).values({
      id,
      slug,
      title: trimmed,
      isCurrent: false,
      structure: settings.structure,
      format: settings.format,
      playoffConfig: settings.playoffConfig,
      scorersEnabled: settings.scorersEnabled,
    }),
    db.insert(groups).values({
      id: randomUUID(),
      tournamentId: id,
      key: isSingle ? MAIN_POOL_KEY : "A",
      name: isSingle ? MAIN_POOL_NAME : "Grupa A",
      sortOrder: 0,
    }),
  ]);

  return { id, slug };
}

/**
 * Zmiana nazwy i konfiguracji turnieju.
 *
 * Zmiana structure jest dopuszczalna wyłącznie dla turnieju bez danych —
 * przeniesienie drużyn i meczów między "jedną tabelą" a "grupami" jest
 * operacją destrukcyjną i nie zostanie wykonana automatycznie.
 */
async function updateTournamentSettings(
  tournamentId: string,
  input: UpdateTournamentSettingsInput
) {
  const db = getDb();

  const rows = await db
    .select({
      id: tournaments.id,
      title: tournaments.title,
      structure: tournaments.structure,
      format: tournaments.format,
      playoffConfig: tournaments.playoffConfig,
      scorersEnabled: tournaments.scorersEnabled,
    })
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId))
    .limit(1);

  const existing = rows[0];

  if (!existing) {
    throw new TournamentOperationError("Turniej nie istnieje.");
  }

  const current = readTournamentSettings(existing);

  const nextStructure = input.structure ?? current.structure;

  if (nextStructure !== current.structure) {
    const [teamRows, matchRows, groupRows] = await db.batch([
      db
        .select({ n: sql`count(*)::int` })
        .from(teams)
        .where(eq(teams.tournamentId, tournamentId)),
      db
        .select({ n: sql`count(*)::int` })
        .from(matches)
        .where(eq(matches.tournamentId, tournamentId)),
      db
        .select({ n: sql`count(*)::int` })
        .from(groups)
        .where(eq(groups.tournamentId, tournamentId)),
    ]);

    const teamCount = Number(teamRows[0]?.n ?? 0);
    const matchCount = Number(matchRows[0]?.n ?? 0);
    const groupCount = Number(groupRows[0]?.n ?? 0);

    if (teamCount > 0 || matchCount > 0 || groupCount > 1) {
      throw new TournamentOperationError(
        "Nie można zmienić struktury turnieju, który ma już drużyny, mecze lub więcej niż jedną grupę. " +
          "Utwórz nowy turniej z właściwą strukturą."
      );
    }
  }

  const settings = parseTournamentSettings({
    structure: nextStructure,
    format: input.format ?? current.format,
    playoffConfig:
      input.playoffConfig ?? current.playoffConfig ?? undefined,
    scorersEnabled: input.scorersEnabled ?? current.scorersEnabled,
  });

  const nextTitle = input.title?.trim() || existing.title;
  const nextSlug = await reserveUniqueSlug(
    db,
    slugifyTournamentTitle(nextTitle),
    tournamentId
  );

  const statements: Statement[] = [
    db
      .update(tournaments)
      .set({
        title: nextTitle,
        slug: nextSlug,
        structure: settings.structure,
        format: settings.format,
        playoffConfig: settings.playoffConfig,
        scorersEnabled: settings.scorersEnabled,
        updatedAt: new Date(),
      })
      .where(eq(tournaments.id, tournamentId)) as Statement,
  ];

  // Zmiana structure na pustym turnieju musi też poprawić pulę startową,
  // żeby nie została po niej "Grupa A" przy strukturze jednotabelowej.
  if (nextStructure !== current.structure) {
    const isSingle = nextStructure === "single";

    statements.push(
      db
        .update(groups)
        .set({
          key: isSingle ? MAIN_POOL_KEY : "A",
          name: isSingle ? MAIN_POOL_NAME : "Grupa A",
        })
        .where(eq(groups.tournamentId, tournamentId)) as Statement
    );
  }

  // Tytuł i format są widoczne publicznie — wersja rośnie w tej samej
  // transakcji co zmiana ustawień.
  statements.push(bumpPublicRevisionStatement(db, tournamentId));

  await db.batch(statements as [Statement, ...Statement[]]);
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
 * TRWAŁE USUNIĘCIE
 * ======================================================================== */

/**
 * Kasuje turniej i WSZYSTKO, co należy wyłącznie do niego.
 *
 * Nie wypisujemy tu listy tabel — robi to schemat. Każda tabela turniejowa
 * (`tournament_assets`, `groups`, `teams`, `brackets`, `bracket_rounds`,
 * `matches`, `scorers`, `standings_snapshots`, `standings_snapshot_rows`,
 * `tournament_collection_members`) ma `ON DELETE CASCADE` na
 * `tournament_id`, więc jedno usunięcie wiersza turnieju zabiera komplet
 * jego danych w JEDNEJ operacji bazy. Ręczne kasowanie po kolei byłoby
 * drugą, rozjeżdżającą się definicją własności danych.
 *
 * CZEGO TO NIE RUSZA — i to jest tu najważniejsze:
 *
 *   - `team_logo_assets` to biblioteka GLOBALNA, bez `tournament_id`.
 *     `teams.logo_asset_id` wskazuje na nią przez `ON DELETE SET NULL`,
 *     więc herby przeżywają kasowanie turnieju i zostają dla pozostałych.
 *   - Cloudinary nie jest dotykane. Ta sama grafika może być używana przez
 *     inny turniej — kasujemy referencję, nigdy plik.
 */
async function deleteTournamentPermanently(tournamentId: string) {
  const db = getDb();

  const rows = await db
    .select({
      id: tournaments.id,
      isCurrent: tournaments.isCurrent,
      title: tournaments.title,
    })
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId))
    .limit(1);

  if (!rows[0]) {
    throw new TournamentOperationError("Turniej nie istnieje.");
  }

  /*
    TURNIEJ WYŚWIETLANY PUBLICZNIE JEST CHRONIONY.

    Automatyczny wybór „następnego" turnieju oznaczałby, że kibic dostaje
    losowe wydarzenie na stronie głównej. To decyzja administratora, nie
    skutek uboczny kasowania.
  */
  if (rows[0].isCurrent) {
    throw new TournamentOperationError(
      "Ten turniej jest wyświetlany na stronie. Najpierw ustaw inny turniej jako aktualny."
    );
  }

  await db.delete(tournaments).where(eq(tournaments.id, tournamentId));

  /*
    Kolekcja, która została bez turniejów, nie ma już czego przełączać —
    ten sam sprzątacz, którego używa odłączanie kategorii.
  */
  await pruneEmptyCollections();
}

/* ==========================================================================
 * BIBLIOTEKA MEDIÓW
 * ======================================================================== */

/**
 * Pliki wgrane już wcześniej przez aplikację, pasujące do danego pola.
 *
 * Źródłem są WYŁĄCZNIE rekordy `tournament_assets` — nie przeglądamy konta
 * Cloudinary, więc na liście nie pojawi się przypadkowa zawartość chmury.
 *
 * Kategoria decyduje, które `kind` wchodzą do puli, i odsiewa pliki
 * niekompatybilne z polem (np. PDF w wyborze banera). Deduplikacja po
 * `publicId`: ta sama grafika użyta w trzech turniejach pojawia się raz.
 */
async function listMediaLibrary(
  category: MediaCategory
): Promise<MediaAsset[]> {
  const db = getDb();
  const definition = MEDIA_CATEGORIES[category];

  const rows = await db
    .select({
      kind: tournamentAssets.kind,
      url: tournamentAssets.url,
      mimeType: tournamentAssets.mimeType,
      fileName: tournamentAssets.fileName,
      publicId: tournamentAssets.publicId,
      tournamentTitle: tournaments.title,
      updatedAt: tournaments.updatedAt,
    })
    .from(tournamentAssets)
    .innerJoin(tournaments, eq(tournamentAssets.tournamentId, tournaments.id))
    .where(inArray(tournamentAssets.kind, definition.kinds));

  const unique = new Map<string, MediaAsset>();

  for (const row of [...rows].sort(
    (a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0)
  )) {
    if (!row.url) continue;
    if (!acceptsMimeType(category, row.mimeType ?? "")) continue;

    const key = row.publicId?.trim() || row.url;
    if (unique.has(key)) continue;

    unique.set(key, {
      url: row.url,
      publicId: row.publicId ?? "",
      fileName: row.fileName ?? "",
      mimeType: row.mimeType ?? "",
      kind: row.kind,
      usedBy: row.tournamentTitle ?? "",
    });
  }

  return [...unique.values()];
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
          logoAssetId: teams.logoAssetId,
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

    /**
     * Dotychczasowe przypisanie do biblioteki. Payload panelu MOŻE go nie
     * zawierać (np. zapis z widoku bez dialogu drużyny) — wtedy zostaje
     * to, co już jest, zamiast po cichu zrywać powiązanie.
     */
    teamLogoAssetIdByExternalId: new Map(
      teamRows.map((row) => [row.externalId, row.logoAssetId])
    ),

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

/**
 * Kolumny logo drużyny.
 *
 * Reguła bezpieczeństwa: wybór z biblioteki jest źródłem prawdy, ale
 * logo_url i logo_public_id ZOSTAJĄ wypełnione tą samą wartością. Dzięki
 * temu odczyt bez biblioteki (rollback, legacy, awaria) nadal zwraca
 * dokładnie ten sam herb, a publiczna strona nie zauważa różnicy.
 */
function buildTeamLogoColumns(
  team: Tournament["groups"][number]["teams"][number],
  context: {
    asset: { id: string; url: string; publicId: string | null } | null;
    existingPublicId: string | null | undefined;
    existingAssetId: string | null | undefined;
  }
) {
  if (context.asset) {
    return {
      logoUrl: context.asset.url,
      logoName: team.logoName || null,
      logoType: team.logoType || null,
      logoPublicId: context.asset.publicId,
      logoAssetId: context.asset.id,
    };
  }

  const hasAsset = Boolean(team.logoUrl);

  return {
    logoUrl: team.logoUrl || null,
    logoName: team.logoName || null,
    logoType: team.logoType || null,
    logoPublicId: resolvePublicId(
      team.logoPublicId,
      context.existingPublicId,
      hasAsset
    ),
    // Payload bez slugu nie zrywa istniejącego powiązania; usunięcie logo
    // (pusty URL) zrywa je świadomie.
    logoAssetId: hasAsset ? context.existingAssetId ?? null : null,
  };
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

/**
 * ZAMROŻONA FAZA GRUPOWA JEST NIETYKALNA.
 *
 * Po zamrożeniu tabela grupowa zamienia się w oficjalne rozstawienie:
 * snapshot i drabinka są już zbudowane. Zwykły zapis z panelu nadal
 * potrafił jednak nadpisać stary wynik grupowy — a snapshot zostawał
 * nietknięty. Efekt w hali: publiczna tabela pokazuje jedną kolejność,
 * drabinka gra według innej, i nikt tego nie zauważa do końca turnieju.
 *
 * Blokada mieszka po stronie ZAPISU, nie w interfejsie: wyłączony input
 * jest podpowiedzią dla oka, a nie zabezpieczeniem.
 *
 * Świadomie blokujemy WYŁĄCZNIE zmianę wyników fazy grupowej. Nazwa
 * turnieju, grafiki, strzelcy i skład nadal zapisują się normalnie, tak
 * samo jak wyniki drabinki i minigrupy — te mają własne bramkowanie.
 */
async function assertGroupResultsEditable(
  db: Database,
  tournamentId: string,
  phase: string,
  incoming: Tournament
): Promise<void> {
  /*
    Faza grupowa to jedyny stan, w którym wyniki grupowe są oficjalnie
    edytowalne. Turniej ligowy nigdy jej nie opuszcza, a turniej pucharowy
    wraca do niej wyłącznie przez jawne cofnięcie — i wtedy korekta znów
    jest legalna.
  */
  if (phase === "group_stage") return;

  const storedRows = await db
    .select({
      externalId: matches.externalId,
      homeScore: matches.homeScore,
      awayScore: matches.awayScore,
    })
    .from(matches)
    .where(and(eq(matches.tournamentId, tournamentId), eq(matches.stage, "group")));

  /** Wynik meczu w postaci porównywalnej; null = mecz bez wyniku. */
  const scoreOf = (home: number | null, away: number | null) =>
    home === null || away === null ? null : `${home}:${away}`;

  const stored = new Map(
    storedRows.map((row) => [
      row.externalId,
      scoreOf(row.homeScore, row.awayScore),
    ])
  );

  const submitted = new Map<string, string | null>();

  for (const group of incoming.groups ?? []) {
    for (const match of group.matches) {
      submitted.set(match.id, scoreOf(match.homeScore, match.awayScore));
    }
  }

  const changed: string[] = [];

  for (const [externalId, score] of submitted) {
    if (stored.get(externalId) !== score) changed.push(externalId);
  }

  /*
    Model domenowy przenosi wyłącznie mecze ROZEGRANE, więc brak meczu
    w payloadzie znaczy „wyczyszczono wynik" — i to też jest zmiana.
  */
  for (const [externalId, score] of stored) {
    if (score !== null && !submitted.has(externalId)) changed.push(externalId);
  }

  if (changed.length === 0) return;

  throw new TournamentOperationError(
    "Nie można zmieniać wyników fazy grupowej po jej zamrożeniu. " +
      "Cofnij turniej do fazy grupowej, popraw wynik i zamroź ją ponownie."
  );
}

/**
 * ZAPIS SAMYCH WYNIKÓW FAZY GRUPOWEJ.
 *
 * Ta ścieżka istnieje po to, żeby wpisanie wyniku NIE mogło skasować niczego
 * innego. Pełny zapis wysyła cały turniej naraz — drużyny, grupy, grafiki —
 * więc panel otwarty rano nadpisuje nim wszystko, co zmieniono później,
 * a zniknięcie drużyny z payloadu kasuje kaskadą jej mecze razem z wynikami.
 *
 * Tutaj dotykamy WYŁĄCZNIE tabeli `matches`, i to tylko dla `stage='group'`.
 * Reguły kasowania są dokładnie te same co przy pełnym zapisie: znika mecz,
 * który MA wynik, a nie ma go w payloadzie (czyli wyczyszczono kratkę).
 * Terminarz bez wyników jest nietykalny — inaczej pierwszy zapis zmiótłby
 * rozpisane 90 meczów.
 */
async function saveGroupResults(
  tournamentId: string,
  results: GroupResultInput[]
): Promise<void> {
  const db = getDb();

  if (!tournamentId) {
    throw new TournamentOperationError(
      "Zapis wymaga jawnego identyfikatora turnieju."
    );
  }

  const existingRows = await db
    .select({ id: tournaments.id, phase: tournaments.phase })
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId))
    .limit(1);

  const existing = existingRows[0];

  if (!existing) {
    throw new TournamentOperationError(
      "Turniej o podanym identyfikatorze nie istnieje."
    );
  }

  if (existing.phase !== "group_stage") {
    throw new TournamentOperationError(
      "Nie można zmieniać wyników fazy grupowej po jej zamrożeniu. " +
        "Cofnij turniej do fazy grupowej, popraw wynik i zamroź ją ponownie."
    );
  }

  const maps = await readIdentityMaps(db, tournamentId);
  const groupIdByKey = maps.groupIdByKey;
  const teamIdByExternalId = maps.teamIdByExternalId;

  let order = 0;

  const inputs = results
    .map((result) => ({
      id: maps.matchIdByExternalId.get(makeResultId(result)) ?? randomUUID(),
      tournamentId,
      groupId: groupIdByKey.get(result.groupKey) ?? null,
      externalId: makeResultId(result),
      stage: "group" as const,
      status: "finished" as const,
      homeTeamId: teamIdByExternalId.get(result.homeTeamId) ?? null,
      awayTeamId: teamIdByExternalId.get(result.awayTeamId) ?? null,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
      sourceOrder: order++,
    }))
    /*
      Wynik wskazujący drużynę lub grupę spoza turnieju jest pomijany, a nie
      zapisywany z pustą referencją — pusty `home_team_id` znaczyłby mecz
      bez uczestnika i wypadłby z klasyfikacji bez śladu.
    */
    .filter((input) => input.groupId && input.homeTeamId && input.awayTeamId);

  const statements: Statement[] = [];

  if (inputs.length) {
    statements.push(
      db
        .insert(matches)
        .values(inputs)
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
          },
        }) as Statement
    );
  }

  const kept = inputs.map((input) => input.externalId);

  const deletable = and(
    eq(matches.tournamentId, tournamentId),
    eq(matches.stage, "group"),
    isNotNull(matches.homeScore)
  );

  statements.push(
    (kept.length === 0
      ? db.delete(matches).where(deletable)
      : db
          .delete(matches)
          .where(and(deletable, notInArray(matches.externalId, kept)))) as Statement
  );

  /*
    Znacznik zmiany turnieju idzie w TEJ SAMEJ transakcji. Publiczna strona
    rozpoznaje po nim nową wersję i dociąga snapshot; zapis wyników bez tego
    byłby dla kibica niewidoczny do najbliższego pełnego zapisu.
  */
  statements.push(
    db
      .update(tournaments)
      .set({ updatedAt: new Date() })
      .where(eq(tournaments.id, tournamentId)) as Statement
  );

  // Jedna transakcja: albo wchodzi komplet wyników, albo nic.
  await db.batch(statements as [Statement, ...Statement[]]);
}

/** Identyfikator meczu budowany tak samo jak w panelu: drużyny posortowane. */
function makeResultId(result: GroupResultInput): string {
  const [first, second] = [result.homeTeamId, result.awayTeamId].sort();
  return `${result.groupKey}-${first}-${second}`;
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
    .select({
      id: tournaments.id,
      isCurrent: tournaments.isCurrent,
      phase: tournaments.phase,
    })
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId))
    .limit(1);

  const existing = existingRows[0];

  if (!existing) {
    throw new TournamentOperationError(
      "Turniej o podanym identyfikatorze nie istnieje."
    );
  }

  await assertGroupResultsEditable(db, tournamentId, existing.phase, tournament);

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
        teamLogoAssetIdByExternalId: new Map<string, string | null>(),
        assetPublicIdByKind: new Map<string, string | null>(),
      }
    : await readIdentityMaps(db, tournamentId);

  /*
    BIBLIOTEKA LOGOTYPÓW.

    Panel przysyła slug wybranego herbu; tożsamością w bazie jest UUID.
    Rozwiązujemy je raz, jednym zapytaniem, przed zapisem.
  */
  const logoSlugs = tournament.groups.flatMap((group) =>
    group.teams
      .map((team) => team.logoAssetSlug)
      .filter((slug): slug is string => Boolean(slug))
  );

  const logoAssetBySlug = await resolveLogoAssetIds(logoSlugs);

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
        campTitle: tournament.campTitle || "",
        /*
          Wyłączenie zapisów NIE kasuje adresu — administrator może je
          włączyć ponownie bez wpisywania linku od nowa.
        */
        campRegistrationEnabled: tournament.campRegistrationEnabled ?? true,
        /*
          Do bazy trafia WYŁĄCZNIE postać kanoniczna `#RRGGBB`. Wartość
          niepoprawna nie jest zapisywana — pinezki wracają do domyślnego
          czerwonego, zamiast dostać uszkodzony kolor.
        */
        countdownPinColor:
          normalizeColorToHex(tournament.countdownPinColor) ?? null,
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

  /*
    KASOWANIE ASSETÓW NIEOBECNYCH W PAYLOADZIE — tylko rodzaje, które
    payload w ogóle POTRAFI wyrazić.

    Model domenowy (TournamentAssets) zna sześć slotów: harmonogram,
    regulamin, hero i trzy grafiki campu. Tła drabinki i podium żyją w tej
    samej tabeli, ale mają własną, jawną mutację (setPlayoffAsset) i nigdy
    nie trafiają do draftu panelu.

    Bez tego ograniczenia każde kliknięcie „Zapisz" kasowało oba tła
    play-off: admin wgrywał grafikę, widział podgląd, zapisywał turniej —
    i grafika znikała, a w Cloudinary zostawał osierocony plik.
  */
  const keptAssetKinds = assetInputs.map((asset) => asset.kind);

  const managedAssetsOfThisTournament = and(
    eq(tournamentAssets.tournamentId, tournamentId),
    inArray(tournamentAssets.kind, ASSET_KINDS as unknown as string[])
  );

  statements.push(
    (keptAssetKinds.length === 0
      ? db.delete(tournamentAssets).where(managedAssetsOfThisTournament)
      : db
          .delete(tournamentAssets)
          .where(
            and(
              managedAssetsOfThisTournament,
              notInArray(tournamentAssets.kind, keptAssetKinds)
            )
          )) as Statement
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
      ...buildTeamLogoColumns(team, {
        asset: team.logoAssetSlug
          ? logoAssetBySlug.get(team.logoAssetSlug) ?? null
          : null,
        existingPublicId: maps.teamLogoPublicIdByExternalId.get(team.id),
        existingAssetId: maps.teamLogoAssetIdByExternalId.get(team.id),
      }),
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
            logoAssetId: sql`excluded.logo_asset_id`,
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

  /*
    KASOWANIE MECZÓW NIEOBECNYCH W PAYLOADZIE — dwa ograniczenia.

    1. Tylko stage='group'. Payload panelu nie zna drabinki ani minigrupy,
       więc zwykły zapis tabeli nie może ich skasować.

    2. Tylko mecze, które MAJĄ już wynik.

       Model domenowy przenosi wyłącznie mecze rozegrane, więc terminarz
       (mecz zaplanowany, wyniki NULL) jest dla payloadu niewidzialny.
       Bez tego warunku jedno kliknięcie „Zapisz" w panelu kasowało cały
       rozpisany terminarz SUN CUP — 42 i 90 meczów — bo żaden z nich nie
       miał jeszcze wyniku. Brak meczu w payloadzie oznacza „wyczyszczono
       wynik", a nie „usuń zaplanowany mecz".
  */
  const keptMatchIds = validMatchInputs.map((match) => match.externalId);

  const deletableGroupMatch = and(
    eq(matches.tournamentId, tournamentId),
    eq(matches.stage, "group"),
    isNotNull(matches.homeScore)
  );

  statements.push(
    (keptMatchIds.length === 0
      ? db.delete(matches).where(deletableGroupMatch)
      : db
          .delete(matches)
          .where(
            and(
              deletableGroupMatch,
              notInArray(matches.externalId, keptMatchIds)
            )
          )) as Statement
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

  // Publicznie widoczna zmiana (wyniki, drużyny, strzelcy, assety, ticker)
  // — wersja rośnie w TEJ SAMEJ transakcji co dane.
  statements.push(bumpPublicRevisionStatement(db, tournamentId));

  // Cały zapis w JEDNEJ transakcji i JEDNYM round-tripie.
  // Airtable potrzebował ~89 sekwencyjnych żądań bez żadnej atomowości.
  await db.batch(statements as [Statement, ...Statement[]]);

  /*
    NAUKA ALIASÓW — po fakcie i celowo poza transakcją.

    Admin świadomie przypisał herb do drużyny o danej nazwie, więc
    „GKS Katowice 2" ma następnym razem trafić dokładnie w ten sam asset.
    To metadane wygody: gdyby zapis aliasu się nie powiódł, dane turnieju
    i tak są już bezpieczne, a dopasowanie po prostu zadziała słabiej.
  */
  for (const group of tournament.groups) {
    for (const team of group.teams) {
      if (!team.logoAssetSlug || !team.name?.trim()) continue;

      try {
        await learnAlias(team.logoAssetSlug, team.name);
      } catch (error) {
        console.warn("[logo-library] alias learning failed:", error);
      }
    }
  }

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
  updateTournamentSettings,
  saveTournament,
  setCurrentTournament,
  setTournamentArchived,
  deleteTournamentPermanently,
  listMediaLibrary,
  saveGroupResults,
};

export const __internal = { collectAssets, reserveUniqueSlug };
