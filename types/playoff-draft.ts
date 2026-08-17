/**
 * ============================================================================
 * PROPOZYCJA MODELU DOMENY V2 — GENERYCZNY BRACKET ENGINE
 * ============================================================================
 *
 * STATUS: DRAFT DO ZATWIERDZENIA. Ten plik nie jest importowany przez żaden
 * moduł aplikacji i nie wpływa na działanie produkcji. Służy jako konkretna,
 * kompilowalna propozycja przed napisaniem schematu PostgreSQL.
 *
 * Zasady, które kształtują ten model:
 *
 *  1. ZERO HARDCODE'U "semifinal -> final". Przejścia między rundami są
 *     danymi (MatchSlotSource), nie gałęziami w kodzie.
 *  2. Wsteczna zgodność: turniej BEZ pola `format` to turniej ligowy.
 *     Istniejące dane nie wymagają migracji.
 *  3. calculateStandings pozostaje wspólnym, nietkniętym silnikiem —
 *     obsługuje fazę grupową i minigrupę przez filtr po `stage`.
 *  4. Uczestnik rozpoczętego meczu to ZAPISANY FAKT, nie funkcja
 *     aktualnego stanu tabeli (StandingsSnapshot).
 *  5. Bez overengineeringu: celem jest poprawne single-elimination
 *     dla 2 / 4 / 8 / 16 drużyn, opcjonalny mecz o 3. miejsce
 *     i opcjonalna grupa klasyfikacyjna.
 */

import type { GroupKey } from "./tournament";

/* -------------------------------------------------------------------------
 * 1. FORMAT TURNIEJU
 * ---------------------------------------------------------------------- */

/** Brak wartości (undefined) === "league". Stary turniej działa bez migracji. */
export type TournamentFormat = "league" | "group_playoff";

/** Dozwolone rozmiary drabinki — jedyne, które silnik ma obsługiwać. */
export type BracketSize = 2 | 4 | 8 | 16;

export type EliminatedTeamsMode =
  /** Drużyny poza play-off kończą turniej na pozycji z fazy grupowej. */
  | "none"
  /** Drużyny poza play-off grają dodatkową minigrupę każdy z każdym. */
  | "placement_group";

export type PlayoffConfig = {
  /** Liczba drużyn awansujących Z KAŻDEJ grupy. */
  qualifiedTeamCount: BracketSize;
  /** Czy rozgrywany jest mecz o 3. miejsce (wymaga rozmiaru >= 4). */
  thirdPlaceMatch: boolean;
  /** Co dzieje się z drużynami, które nie awansowały. */
  eliminatedTeamsMode: EliminatedTeamsMode;
  /**
   * Czy drabinki grup są niezależne (A i B osobno — obecny Rabbit Cup),
   * czy jedna wspólna drabinka dla całego turnieju.
   */
  bracketScope: "per_group" | "tournament";
};

/* -------------------------------------------------------------------------
 * 2. FAZA MECZU
 * ---------------------------------------------------------------------- */

export type MatchStage =
  /** Faza grupowa — dzisiejsze zachowanie, wartość domyślna. */
  | "group"
  /** Mecz drabinki pucharowej (dowolna runda). */
  | "bracket"
  /** Minigrupa klasyfikacyjna, np. miejsca 5-7. */
  | "placement_group";

export type MatchStatus = "scheduled" | "live" | "finished" | "cancelled";

/* -------------------------------------------------------------------------
 * 3. DRABINKA
 * ---------------------------------------------------------------------- */

export type BracketRoundKind =
  | "round_of_16"
  | "quarterfinal"
  | "semifinal"
  | "final"
  | "third_place";

export type Bracket = {
  id: string;
  tournamentId: string;
  /** null gdy bracketScope === "tournament". */
  groupKey: GroupKey | null;
  size: BracketSize;
  rounds: BracketRound[];
};

export type BracketRound = {
  id: string;
  bracketId: string;
  /** 0 = pierwsza rozgrywana runda. Rośnie w stronę finału. */
  order: number;
  kind: BracketRoundKind;
  /** Etykieta prezentacyjna, np. "Ćwierćfinały". */
  label: string;
  /** Liczba meczów w rundzie. Dla third_place zawsze 1. */
  matchCount: number;
};

/**
 * Skąd bierze się uczestnik danego slotu meczu.
 * To JEDYNY mechanizm przechodzenia drużyn między rundami — brak
 * jakiegokolwiek `if (round === "semifinal")` w kodzie silnika.
 */
export type MatchSlotSource =
  /** Rozstawienie z zamrożonego rankingu fazy grupowej (seed 1..n). */
  | { from: "seed"; groupKey: GroupKey; seed: number }
  /** Zwycięzca innego meczu. */
  | { from: "winner"; matchId: string }
  /** Przegrany innego meczu (mecz o 3. miejsce). */
  | { from: "loser"; matchId: string };

/* -------------------------------------------------------------------------
 * 4. MECZ
 * ---------------------------------------------------------------------- */

