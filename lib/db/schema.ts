import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * ============================================================================
 * SCHEMA POSTGRESQL — etap migracji storage
 * ============================================================================
 *
 * Zasady:
 *
 *  1. TOŻSAMOŚĆ NIEZALEŻNA OD NAZWY.
 *     Każda encja ma wewnętrzny `id uuid` jako klucz relacyjny. Slug i tytuł
 *     są wyłącznie prezentacyjne. Zmiana "Rabbit Cup" -> "Rabbit Cup 2026"
 *     nie rusza żadnego klucza obcego.
 *
 *  2. `external_id` TO IDENTYFIKATOR DOMENOWY.
 *     Model domenowy (types/tournament.ts) posługuje się stringowymi ID
 *     drużyn i meczów, na których opiera się cała logika UI oraz format
 *     matchId `${group}-${home}-${away}`. Zachowujemy je 1:1, żeby golden
 *     master i equivalence przechodziły bez tłumaczenia identyfikatorów.
 *
 *  3. GRUPA JEST ENCJĄ, nie polem tekstowym.
 *
 *  4. Tabele fazy pucharowej i snapshotów istnieją w schemacie, ale ŻADNA
 *     logika ich jeszcze nie używa. To fundament pod V2.
 */

/* ==========================================================================
 * TURNIEJ
 * ======================================================================== */

