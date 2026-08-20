import "server-only";

import { and, desc, eq, isNotNull } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { tournamentAssets, tournaments } from "@/lib/db/schema";

/**
 * PUBLICZNA HISTORIA TURNIEJÓW — lekki odczyt.
 *
 * Widoczność ma DOKŁADNIE jedno źródło prawdy: `archived_at IS NOT NULL`.
 * Kliknięcie „Archiwizuj" w panelu jest jawną decyzją organizatora, więc
 * nie dokładamy osobnej flagi publikacji. Zakończenie sportowe turnieju
 * i jego publikacja w historii to dwie różne rzeczy.
 *
 * Karuzela potrzebuje wyłącznie okładki i nazwy, więc to zapytanie NIE
 * dotyka drużyn, meczów, strzelców ani drabinek — jedno złączenie
 * z grafiką hero i tyle.
 */

export type ArchivedTournamentCard = {
  id: string;
  slug: string;
  title: string;
  /** Grafika hero danego turnieju; null = karta zapasowa. */
  heroBannerUrl: string | null;
  archivedAt: string;
};

export async function listArchivedTournamentsForPublic(): Promise<
  ArchivedTournamentCard[]
> {
  const rows = await getDb()
    .select({
      id: tournaments.id,
      slug: tournaments.slug,
      title: tournaments.title,
      archivedAt: tournaments.archivedAt,
      heroBannerUrl: tournamentAssets.url,
    })
    .from(tournaments)
    .leftJoin(
      tournamentAssets,
      and(
        eq(tournamentAssets.tournamentId, tournaments.id),
        eq(tournamentAssets.kind, "hero_banner")
      )
    )
    .where(isNotNull(tournaments.archivedAt))
    // Najnowsze archiwizacje na początku — bez budowania systemu dat.
    .orderBy(desc(tournaments.archivedAt));

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    heroBannerUrl: row.heroBannerUrl ?? null,
    archivedAt: row.archivedAt!.toISOString(),
  }));
}

/**
 * Turniej archiwalny po slugu — wyłącznie do publicznej strony wyników.
 *
 * Zwraca UUID albo null. Turniej NIEzarchiwizowany jest tu nie do
 * odróżnienia od nieistniejącego: strona historii ma go nie publikować.
 */
export async function findArchivedTournamentIdBySlug(
  slug: string
): Promise<string | null> {
  const rows = await getDb()
    .select({ id: tournaments.id })
    .from(tournaments)
    .where(and(eq(tournaments.slug, slug), isNotNull(tournaments.archivedAt)))
    .limit(1);

  return rows[0]?.id ?? null;
}
