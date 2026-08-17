import "server-only";

import { airtableRepository } from "./airtable/repository";
import { postgresRepository } from "./postgres/repository";
import type { TournamentRepository } from "./types";

export type {
  TournamentLoadResult,
  TournamentRepository,
} from "./types";

/**
 * Wybór implementacji storage.
 *
 *   DATA_SOURCE brak / "airtable"  -> Airtable (domyślne, produkcyjne)
 *   DATA_SOURCE = "postgres"       -> PostgreSQL na Neon
 *
 * Domyślna wartość celowo pozostaje Airtable: przełączenie produkcji jest
 * osobną, świadomą decyzją, a powrót to zmiana jednej zmiennej środowiskowej.
 */
export function getTournamentRepository(): TournamentRepository {
  const source = (process.env.DATA_SOURCE ?? "airtable").trim().toLowerCase();

  switch (source) {
    case "":
    case "airtable":
      return airtableRepository;

    case "postgres":
    case "postgresql":
      return postgresRepository;

    default:
      throw new Error(
        `Nieznana wartość DATA_SOURCE: "${source}". Dozwolone: "airtable", "postgres".`
      );
  }
}

/** Skrót używany przez strony i route handlery. */
export function loadActiveTournament() {
  return getTournamentRepository().getActiveTournament();
}
