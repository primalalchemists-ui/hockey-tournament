import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { matches, standingsSnapshots } from "@/lib/db/schema";
import { postgresRepository } from "@/lib/data/postgres/repository";
import {
  completeGroupStage,
  getPlayoffState,
  reopenPreviousPhase,
} from "@/lib/data/postgres/playoff-engine";
import { calculateStandings } from "@/lib/standings";
import type { Group, Tournament } from "@/types/tournament";

import {
  deleteOwnFixtures,
  readCurrentTournamentId,
  restoreCurrentTournament,
} from "../../helpers/current-tournament";
import { createU8Fixture, readPhase, scopeOf } from "../helpers/lifecycle";

/**
 * U8-EDT — korekta wyniku fazy grupowej po zamrożeniu.
 *
 * Scenariusz z hali: drabinka już gra, gdy okazuje się, że jeden wynik
 * grupowy był błędny. Matrix wymaga, żeby takiej zmiany nie dało się
 * przeprowadzić po cichu — bo snapshot i rozstawienie zostają stare,
 * a publiczna tabela zaczyna pokazywać co innego niż drabinka.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);

async function readTournament(id: string): Promise<Tournament> {
  const loaded = await postgresRepository.getTournamentById(id);
  if (loaded.status !== "ok") throw new Error("Fixture zniknął.");
  return { ...loaded.tournament, id } as Tournament;
}

/** Podmienia wynik meczu grupowego przez zwykły zapis z panelu. */
async function saveGroupResult(
  id: string,
  matchId: string,
  patch: { homeScore: number; awayScore: number }
) {
  const tournament = await readTournament(id);

  const groups: Group[] = tournament.groups.map((group) => ({
    ...group,
    matches: group.matches.map((entry) =>
      entry.id === matchId ? { ...entry, ...patch } : entry
    ),
  }));

  await postgresRepository.saveTournament(id, { ...tournament, id, groups });
}

describe.skipIf(!hasDatabase)("U8-EDT — korekta wyniku po zamrożeniu", () => {
  let originalCurrentId: string | null = null;
  let tournamentId = "";
  let seedsBefore: Array<Array<number | null | undefined>> = [];
  let snapshotBefore: string[] = [];

  beforeAll(async () => {
    originalCurrentId = await readCurrentTournamentId();
    tournamentId = await createU8Fixture("Vitest Torture Edit");

    await completeGroupStage(tournamentId);

    const state = await getPlayoffState(tournamentId);
    const scope = scopeOf(state, "A");

    snapshotBefore = scope.snapshot!.map((entry) => entry.teamId);
    seedsBefore = scope
      .rounds.find((round) => round.kind === "semifinal")!
      .matches.map((entry) => [entry.home?.seed, entry.away?.seed]);
  });

  afterAll(async () => {
    try {
      await deleteOwnFixtures("vitest-", originalCurrentId);
    } finally {
      await restoreCurrentTournament(originalCurrentId);
    }
  });

  it("U8-EDT01 — zmiana wyniku grupowego po zamrożeniu wymaga cofnięcia", async () => {
    expect(await readPhase(tournamentId)).toBe("semifinal");

    /*
      Odwracamy wynik na czele tabeli: a1 przegrywa z a2 0:5. To zmienia
      kolejność w grupie, a więc i rozstawienie.

      MATRIX U8-EDT01 — oczekiwanie: bez cofnięcia turnieju taka zmiana
      NIE może przejść po cichu.
    */
    let rejected = false;

    try {
      await saveGroupResult(tournamentId, "A-a1-a2", {
        homeScore: 0,
        awayScore: 5,
      });
    } catch {
      rejected = true;
    }

    expect(rejected).toBe(true);
  });

  it("U8-EDT01 — snapshot i rozstawienie nie mogą się rozjechać z tabelą", async () => {
    /*
      Drugi, niezależny sprawdzian tego samego wymagania. Nawet gdyby zapis
      przeszedł, publiczna tabela i oficjalne rozstawienie MUSZĄ nadal
      opowiadać tę samą historię.
    */
    const state = await getPlayoffState(tournamentId);
    const scope = scopeOf(state, "A");

    const tableOrder = scope.groupStandings.map((row) => row.teamId);
    const snapshotOrder = scope.snapshot!.map((entry) => entry.teamId);

    expect(snapshotOrder).toEqual(snapshotBefore);
    expect(tableOrder).toEqual(snapshotOrder);
  });

  it("U8-EDT02 — legalna procedura: cofnięcie, korekta, ponowne zamrożenie", async () => {
    await reopenPreviousPhase({ tournamentId, confirmDataLoss: true });
    expect(await readPhase(tournamentId)).toBe("group_stage");

    // Po cofnięciu snapshot znika, więc korekta jest w pełni legalna.
    expect(
      await getDb()
        .select()
        .from(standingsSnapshots)
        .where(eq(standingsSnapshots.tournamentId, tournamentId))
    ).toEqual([]);

    await saveGroupResult(tournamentId, "A-a1-a2", {
      homeScore: 0,
      awayScore: 5,
    });

    const group = (await readTournament(tournamentId)).groups.find(
      (entry) => entry.key === "A"
    )!;
    const rows = calculateStandings(group);

    // U8 to 7 drużyn, czyli 6 meczów i maksymalnie 18 punktów.
    expect(rows[0].teamId).toBe("a2");
    expect(rows[0].points).toBe(18);

    await completeGroupStage(tournamentId);
    expect(await readPhase(tournamentId)).toBe("semifinal");
  });

  it("U8-EDT02 — nowe rozstawienie odpowiada poprawionej tabeli", async () => {
    const state = await getPlayoffState(tournamentId);
    const scope = scopeOf(state, "A");

    const snapshotAfter = scope.snapshot!.map((entry) => entry.teamId);

    // Kolejność faktycznie się zmieniła — a2 wyszło na czoło.
    expect(snapshotAfter[0]).toBe("a2");
    expect(snapshotAfter).not.toEqual(snapshotBefore);

    const semis = scope.rounds.find((round) => round.kind === "semifinal")!;

    // Struktura rozstawienia bez zmian: nadal 1v4 i 2v3.
    expect(
      semis.matches.map((entry) => [entry.home?.seed, entry.away?.seed])
    ).toEqual(seedsBefore);

    // Ale uczestnikiem numer 1 jest teraz inna drużyna.
    expect(semis.matches[0].home?.teamId).toBe("a2");
  });

  it("U8-EDT03 — stare wyniki play-off nie przeżywają cofnięcia", async () => {
    const rows = await getDb()
      .select({ stage: matches.stage, home: matches.homeScore })
      .from(matches)
      .where(eq(matches.tournamentId, tournamentId));

    const bracket = rows.filter((row) => row.stage === "bracket");
    const placement = rows.filter((row) => row.stage === "placement_group");

    // Drabinka i minigrupa powstały na nowo — bez ani jednego wyniku.
    // Zapytanie obejmuje CAŁY turniej, więc minigrupy są dwie po 3 mecze.
    expect(bracket.length).toBeGreaterThan(0);
    expect(placement).toHaveLength(6);
    expect(bracket.every((row) => row.home === null)).toBe(true);
    expect(placement.every((row) => row.home === null)).toBe(true);
  });
});