/**
 * Docelowy model meczu.
 *
 * Względem dzisiejszego typu Match zmienia się jedno zachowanie:
 * homeScore/awayScore mogą być null (mecz zaplanowany, jeszcze nierozegrany).
 * Wszystkie nowe pola są opcjonalne albo mają wartość domyślną, więc
 * dzisiejsze rekordy pozostają poprawne.
 */
export type PlayoffReadyMatch = {
  id: string;
  group: GroupKey;

  /** Domyślnie "group" — brak wartości w starych danych oznacza fazę grupową. */
  stage: MatchStage;

  /** Wypełnione wyłącznie dla stage === "bracket". */
  bracketRoundId?: string;
  /** Pozycja meczu w rundzie (0-indeksowana), decyduje o układzie drabinki. */
  slotIndex?: number;

  /** Uczestnicy — puści, dopóki źródło nie zostanie rozstrzygnięte. */
  homeTeamId: string | null;
  awayTeamId: string | null;

  /** Reguła wyznaczania uczestnika. Rozwiązywana raz i utrwalana. */
  homeSource?: MatchSlotSource;
  awaySource?: MatchSlotSource;

  /** null === mecz jeszcze nierozegrany. */
  homeScore: number | null;
  awayScore: number | null;

  /**
   * Zwycięzca po rzutach karnych. W fazie grupowej pozostaje pusty
   * (remis jest tam poprawnym wynikiem i daje po 1 punkcie).
   * W drabince mecz nie może zakończyć się remisem.
   */
  shootoutWinnerTeamId?: string | null;

  status: MatchStatus;
  /** ISO 8601. */
  scheduledAt?: string | null;
  /** Numer tafli 1-3. */
  rink?: number | null;
};

/* -------------------------------------------------------------------------
 * 5. ZAMROŻENIE RANKINGU
 * ---------------------------------------------------------------------- */

export type GroupStageStatus = "open" | "frozen";

/**
 * Zamrożony ranking fazy grupowej.
 *
 * Powód istnienia: korekta wyniku grupowego wpisana w trakcie play-offu
 * nie może po cichu podmienić uczestników już rozpoczętego półfinału.
 */
export type StandingsSnapshot = {
  id: string;
  tournamentId: string;
  groupKey: GroupKey;
  frozenAt: string;
  rows: StandingsSnapshotRow[];
};

export type StandingsSnapshotRow = {
  position: number;
  teamId: string;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
};

/* -------------------------------------------------------------------------
 * 6. ROZSZERZENIE TURNIEJU
 * ---------------------------------------------------------------------- */

export type PlayoffReadyTournamentFields = {
  /** undefined === "league" (wsteczna zgodność). */
  format?: TournamentFormat;
  /** Wypełnione wyłącznie dla format === "group_playoff". */
  playoffConfig?: PlayoffConfig;
  /** Per grupa: czy faza grupowa została zamknięta. */
  groupStageStatus?: Record<GroupKey, GroupStageStatus>;
};

/* -------------------------------------------------------------------------
 * 7. KONTRAKT SILNIKA (do implementacji w kolejnym etapie)
 * ---------------------------------------------------------------------- */

export type FreezeGroupStageError =
  | { code: "group_incomplete"; missingMatches: number }
  | { code: "unresolved_tie"; teamIds: string[] }
  | { code: "already_frozen" };

export interface BracketEngine {
  /**
   * Buduje strukturę rund dla zadanego rozmiaru drabinki.
   * 2 -> [final]; 4 -> [semifinal, final]; 8 -> [quarterfinal, semifinal, final]
   * 16 -> [round_of_16, quarterfinal, semifinal, final]
   * Mecz o 3. miejsce dokładany jako osobna runda, gdy thirdPlaceMatch === true.
   */
  buildRounds(size: BracketSize, thirdPlaceMatch: boolean): BracketRound[];

  /**
   * Standardowe rozstawienie pierwszej rundy: 1 vs n, 2 vs n-1, ...
   * ułożone tak, by rozstawieni 1 i 2 mogli spotkać się dopiero w finale.
   * Dla 4 drużyn daje dokładnie: 1 vs 4 oraz 2 vs 3.
   */
  buildFirstRoundPairs(size: BracketSize): Array<[number, number]>;

  /**
   * Waliduje i zamraża fazę grupową. Zwraca snapshot albo powód odmowy.
   * Odmawia m.in. gdy którakolwiek pozycja w strefie awansu ma
   * isTieUnresolved — inaczej drabinka powstałaby z losowej kolejności.
   */
  freezeGroupStage(input: {
    groupKey: GroupKey;
    standings: Array<{ position: number; teamId: string; isTieUnresolved?: boolean }>;
    expectedMatchCount: number;
    playedMatchCount: number;
  }): { ok: true; snapshot: StandingsSnapshot } | { ok: false; error: FreezeGroupStageError };

  /**
   * Rozwiązuje uczestników slotów, których źródła są już znane.
   * Wywoływane po każdym zakończonym meczu drabinki.
   * Czysta funkcja — zwraca zmiany do zapisania, nie zapisuje sama.
   */
  resolveSlots(matches: PlayoffReadyMatch[]): Array<{
    matchId: string;
    homeTeamId?: string;
    awayTeamId?: string;
  }>;
}