export const tournaments = pgTable(
  "tournaments",
  {
    /** Stabilna tożsamość turnieju — nie zmienia się nigdy. */
    id: uuid("id").primaryKey().defaultRandom(),

    /** Prezentacyjny / URL-owy. Może się zmieniać razem z tytułem. */
    slug: text("slug").notNull(),
    title: text("title").notNull(),

    /**
     * Struktura uczestników — oś NIEZALEŻNA od formatu.
     * "single" = jedna wspólna tabela, "groups" = podział na grupy.
     * Default "groups" backfilluje istniejące turnieje bez zmiany zachowania.
     */
    structure: text("structure").notNull().default("groups"),

    /** System rozgrywek: "league" | "group_playoff". */
    format: text("format").notNull().default("league"),

    /**
     * Czy turniej prowadzi klasyfikację strzelców.
     *
     * Cecha POJEDYNCZEGO turnieju, nie globalne ustawienie: Rabbit Cup
     * strzelców liczy, SUN CUP U8/U10 nie. Domyślne `true` sprawia, że
     * istniejące turnieje zachowują dotychczasowe zachowanie.
     *
     * Wyłączenie UKRYWA klasyfikację, ale NIE kasuje danych — powrót do
     * `true` przywraca wpisane wcześniej gole.
     */
    scorersEnabled: boolean("scorers_enabled").notNull().default(true),

    /**
     * OFICJALNA faza turnieju. Źródło prawdy jest w bazie, nie w UI.
     * Software nigdy nie przesuwa jej sam — wyłącznie jawna akcja admina.
     * Dla format="league" pozostaje na "group_stage" i nic nie znaczy.
     */
    phase: text("phase").notNull().default("group_stage"),

    /**
     * Licznik wersji PUBLICZNIE WIDOCZNEGO stanu turnieju.
     *
     * Rośnie o 1 przy każdej mutacji, którą zobaczy kibic. Publiczny
     * frontend porównuje go w lekkim odpytaniu i dopiero przy zmianie
     * pobiera pełny snapshot. Nie jest to znacznik czasu — monotoniczny
     * licznik jest odporny na rozjazd zegarów i cache.
     */
    publicRevision: integer("public_revision").notNull().default(0),

    /**
     * Znacznik OSTATNIEJ finalizacji turnieju.
     *
     * Służy jako stabilny token ceremonii podium: po cofnięciu fazy jest
     * czyszczony, a ponowne zakończenie ustawia nową wartość — dzięki temu
     * poprawiona klasyfikacja pokazuje reveal jeszcze raz. Celowo NIE jest
     * to public_revision, bo zmiana bannera nie powinna wznawiać ceremonii.
     */
    completedAt: timestamp("completed_at", { withTimezone: true }),

    /**
     * Czy TEN turniej jest pokazywany na publicznej stronie.
     *
     * To NIE jest "turniej otwarty w adminie" — admin może edytować dowolny
     * turniej, nie zmieniając tego, co widzą kibice. Maksymalnie jeden wiersz
     * w całej tabeli może mieć wartość true; pilnuje tego częściowy indeks
     * unikalny `tournaments_single_current_idx`, a nie warunek w UI.
     */
    isCurrent: boolean("is_current").notNull().default(false),

    /**
     * Znacznik archiwizacji. Archiwizacja niczego nie kasuje — turniej
     * pozostaje w bazie z kompletem drużyn, meczów, wyników i assetów.
     */
    archivedAt: timestamp("archived_at", { withTimezone: true }),

    /**
     * Konfiguracja fazy pucharowej — przechowywana, jeszcze nieużywana.
     * Dzięki temu za pół roku z samych danych wiadomo, jaki regulamin
     * obowiązywał w danym turnieju.
     */
    playoffConfig: jsonb("playoff_config"),
    /** Jak rozstrzyga się remis w play-off. Domyślnie rzuty karne. */
    playoffTieBreaker: text("playoff_tie_breaker")
      .notNull()
      .default("penalties"),

    campStartDate: text("camp_start_date"),
    campSignupLink: text("camp_signup_link"),
    tickerMessage: text("ticker_message"),
    showTopScorerTicker: boolean("show_top_scorer_ticker")
      .notNull()
      .default(true),

    /** Ślad po rekordzie Airtable — pozwala powtórzyć import idempotentnie. */
    legacyAirtableId: text("legacy_airtable_id"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("tournaments_slug_unique").on(table.slug),
    /**
     * Gwarancja bazodanowa: co najwyżej JEDEN turniej wyświetlany publicznie.
     * Częściowy indeks unikalny — wiersze z is_current=false nie są objęte.
     */
    uniqueIndex("tournaments_single_current_idx")
      .on(table.isCurrent)
      .where(sql`${table.isCurrent}`),
    index("tournaments_archived_at_idx").on(table.archivedAt),
    check(
      "tournaments_phase_check",
      sql`${table.phase} in ('group_stage', 'round_of_16', 'quarterfinal', 'semifinal', 'final', 'completed')`
    ),
    check(
      "tournaments_structure_check",
      sql`${table.structure} in ('single', 'groups')`
    ),
    check(
      "tournaments_format_check",
      sql`${table.format} in ('league', 'group_playoff')`
    ),
    check(
      "tournaments_playoff_tie_breaker_check",
      sql`${table.playoffTieBreaker} in ('penalties', 'overtime', 'none')`
    ),
  ]
);

/**
 * Assety turnieju (Cloudinary).
 *
 * Osobna tabela zamiast 24 kolumn. Pliki zostają w Cloudinary — w bazie
 * trzymamy wyłącznie URL i public_id.
 */
export const tournamentAssets = pgTable(
  "tournament_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),

    /**
     * schedule | regulation | hero_banner | camp_banner |
     * camp_poster_left | camp_poster_right |
     * playoff_bracket_background | podium_background
     *
     * Dwa ostatnie to dekoracyjne tła sekcji play-off — per turniej,
     * dzięki czemu każdy event może mieć własną oprawę wizualną.
     */
    kind: text("kind").notNull(),

    url: text("url").notNull(),
    mimeType: text("mime_type"),
    fileName: text("file_name"),
    /** Cloudinary public_id — dziś gubiony przy zapisie do Airtable. */
    publicId: text("public_id"),
  },
  (table) => [
    unique("tournament_assets_tournament_kind_unique").on(
      table.tournamentId,
      table.kind
    ),
    check(
      "tournament_assets_kind_check",
      sql`${table.kind} in ('schedule', 'regulation', 'hero_banner', 'camp_banner', 'camp_poster_left', 'camp_poster_right', 'playoff_bracket_background', 'podium_background')`
    ),
  ]
);

/* ==========================================================================
 * GRUPY I DRUŻYNY
 * ======================================================================== */

