import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { tournaments } from "@/lib/db/schema";
import { postgresRepository } from "@/lib/data/postgres/repository";
import type { TournamentLoadResult } from "@/lib/data/types";

/**
 * DOSTĘP DO RABBIT CUPA PO SLUGU, NIE PO „turnieju publicznym".
 *
 * Testy integralności sprawdzają KONKRETNY turniej, więc muszą go
 * adresować wprost. Wiązanie ich z `getCurrentTournament()` sprawiało, że
 * przełączenie strony publicznej w panelu — całkowicie legalna operacja
 * administratora — wywracało kilkanaście testów naraz.
 */

export const RABBIT_CUP_SLUG = "rabbit-cup";

export async function getRabbitCupId(): Promise<string> {
  const rows = await getDb()
    .select({ id: tournaments.id })
    .from(tournaments)
    .where(eq(tournaments.slug, RABBIT_CUP_SLUG))
    .limit(1);

  if (!rows[0]) {
    throw new Error("Rabbit Cup nie istnieje w bazie.");
  }

  return rows[0].id;
}

/** Odczyt Rabbit Cupa niezależny od tego, co jest akurat publiczne. */
export async function loadRabbitCup(): Promise<TournamentLoadResult> {
  return postgresRepository.getTournamentById(await getRabbitCupId());
}
