/**
 * Walidacja konfiguracji połączenia z bazą.
 *
 * Ten moduł trafia do bundla aplikacji, więc celowo NIE ma tu żadnych
 * zależności od node:fs — ładowanie plików .env żyje w lib/db/load-env.ts.
 */

export class MissingDatabaseUrlError extends Error {
  constructor() {
    super(
      "Brak DATABASE_URL. Ustaw connection string do Neon w .env (lokalnie) " +
        "oraz w zmiennych środowiskowych projektu na Vercelu."
    );
    this.name = "MissingDatabaseUrlError";
  }
}

export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;

  if (!url || !url.trim()) {
    throw new MissingDatabaseUrlError();
  }

  return url;
}