export const groups = pgTable(
  "groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),

    /** Klucz domenowy widoczny w UI: "A", "B". */
    key: text("key").notNull(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    unique("groups_tournament_key_unique").on(table.tournamentId, table.key),
  ]
);

export const teams = pgTable(
  "teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),

    /** Identyfikator domenowy (Team.id) — stabilny między storage'ami. */
    externalId: text("external_id").notNull(),

    name: text("name").notNull(),
    shortName: text("short_name"),

    logoUrl: text("logo_url"),
    logoName: text("logo_name"),
    logoType: text("logo_type"),
    /** Cloudinary public_id — w Airtable nigdy nie był zapisywany. */
    logoPublicId: text("logo_public_id"),

    /**
     * Wskazanie na wiersz biblioteki. NULL = drużyna korzysta jeszcze
     * z historycznego logo zapisanego bezpośrednio w kolumnach powyżej.
     * Kolumny logo_url/logo_public_id ZOSTAJĄ zsynchronizowane z assetem,
     * więc odczyt bez biblioteki nadal zwraca poprawny herb.
     */
    logoAssetId: uuid("logo_asset_id").references(() => teamLogoAssets.id, {
      onDelete: "set null",
    }),

    sourceOrder: integer("source_order").notNull().default(999),
  },
  (table) => [
    unique("teams_tournament_external_id_unique").on(
      table.tournamentId,
      table.externalId
    ),
    index("teams_group_idx").on(table.groupId),
  ]
);

/* ==========================================================================
 * DRABINKA (schema pod V2 — logika NIE zaimplementowana)
 * ======================================================================== */

export const brackets = pgTable(
  "brackets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    /** NULL = jedna drabinka na cały turniej. */
    groupId: uuid("group_id").references(() => groups.id, {
      onDelete: "cascade",
    }),
    size: integer("size").notNull(),
  },
  (table) => [
    check("brackets_size_check", sql`${table.size} in (2, 4, 8, 16)`),
  ]
);

export const bracketRounds = pgTable(
  "bracket_rounds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bracketId: uuid("bracket_id")
      .notNull()
      .references(() => brackets.id, { onDelete: "cascade" }),
    /** 0 = pierwsza rozgrywana runda, rośnie w stronę finału. */
    order: integer("order").notNull(),
    kind: text("kind").notNull(),
    label: text("label").notNull(),
    matchCount: integer("match_count").notNull(),
    /** pending | active | completed */
    status: text("status").notNull().default("pending"),
  },
  (table) => [
    unique("bracket_rounds_bracket_order_unique").on(
      table.bracketId,
      table.order
    ),
    check(
      "bracket_rounds_status_check",
      sql`${table.status} in ('pending', 'active', 'completed')`
    ),
    check(
      "bracket_rounds_kind_check",
      sql`${table.kind} in ('round_of_16', 'quarterfinal', 'semifinal', 'final', 'third_place')`
    ),
  ]
);

/* ==========================================================================
 * MECZE
 * ======================================================================== */

