import { and, eq, like, ne, sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { tournaments } from "@/lib/db/schema";

/**
 * IZOLACJA TURNIEJU WYŚWIETLANEGO PUBLICZNIE.
 *
 * Kilka zestawów testów ustawia własny turniej jako publiczny, a potem go
 * kasuje. Bez wspólnego mechanizmu wynik zależał od KOLEJNOŚCI PLIKÓW:
 * po całym `npm run test` stroną publiczną potrafił rządzić przypadek.
 *
 * Ten helper gwarantuje, że stan sprzed testów wraca zawsze — również gdy
 * test rzuci wyjątek — bo przywracanie żyje w `finally`.
 */

/** Zwraca UUID turnieju wyświetlanego publicznie (albo null). */
export async function readCurrentTournamentId(): Promise<string | null> {
  const rows = await getDb()
    .select({ id: tournaments.id })
    .from(tournaments)
    .where(eq(tournaments.isCurrent, true))
    .limit(1);

  return rows[0]?.id ?? null;
}

/**
 * Przywraca zapamiętany turniej jako publiczny.
 *
 * Zdejmuje flagę ze wszystkich pozostałych, więc stan końcowy jest
 * jednoznaczny niezależnie od tego, co działo się w trakcie testu.
 */
export async function restoreCurrentTournament(
  originalId: string | null
): Promise<void> {
  const db = getDb();

  if (!originalId) return;

  // Turniej mógł zostać skasowany w trakcie testu — wtedy nie ma czego
  // przywracać i lepiej to wiedzieć niż po cichu ustawić cokolwiek.
  const exists = await db
    .select({ id: tournaments.id })
    .from(tournaments)
    .where(eq(tournaments.id, originalId))
    .limit(1);

  if (exists.length === 0) {
    throw new Error(
      "Turniej wyświetlany publicznie zniknął w trakcie testu — nie ma czego przywrócić."
    );
  }

  await db
    .update(tournaments)
    .set({ isCurrent: false })
    .where(and(eq(tournaments.isCurrent, true), ne(tournaments.id, originalId)));

  await db
    .update(tournaments)
    .set({ isCurrent: true })
    .where(eq(tournaments.id, originalId));
}

/**
 * Uruchamia kod testu i ZAWSZE przywraca poprzedni turniej publiczny.
 *
 * Usuwanie własnych danych zostawiamy wywołującemu — helper nigdy nie
 * kasuje niczego samodzielnie, żeby nie ruszyć produkcyjnych turniejów.
 */
export async function withRestoredCurrentTournament<T>(
  run: (originalId: string | null) => Promise<T>
): Promise<T> {
  const originalId = await readCurrentTournamentId();

  try {
    return await run(originalId);
  } finally {
    await restoreCurrentTournament(originalId);
  }
}

/**
 * Kasuje WYŁĄCZNIE własne turnieje testowe (slug "vitest-…"), nigdy ten,
 * który jest wyświetlany publicznie.
 */
export async function deleteOwnFixtures(
  slugPrefix: string,
  protectedId: string | null
): Promise<void> {
  const db = getDb();

  await db
    .delete(tournaments)
    .where(
      protectedId
        ? and(
            like(tournaments.slug, `${slugPrefix}%`),
            sql`${tournaments.id} <> ${protectedId}`
          )
        : like(tournaments.slug, `${slugPrefix}%`)
    );
}
