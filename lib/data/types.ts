import type { Tournament } from "@/types/tournament";

/**
 * Wynik odczytu turnieju.
 *
 * Rozróżnienie "empty" vs "error" jest celowe i krytyczne:
 * awaria bazy nie może być nieodróżnialna od braku turnieju, bo publiczny
 * ekran pokazałby pusty turniej, a panel admina załadowałby pusty draft
 * (którego zapis skasowałby zawartość bazy).
 */
export type TournamentLoadResult =
  | { status: "ok"; tournament: Partial<Tournament> }
  | { status: "empty" }
  | { status: "error"; message: string };

/**
 * Pozycja na liście turniejów w panelu admina.
 *
 * `id` to STABILNE UUID — prawdziwa tożsamość turnieju. Slug i title są
 * wyłącznie prezentacyjne i mogą się zmieniać bez wpływu na relacje.
 */
export type TournamentSummary = {
  id: string;
  title: string;
  slug: string;
  /** Czy ten turniej jest pokazywany na publicznej stronie. */
  isCurrent: boolean;
  /** ISO 8601 albo null, gdy turniej nie jest zarchiwizowany. */
  archivedAt: string | null;
  createdAt: string;
};

/**
 * Jedyny kontrakt między aplikacją a warstwą storage.
 *
 * KLUCZOWA ZASADA: każda operacja zapisu dostaje jawny `tournamentId`.
 * Nie istnieje żadna ścieżka, w której storage sam "domyśla się", który
 * turniej modyfikować — to była przyczyna nadpisywania danych.
 *
 * Implementacje: postgresRepository (docelowa), airtableRepository (legacy).
 */
export interface TournamentRepository {
  /** Nazwa implementacji — wyłącznie do logowania i diagnostyki. */
  readonly name: string;

  /** Czy storage obsługuje wiele turniejów (Airtable: nie). */
  readonly supportsMultipleTournaments: boolean;

  /* --- odczyt publiczny -------------------------------------------------- */

  /** Turniej oznaczony jako wyświetlany publicznie. Nie rzuca. */
  getCurrentTournament(): Promise<TournamentLoadResult>;

  /* --- odczyt admina ----------------------------------------------------- */

  /** Lista turniejów do selektora. Najnowsze pierwsze. */
  listTournaments(): Promise<TournamentSummary[]>;

  /** Konkretny turniej po UUID — niezależnie od tego, który jest publiczny. */
  getTournamentById(id: string): Promise<TournamentLoadResult>;

  /* --- zapis (wymaga autoryzacji admina w warstwie akcji) ---------------- */

  /** Tworzy pusty turniej. NIE ustawia go jako publicznie wyświetlanego. */
  createTournament(title: string): Promise<{ id: string; slug: string }>;

  /** Zapisuje dane WSKAZANEGO turnieju. Nie dotyka pozostałych. */
  saveTournament(
    tournamentId: string,
    tournament: Tournament
  ): Promise<{ slug: string }>;

  /** Atomowo przełącza, który turniej jest wyświetlany publicznie. */
  setCurrentTournament(tournamentId: string): Promise<void>;

  /**
   * Archiwizuje lub przywraca turniej. Niczego nie kasuje.
   * Jedna metoda w obie strony, żeby archiwizacja nie była pułapką bez wyjścia.
   */
  setTournamentArchived(
    tournamentId: string,
    archived: boolean
  ): Promise<void>;
}

/** Rzucane, gdy operacja nie jest wspierana przez dany storage. */
export class UnsupportedOperationError extends Error {
  constructor(operation: string, repository: string) {
    super(
      `Operacja "${operation}" nie jest obsługiwana przez storage "${repository}".`
    );
    this.name = "UnsupportedOperationError";
  }
}

/** Rzucane, gdy reguła biznesowa blokuje operację (komunikat trafia do UI). */
export class TournamentOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TournamentOperationError";
  }
}