export const matches = pgTable(
  "matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    /** NULL dopuszczone pod przyszłe mecze międzygrupowe / finały turnieju. */
    groupId: uuid("group_id").references(() => groups.id, {
      onDelete: "cascade",
    }),

    /** Identyfikator domenowy (Match.id). */
    externalId: text("external_id").notNull(),

    /** group | bracket | placement_group. Domyślnie obecne zachowanie. */
    stage: text("stage").notNull().default("group"),
    /**
     * scheduled | live | finished | cancelled.
     * BRAK defaultu 'finished' — status musi być wskazany świadomie.
     * Import historyczny ustawia 'finished' jawnie, bo te mecze mają wynik.
     */
    status: text("status").notNull(),

    /** NULL = slot drabinki jeszcze nierozstrzygnięty. */
    homeTeamId: uuid("home_team_id").references(() => teams.id, {
      onDelete: "cascade",
    }),
    awayTeamId: uuid("away_team_id").references(() => teams.id, {
      onDelete: "cascade",
    }),

    /** NULL = mecz zaplanowany, jeszcze nierozegrany. */
    homeScore: integer("home_score"),
    awayScore: integer("away_score"),

    /** Zwycięzca po rzutach karnych — wyłącznie faza pucharowa. */
    shootoutWinnerTeamId: uuid("shootout_winner_team_id").references(
      () => teams.id,
      { onDelete: "set null" }
    ),

    bracketRoundId: uuid("bracket_round_id").references(() => bracketRounds.id, {
      onDelete: "cascade",
    }),
    slotIndex: integer("slot_index"),
    /** MatchSlotSource: { from: "seed" | "winner" | "loser", ... } */
    homeSource: jsonb("home_source"),
    awaySource: jsonb("away_source"),

    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    rink: smallint("rink"),

    /**
     * Kolejność prezentacji meczu w obrębie turnieju.
     *
     * Airtable zwraca mecze w kolejności tworzenia rekordów (NIE alfabetycznie
     * po matchId — zweryfikowane na danych produkcyjnych). Aby adapter
     * Postgresa zwracał identyczne tablice, kolejność musi być utrwalona,
     * a nie odtwarzana z sortowania.
     */
    sourceOrder: integer("source_order").notNull().default(0),
  },
  (table) => [
    /**
     * Tożsamość meczu to jego własne ID — NIE para drużyn.
     * Dzięki temu rewanże i powtórne spotkania tych samych zespołów
     * (np. grupa + play-off) są możliwe bez łamania ograniczeń.
     */
    unique("matches_tournament_external_id_unique").on(
      table.tournamentId,
      table.externalId
    ),
    /**
     * Jeden mecz na slot drabinki. NULL-e są w Postgresie różne, więc
     * to ograniczenie dotyczy wyłącznie meczów pucharowych.
     */
    unique("matches_bracket_slot_unique").on(
      table.bracketRoundId,
      table.slotIndex
    ),
    index("matches_tournament_stage_idx").on(table.tournamentId, table.stage),
    index("matches_group_idx").on(table.groupId),

    check(
      "matches_stage_check",
      sql`${table.stage} in ('group', 'bracket', 'placement_group')`
    ),
    check(
      "matches_status_check",
      sql`${table.status} in ('scheduled', 'live', 'finished', 'cancelled')`
    ),
    /** Wynik jest albo kompletny, albo go nie ma — nigdy połowiczny. */
    check(
      "matches_score_pair_check",
      sql`(${table.homeScore} is null) = (${table.awayScore} is null)`
    ),
    check(
      "matches_teams_distinct_check",
      sql`${table.homeTeamId} is null or ${table.awayTeamId} is null or ${table.homeTeamId} <> ${table.awayTeamId}`
    ),
    check("matches_rink_check", sql`${table.rink} is null or ${table.rink} > 0`),
  ]
);

/* ==========================================================================
 * STRZELCY
 * ======================================================================== */

export const scorers = pgTable(
  "scorers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),

    externalId: text("external_id").notNull(),
    playerName: text("player_name").notNull(),
    jerseyNumber: integer("jersey_number"),
    goals: integer("goals").notNull().default(0),
  },
  (table) => [
    unique("scorers_tournament_external_id_unique").on(
      table.tournamentId,
      table.externalId
    ),
    index("scorers_team_idx").on(table.teamId),
    check("scorers_goals_check", sql`${table.goals} >= 0`),
  ]
);

/* ==========================================================================
 * ZAMROŻONY RANKING (schema pod V2 — logika NIE zaimplementowana)
 * ======================================================================== */

export const standingsSnapshots = pgTable(
  "standings_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    frozenAt: timestamp("frozen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("standings_snapshots_group_unique").on(table.groupId),
  ]
);

export const standingsSnapshotRows = pgTable(
  "standings_snapshot_rows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    snapshotId: uuid("snapshot_id")
      .notNull()
      .references(() => standingsSnapshots.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),

    position: integer("position").notNull(),
    points: integer("points").notNull(),
    goalsFor: integer("goals_for").notNull(),
    goalsAgainst: integer("goals_against").notNull(),
    goalDifference: integer("goal_difference").notNull(),
    /** Pełne statystyki, żeby dało się odtworzyć tabelę historycznie. */
    played: integer("played").notNull().default(0),
    wins: integer("wins").notNull().default(0),
    draws: integer("draws").notNull().default(0),
    losses: integer("losses").notNull().default(0),
  },
  (table) => [
    unique("standings_snapshot_rows_position_unique").on(
      table.snapshotId,
      table.position
    ),
    unique("standings_snapshot_rows_team_unique").on(
      table.snapshotId,
      table.teamId
    ),
  ]
);

