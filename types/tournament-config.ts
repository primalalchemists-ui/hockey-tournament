/**
 * Konfiguracja turnieju — DWIE NIEZALEŻNE OSIE.
 *
 *   structure — jak zorganizowani są uczestnicy (jedna tabela vs grupy)
 *   format    — jak wyłaniany jest zwycięzca (round-robin vs round-robin + play-off)
 *
 * Obie są od siebie niezależne, co daje cztery poprawne kombinacje.
 * Ten moduł jest czysty (bez IO) i stanowi jedyne źródło prawdy o tym,
 * jakie wartości są dopuszczalne — używa go i baza, i UI, i testy.
 */

/** Struktura uczestników. */
export type TournamentStructure = "single" | "groups";

/** System rozgrywek. */
export type TournamentFormat = "league" | "group_playoff";

/** Dozwolone rozmiary drabinki. */
export type QualifiedTeamCount = 2 | 4 | 8 | 16;

/** Co dzieje się z drużynami, które nie awansowały do play-off. */
export type PlacementMode = "none" | "placement_group";

/**
 * Sposób rozstrzygania remisu w play-off.
 *
 * Reguła potwierdzona z produktem:
 *  - faza round-robin (grupa / jedna tabela): remis JEST dozwolony,
 *  - play-off oraz minigrupa klasyfikacyjna: remis NIE jest dozwolony,
 *    o zwycięstwie decydują rzuty karne, a do systemu trafia już wynik
 *    rozstrzygnięty (np. 1:1 po regulaminowym czasie zapisywane jako 2:1).
 *
 * Dziś jedyna dopuszczalna wartość. Typ jest unią, żeby przyszłe warianty
 * (dogrywka) nie wymagały migracji danych.
 */
export type PlayoffTieBreaker = "penalties";

export type PlayoffConfig = {
  /**
   * Ile drużyn awansuje do fazy pucharowej.
   *
   * structure = "single" -> tyle najlepszych z jednej wspólnej tabeli,
   * structure = "groups" -> tyle najlepszych Z KAŻDEJ GRUPY.
   */
  qualifiedTeamCount: QualifiedTeamCount;
  /** Czy rozgrywany jest mecz o 3. miejsce. */
  thirdPlaceMatch: boolean;
  /** Co robią drużyny poza play-off. */
  placementMode: PlacementMode;
  tieBreaker: PlayoffTieBreaker;
};

/** Pełna konfiguracja turnieju, niezależna od jego treści sportowej. */
export type TournamentSettings = {
  structure: TournamentStructure;
  format: TournamentFormat;
  /** Wypełnione wyłącznie dla format === "group_playoff". */
  playoffConfig: PlayoffConfig | null;
  /**
   * Czy turniej prowadzi klasyfikację strzelców.
   * Wyłączona ukrywa zakładkę u kibica i sekcję w panelu — dane zostają.
   */
  scorersEnabled: boolean;
};

/* ==========================================================================
 * WARTOŚCI DOPUSZCZALNE I DOMYŚLNE
 * ======================================================================== */

export const TOURNAMENT_STRUCTURES: readonly TournamentStructure[] = [
  "single",
  "groups",
];

export const TOURNAMENT_FORMATS: readonly TournamentFormat[] = [
  "league",
  "group_playoff",
];

export const QUALIFIED_TEAM_COUNTS: readonly QualifiedTeamCount[] = [
  2, 4, 8, 16,
];

export const PLACEMENT_MODES: readonly PlacementMode[] = [
  "none",
  "placement_group",
];

/**
 * Klucz technicznej puli używanej przy structure = "single".
 *
 * Istnieje wyłącznie po to, żeby calculateStandings i cała warstwa danych
 * mogły pracować na niezmienionym modelu Group. NIGDY nie pojawia się w UI.
 */
export const MAIN_POOL_KEY = "__main__";

/** Nazwa technicznej puli w bazie. Również nie jest pokazywana użytkownikowi. */
export const MAIN_POOL_NAME = "Klasyfikacja";

