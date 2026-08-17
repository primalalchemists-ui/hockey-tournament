import type { Tournament } from "@/types/tournament";

/**
 * Wynik odczytu turnieju.
 *
 * Rozróżnienie "empty" vs "error" jest celowe i krytyczne:
 * przed tą zmianą awaria Airtable była nieodróżnialna od braku turnieju,
 * przez co publiczny ekran pokazywał pusty turniej, a panel admina ładował
 * pusty draft (którego zapis skasowałby całą zawartość bazy).
 */
export type TournamentLoadResult =
  | { status: "ok"; tournament: Partial<Tournament> }
  | { status: "empty" }
  | { status: "error"; message: string };

/**
 * Jedyny kontrakt między aplikacją a warstwą storage.
 *
 * UI, domena i algorytm klasyfikacji nie wiedzą, jaka baza stoi pod spodem.
 * Implementacje: airtableRepo (dziś), postgresRepo (kolejny etap).
 */
export interface TournamentRepository {
  /** Nazwa implementacji — wyłącznie do logowania i diagnostyki. */
  readonly name: string;

  /** Zwraca aktywny turniej. Nie rzuca — sygnalizuje błąd przez status. */
  getActiveTournament(): Promise<TournamentLoadResult>;

  /** Zapisuje cały turniej. Rzuca wyjątek przy błędzie storage. */
  saveTournament(tournament: Tournament): Promise<{ slug: string }>;
}
