import { eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type { Database } from "@/lib/db/client";
import { tournaments } from "@/lib/db/schema";

/**
 * WERSJONOWANIE PUBLICZNEGO STANU TURNIEJU.
 *
 * Jeden reusable helper zamiast rozsypanego SQL-a. Zwraca INSTRUKCJĘ,
 * a nie wykonuje zapytania — dzięki temu inkrement trafia do tej samej
 * transakcji (db.batch) co mutacja biznesowa. Nigdy nie może się zdarzyć,
 * że wynik jest zapisany, a wersja nie (albo odwrotnie).
 *
 * Licznik, nie timestamp: monotoniczny, odporny na rozjazd zegarów
 * i na cache pośredni.
 */
export function bumpPublicRevisionStatement(
  db: Database,
  tournamentId: string
): BatchItem<"pg"> {
  return db
    .update(tournaments)
    .set({
      publicRevision: sql`${tournaments.publicRevision} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(tournaments.id, tournamentId)) as BatchItem<"pg">;
}

/**
 * Wariant samodzielny — dla mutacji, które nie budują batcha.
 * Nadal atomowy na poziomie pojedynczego UPDATE-a.
 */
export async function bumpPublicRevision(
  db: Database,
  tournamentId: string
): Promise<void> {
  await db
    .update(tournaments)
    .set({
      publicRevision: sql`${tournaments.publicRevision} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(tournaments.id, tournamentId));
}