/** Domyślne ustawienia turnieju bez jawnej konfiguracji (np. z Airtable). */
export const DEFAULT_TOURNAMENT_SETTINGS: TournamentSettings = {
  structure: "groups",
  format: "league",
  playoffConfig: null,
  // Zgodnie z zachowaniem sprzed wprowadzenia tej opcji.
  scorersEnabled: true,
};

export const DEFAULT_PLAYOFF_CONFIG: PlayoffConfig = {
  qualifiedTeamCount: 4,
  thirdPlaceMatch: true,
  placementMode: "placement_group",
  tieBreaker: "penalties",
};

/* ==========================================================================
 * WALIDACJA
 * ======================================================================== */

export function isTournamentStructure(
  value: unknown
): value is TournamentStructure {
  return (
    typeof value === "string" &&
    (TOURNAMENT_STRUCTURES as readonly string[]).includes(value)
  );
}

export function isTournamentFormat(value: unknown): value is TournamentFormat {
  return (
    typeof value === "string" &&
    (TOURNAMENT_FORMATS as readonly string[]).includes(value)
  );
}

export function isQualifiedTeamCount(
  value: unknown
): value is QualifiedTeamCount {
  return (
    typeof value === "number" &&
    (QUALIFIED_TEAM_COUNTS as readonly number[]).includes(value)
  );
}

export function isPlacementMode(value: unknown): value is PlacementMode {
  return (
    typeof value === "string" &&
    (PLACEMENT_MODES as readonly string[]).includes(value)
  );
}

export class TournamentConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TournamentConfigError";
  }
}

/**
 * Parsuje konfigurację play-off z nieznanego źródła (jsonb w bazie,
 * FormData z panelu). Nie ufamy dowolnemu JSON-owi — każde pole jest
 * sprawdzane, a nieznane wartości powodują jawny błąd.
 */
export function parsePlayoffConfig(value: unknown): PlayoffConfig {
  if (!value || typeof value !== "object") {
    throw new TournamentConfigError(
      "Konfiguracja play-off musi być obiektem."
    );
  }

  const raw = value as Record<string, unknown>;

  if (!isQualifiedTeamCount(raw.qualifiedTeamCount)) {
    throw new TournamentConfigError(
      `Liczba drużyn w play-off musi być jedną z: ${QUALIFIED_TEAM_COUNTS.join(", ")}.`
    );
  }

  if (typeof raw.thirdPlaceMatch !== "boolean") {
    throw new TournamentConfigError(
      "Pole 'mecz o 3. miejsce' musi być wartością logiczną."
    );
  }

  if (!isPlacementMode(raw.placementMode)) {
    throw new TournamentConfigError(
      `Tryb pozostałych drużyn musi być jednym z: ${PLACEMENT_MODES.join(", ")}.`
    );
  }

  // tieBreaker jest dziś stały; brak wartości traktujemy jako "penalties",
  // ale wartość nieznaną odrzucamy zamiast po cichu nadpisywać.
  if (raw.tieBreaker !== undefined && raw.tieBreaker !== "penalties") {
    throw new TournamentConfigError(
      "Jedyny obsługiwany sposób rozstrzygania remisu w play-off to rzuty karne."
    );
  }

  // Mecz o 3. miejsce nie ma sensu przy drabince dwudrużynowej (sam finał).
  if (raw.thirdPlaceMatch && raw.qualifiedTeamCount < 4) {
    throw new TournamentConfigError(
      "Mecz o 3. miejsce wymaga co najmniej 4 drużyn w play-off."
    );
  }

  return {
    qualifiedTeamCount: raw.qualifiedTeamCount,
    thirdPlaceMatch: raw.thirdPlaceMatch,
    placementMode: raw.placementMode,
    tieBreaker: "penalties",
  };
}