/* ==========================================================================
 * BIBLIOTEKA LOGOTYPÓW DRUŻYN
 *
 * GLOBALNA, nie per turniej. Ten sam herb obsługuje Rabbit Cup, SUN CUP U8
 * i każdy kolejny turniej — jeden plik w Cloudinary zamiast kopii na turniej.
 *
 * Tożsamością assetu jest wiersz w tej tabeli, a NIE nazwa drużyny ani URL.
 * Dzięki temu zmiana nazwy drużyny nigdy nie gubi ani nie duplikuje herbu.
 * ======================================================================== */

export const teamLogoAssets = pgTable(
  "team_logo_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** Nazwa dla człowieka, z polskimi znakami: "UKS Zagłębie Sosnowiec". */
    canonicalName: text("canonical_name").notNull(),
    /** Forma porównywalna — patrz lib/logos/normalize.ts. */
    normalizedName: text("normalized_name").notNull(),
    /** Stabilny identyfikator prezentacyjny; nigdy nie pokazujemy UUID-a. */
    slug: text("slug").notNull(),

    url: text("url").notNull(),
    cloudinaryPublicId: text("cloudinary_public_id"),

    /**
     * SHA-256 oryginalnego pliku. Pozwala rozpoznać, że wgrywany obraz już
     * jest w bibliotece, i nie tworzyć drugiej kopii w Cloudinary.
     * NULL dla assetów zaimportowanych z istniejących danych, których
     * zawartości nie liczyliśmy.
     */
    contentHash: text("content_hash"),

    width: integer("width"),
    height: integer("height"),
    format: text("format"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("team_logo_assets_slug_unique").on(table.slug),
    uniqueIndex("team_logo_assets_normalized_name_unique").on(
      table.normalizedName
    ),
    // Częściowy: wiele assetów bez policzonego hasha jest w porządku,
    // ale dwa o tej samej zawartości już nie.
    uniqueIndex("team_logo_assets_content_hash_unique")
      .on(table.contentHash)
      .where(sql`${table.contentHash} is not null`),
  ]
);

/**
 * Warianty nazw prowadzące do tego samego herbu:
 * "GKS Katowice 1", "GKS Katowice 2" → jeden asset "GKS Katowice".
 *
 * Alias powstaje wyłącznie po ŚWIADOMYM przypisaniu logo przez admina.
 */
export const teamLogoAliases = pgTable(
  "team_logo_aliases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    logoAssetId: uuid("logo_asset_id")
      .notNull()
      .references(() => teamLogoAssets.id, { onDelete: "cascade" }),

    alias: text("alias").notNull(),
    normalizedAlias: text("normalized_alias").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Jedna nazwa nie może prowadzić do dwóch różnych herbów.
    uniqueIndex("team_logo_aliases_normalized_unique").on(table.normalizedAlias),
    index("team_logo_aliases_asset_idx").on(table.logoAssetId),
  ]
);

export type TeamLogoAssetRow = typeof teamLogoAssets.$inferSelect;
export type TeamLogoAliasRow = typeof teamLogoAliases.$inferSelect;

export type TournamentRow = typeof tournaments.$inferSelect;
export type TournamentAssetRow = typeof tournamentAssets.$inferSelect;
export type GroupRow = typeof groups.$inferSelect;
export type TeamRow = typeof teams.$inferSelect;
export type MatchRow = typeof matches.$inferSelect;
export type BracketRow = typeof brackets.$inferSelect;
export type BracketRoundRow = typeof bracketRounds.$inferSelect;
export type StandingsSnapshotRow = typeof standingsSnapshots.$inferSelect;
export type StandingsSnapshotRowRow = typeof standingsSnapshotRows.$inferSelect;
export type ScorerRow = typeof scorers.$inferSelect;
