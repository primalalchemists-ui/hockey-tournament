import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { tournaments } from "@/lib/db/schema";
import { mergeTournamentData } from "@/lib/merge-data";
import { readTournamentSettings } from "@/types/tournament-config";
import type { Tournament } from "@/types/tournament";
import type { TournamentSettings } from "@/types/tournament-config";

import { getPlayoffState, type PlayoffStateView } from "./playoff-engine";
import { postgresRepository } from "./repository";

/**
 * SPÓJNY PUBLICZNY SNAPSHOT.
 *
 * Jedno wywołanie zwraca wszystko, co widzi kibic: turniej, konfigurację,
 * stan fazy pucharowej i wersję. Dzięki temu frontend nigdy nie skleja
 * rankingu ze starej wersji z drabinką z nowej.
 *
 * Spójność: wersję odczytujemy PRZED i PO zbudowaniu danych. Jeśli w tym
 * czasie ktoś zapisał wynik, powtarzamy odczyt raz — koszt jest znikomy,
 * a wynik gwarantowanie pochodzi z jednego stanu.
 */

export type PublicSnapshot = {
  tournamentId: string;
  revision: number;
  tournament: Tournament;
  settings: TournamentSettings;
  playoffState: PlayoffStateView | null;
};

export type PublicVersion = {
  tournamentId: string | null;
  revision: number;
};

/** Lekkie odpytanie: wyłącznie identyfikator i wersja. */
export async function getPublicVersion(): Promise<PublicVersion> {
  const rows = await getDb()
    .select({
      id: tournaments.id,
      revision: tournaments.publicRevision,
    })
    .from(tournaments)
    .where(eq(tournaments.isCurrent, true))
    .limit(1);

  if (!rows[0]) {
    return { tournamentId: null, revision: 0 };
  }

  return { tournamentId: rows[0].id, revision: rows[0].revision };
}

async function buildSnapshotOnce(): Promise<{
  snapshot: PublicSnapshot | null;
  revisionAfter: number;
}> {
  const before = await getPublicVersion();

  if (!before.tournamentId) {
    return { snapshot: null, revisionAfter: 0 };
  }

  const result = await postgresRepository.getCurrentTournament();

  if (result.status !== "ok") {
    throw new Error(
      result.status === "error" ? result.message : "Brak aktywnego turnieju."
    );
  }

  const settings = readTournamentSettings({
    structure: result.settings.structure,
    format: result.settings.format,
    playoffConfig: result.settings.playoffConfig,
  });

  const playoffState =
    settings.format === "group_playoff"
      ? await getPlayoffState(before.tournamentId)
      : null;

  const after = await getPublicVersion();

  return {
    snapshot: {
      tournamentId: before.tournamentId,
      revision: before.revision,
      tournament: mergeTournamentData(result.tournament),
      settings,
      playoffState,
    },
    revisionAfter:
      after.tournamentId === before.tournamentId ? after.revision : -1,
  };
}

export async function getPublicSnapshot(): Promise<PublicSnapshot | null> {
  const first = await buildSnapshotOnce();

  if (!first.snapshot) return null;
  if (first.revisionAfter === first.snapshot.revision) return first.snapshot;

  // Ktoś zapisał zmianę w trakcie budowania — powtarzamy raz.
  const second = await buildSnapshotOnce();
  return second.snapshot;
}
