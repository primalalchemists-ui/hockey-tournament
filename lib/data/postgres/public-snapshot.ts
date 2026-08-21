import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { tournaments } from "@/lib/db/schema";
import { mergeTournamentData } from "@/lib/merge-data";
import { readTournamentSettings } from "@/types/tournament-config";
import type { Tournament } from "@/types/tournament";
import type { TournamentSettings } from "@/types/tournament-config";

import { calculatePlannedMatchCount } from "@/lib/playoff/planned-matches";
import { countPlayedMatches } from "@/lib/public/match-progress";
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
  /**
   * Ile meczów turniej ma ROZEGRAĆ według konfiguracji — łącznie z fazą
   * pucharową i minigrupą, które materializują się dopiero po zamknięciu
   * grup. Liczba jest stała przez cały turniej.
   */
  plannedMatchCount: number;
  /** Ile meczów ma już wynik — wszystkie etapy razem. */
  playedMatchCount: number;
};

export type PublicVersion = {
  tournamentId: string | null;
  revision: number;
};

/**
 * Lekkie odpytanie: wyłącznie identyfikator i wersja.
 *
 * Bez argumentu dotyczy turnieju wyświetlanego globalnie. Z argumentem —
 * konkretnej kategorii tego samego wydarzenia; dostęp jest wtedy sprawdzany
 * przez `isPubliclyReadable`, więc znajomość UUID nie wystarcza.
 */
export async function getPublicVersion(
  tournamentId?: string | null
): Promise<PublicVersion> {
  const rows = await getDb()
    .select({
      id: tournaments.id,
      revision: tournaments.publicRevision,
    })
    .from(tournaments)
    .where(
      tournamentId
        ? eq(tournaments.id, tournamentId)
        : eq(tournaments.isCurrent, true)
    )
    .limit(1);

  if (!rows[0]) {
    return { tournamentId: null, revision: 0 };
  }

  return { tournamentId: rows[0].id, revision: rows[0].revision };
}

async function buildSnapshotOnce(tournamentId?: string | null): Promise<{
  snapshot: PublicSnapshot | null;
  revisionAfter: number;
}> {
  const before = await getPublicVersion(tournamentId);

  if (!before.tournamentId) {
    return { snapshot: null, revisionAfter: 0 };
  }

  const result = tournamentId
    ? await postgresRepository.getTournamentById(tournamentId)
    : await postgresRepository.getCurrentTournament();

  if (result.status !== "ok") {
    throw new Error(
      result.status === "error" ? result.message : "Brak aktywnego turnieju."
    );
  }

  /*
    JEDNO ŹRÓDŁO PRAWDY O KONFIGURACJI.

    Tu mieszkał błąd: przepisywano trzy pola z osobna i `scorersEnabled`
    wypadało po drodze. `readTournamentSettings` domyśla brakującą flagę
    na `true`, więc snapshot publiczny ZAWSZE twierdził, że turniej prowadzi
    klasyfikację strzelców — nawet gdy admin ją wyłączył. Pierwszy render
    serwerowy był poprawny, a pierwsze auto-odświeżenie przywracało zakładkę.

    Ustawienia przechodzą teraz w całości. Dokładanie kolejnej flagi nie
    wymaga pamiętania o tym miejscu.
  */
  const settings = readTournamentSettings(result.settings);

  const playoffState =
    settings.format === "group_playoff"
      ? await getPlayoffState(before.tournamentId)
      : null;

  const tournament = mergeTournamentData(result.tournament);

  const plannedMatchCount = calculatePlannedMatchCount({
    format: settings.format,
    playoffConfig: settings.playoffConfig,
    scopes: tournament.groups.map((group) => ({
      teamCount: group.teams.length,
    })),
  });

  const playedMatchCount = countPlayedMatches({
    groups: tournament.groups,
    playoffState,
  });

  const after = await getPublicVersion(tournamentId);

  return {
    snapshot: {
      tournamentId: before.tournamentId,
      revision: before.revision,
      tournament,
      settings,
      playoffState,
      plannedMatchCount,
      playedMatchCount,
    },
    revisionAfter:
      after.tournamentId === before.tournamentId ? after.revision : -1,
  };
}

export async function getPublicSnapshot(
  tournamentId?: string | null
): Promise<PublicSnapshot | null> {
  const first = await buildSnapshotOnce(tournamentId);

  if (!first.snapshot) return null;
  if (first.revisionAfter === first.snapshot.revision) return first.snapshot;

  // Ktoś zapisał zmianę w trakcie budowania — powtarzamy raz.
  const second = await buildSnapshotOnce(tournamentId);
  return second.snapshot;
}