/**
 * Składa i waliduje komplet ustawień turnieju.
 * Dla formatu ligowego konfiguracja play-off jest zerowana — nie chcemy
 * trzymać w bazie ustawień, które nie obowiązują.
 */
export function parseTournamentSettings(input: {
  structure: unknown;
  format: unknown;
  playoffConfig?: unknown;
  scorersEnabled?: unknown;
}): TournamentSettings {
  // Brak wartości = zachowanie historyczne, czyli klasyfikacja włączona.
  const scorersEnabled =
    input.scorersEnabled === undefined ? true : Boolean(input.scorersEnabled);

  if (!isTournamentStructure(input.structure)) {
    throw new TournamentConfigError(
      `Struktura turnieju musi być jedną z: ${TOURNAMENT_STRUCTURES.join(", ")}.`
    );
  }

  if (!isTournamentFormat(input.format)) {
    throw new TournamentConfigError(
      `System rozgrywek musi być jednym z: ${TOURNAMENT_FORMATS.join(", ")}.`
    );
  }

  if (input.format === "league") {
    return {
      structure: input.structure,
      format: "league",
      playoffConfig: null,
      scorersEnabled,
    };
  }

  return {
    structure: input.structure,
    format: "group_playoff",
    playoffConfig: parsePlayoffConfig(
      input.playoffConfig ?? DEFAULT_PLAYOFF_CONFIG
    ),
    scorersEnabled,
  };
}

/**
 * Odczyt ustawień z bazy. W przeciwieństwie do parseTournamentSettings
 * NIE rzuca — dane historyczne nie mogą wywrócić odczytu turnieju.
 */
export function readTournamentSettings(input: {
  structure: unknown;
  format: unknown;
  playoffConfig: unknown;
  scorersEnabled?: unknown;
}): TournamentSettings {
  // Historyczne wiersze bez kolumny = klasyfikacja włączona.
  const scorersEnabled =
    input.scorersEnabled === undefined || input.scorersEnabled === null
      ? true
      : Boolean(input.scorersEnabled);

  const structure = isTournamentStructure(input.structure)
    ? input.structure
    : DEFAULT_TOURNAMENT_SETTINGS.structure;

  const format = isTournamentFormat(input.format)
    ? input.format
    : DEFAULT_TOURNAMENT_SETTINGS.format;

  if (format === "league") {
    return { structure, format, playoffConfig: null, scorersEnabled };
  }

  try {
    return {
      structure,
      format,
      playoffConfig: parsePlayoffConfig(input.playoffConfig),
      scorersEnabled,
    };
  } catch {
    return {
      structure,
      format,
      playoffConfig: DEFAULT_PLAYOFF_CONFIG,
      scorersEnabled,
    };
  }
}

/* ==========================================================================
 * POMOCNICZE REGUŁY (używane przez UI, egzekwowane dopiero przy starcie play-off)
 * ======================================================================== */

/**
 * Ile drużyn musi mieć pula/grupa, żeby play-off dało się rozegrać.
 *
 * Na tym etapie służy wyłącznie do OSTRZEŻEŃ w panelu. Twarda blokada
 * pojawi się przy operacji "Zakończ fazę grupową" w kolejnym etapie.
 */
export function checkPlayoffFeasibility(input: {
  settings: TournamentSettings;
  /** Liczba drużyn w każdej grupie / puli. */
  teamCountsPerGroup: number[];
}): { ok: true } | { ok: false; reason: string } {
  const { settings, teamCountsPerGroup } = input;

  if (settings.format !== "group_playoff" || !settings.playoffConfig) {
    return { ok: true };
  }

  const required = settings.playoffConfig.qualifiedTeamCount;

  const tooSmall = teamCountsPerGroup.filter((count) => count < required);

  if (tooSmall.length > 0) {
    return {
      ok: false,
      reason:
        `Play-off wymaga minimum ${required} drużyn. ` +
        `Obecnie: ${tooSmall.join(", ")}.`,
    };
  }

  return { ok: true };
}
