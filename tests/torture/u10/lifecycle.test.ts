import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { postgresRepository } from "@/lib/data/postgres/repository";
import {
  completeGroupStage,
  getPlayoffState,
} from "@/lib/data/postgres/playoff-engine";
import { TournamentOperationError } from "@/lib/data/types";
import { calculateStandings } from "@/lib/standings";
import { plannedMatchesForScope } from "@/lib/playoff/planned-matches";
import type { Group, Tournament } from "@/types/tournament";

import {
  deleteOwnFixtures,
  readCurrentTournamentId,
  restoreCurrentTournament,
} from "../../helpers/current-tournament";
import { createU10Fixture } from "../helpers/lifecycle";
import { expectedPairCount, pairKeys, totalPlayed } from "../helpers/scenario";

/**
 * U10-J / U10-K / U10-L / U10-M — edycja, usuwanie, izolacja, liga.
 *
 * Warstwa INTEGRATION/DATABASE: prawdziwe repozytorium, jednorazowe
 * turnieje `Vitest ...` (slug `vitest-...`), sprzątane w `afterAll`.
 * Żaden test nie dotyka realnych turniejów.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);

/** Odczyt turnieju w postaci domenowej. */
async function readTournament(id: string): Promise<Tournament> {
  const loaded = await postgresRepository.getTournamentById(id);
  if (loaded.status !== "ok") throw new Error("Fixture zniknął.");

  // Repozytorium zwraca `Partial<Tournament>`; identyfikator znamy z wejścia.
  return { ...loaded.tournament, id } as Tournament;
}

/** Zapis z podmienionym wynikiem jednego meczu. */
async function patchMatch(
  id: string,
  groupKey: string,
  matchId: string,
  patch: { homeScore: number; awayScore: number } | null
): Promise<Tournament> {
  const tournament = await readTournament(id);

  // Helper musi krzyczeć, gdy nie trafi w mecz — cicha pomyłka w fixture
  // wyglądałaby jak błąd produkcyjny.
  const target = tournament.groups
    .find((group) => group.key === groupKey)
    ?.matches.find((entry) => entry.id === matchId);

  if (!target) {
    throw new Error(
      `Fixture nie zawiera meczu ${matchId} w grupie ${groupKey}.`
    );
  }

  const groups: Group[] = tournament.groups.map((group) => {
    if (group.key !== groupKey) return group;

    return {
      ...group,
      matches:
        patch === null
          ? group.matches.filter((entry) => entry.id !== matchId)
          : group.matches.map((entry) =>
              entry.id === matchId ? { ...entry, ...patch } : entry
            ),
    };
  });

  await postgresRepository.saveTournament(id, {
    ...tournament,
    id,
    groups,
  });

  /*
    CZEKAMY NA WIDOCZNOŚĆ ZAPISU.

    Baza jedzie po HTTP (`@neondatabase/serverless`) i każde zapytanie to
    osobne żądanie, więc pierwszy odczyt tuż po zapisie potrafi zwrócić
    jeszcze stary stan. To cecha transportu, nie błąd domeny — testowi
    wystarczy poczekać, aż zapis stanie się widoczny.
  */
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const fresh = await readTournament(id);
    const entry = fresh.groups
      .find((group) => group.key === groupKey)
      ?.matches.find((row) => row.id === matchId);

    const settled =
      patch === null
        ? entry === undefined
        : entry?.homeScore === patch.homeScore &&
          entry?.awayScore === patch.awayScore;

    /*
      Zwracamy TĘ migawkę, zamiast zachęcać test do kolejnego odczytu.
      Odczyty nie są monotoniczne: następne żądanie potrafi trafić na
      backend, który jeszcze nie widzi zapisu.
    */
    if (settled) return fresh;

    await new Promise((resolve) => setTimeout(resolve, 40));
  }

  throw new Error(`Zapis meczu ${matchId} nie stał się widoczny w bazie.`);
}

const groupOf = (tournament: Tournament, key: string) =>
  tournament.groups.find((group) => group.key === key)!;

describe.skipIf(!hasDatabase)("U10 — cykl życia ligi", () => {
  let originalCurrentId: string | null = null;
  let tournamentId = "";

  beforeAll(async () => {
    originalCurrentId = await readCurrentTournamentId();
    tournamentId = await createU10Fixture("Vitest Torture U10");
  });

  afterAll(async () => {
    try {
      await deleteOwnFixtures("vitest-", originalCurrentId);
    } finally {
      await restoreCurrentTournament(originalCurrentId);
    }
  });

  /* --- U10-J: edycja wyniku ------------------------------------------- */

  it("U10-J01 — wpisanie wyniku rusza dokładnie dwie drużyny", async () => {
    const tournament = await readTournament(tournamentId);
    const group = groupOf(tournament, "A");

    // Fixture ma komplet 45 meczów, każdy 1:0 dla niższego indeksu.
    expect(group.matches).toHaveLength(expectedPairCount(10));

    const rows = calculateStandings(group);
    expect(totalPlayed(rows)).toBe(90);
    expect(rows[0].points).toBe(27);
  });

  it("U10-J02 — zmiana wyniku bez zmiany zwycięzcy nie dubluje meczu", async () => {
    const target = "A-a1-a2";

    const snapshot = await patchMatch(tournamentId, "A", target, {
      homeScore: 5,
      awayScore: 0,
    });

    const group = groupOf(snapshot, "A");
    const rows = calculateStandings(group);
    const a1 = rows.find((row) => row.teamId === "a1")!;

    expect(group.matches).toHaveLength(expectedPairCount(10));
    expect(a1.played).toBe(9);
    expect(a1.goalsFor).toBe(9 + 4);
    expect(a1.points).toBe(27);
  });

  it("U10-J03 — zmiana zwycięzcy przenosi punkty", async () => {
    /*
      Fixture: a1 jest gospodarzem wszystkich swoich dziewięciu meczów
      i wygrywa je 1:0 (27 pkt). a2 przegrywa z a1, ale wygrywa pozostałe
      osiem (24 pkt).

      Po odwróceniu wyniku a1-a2 na 0:3 role się zamieniają:
      a1 ma 8 zwycięstw i porażkę (24 pkt), a a2 komplet dziewięciu (27 pkt).
    */
    const snapshot = await patchMatch(tournamentId, "A", "A-a1-a2", {
      homeScore: 0,
      awayScore: 3,
    });

    const group = groupOf(snapshot, "A");
    const rows = calculateStandings(group);

    expect(group.matches.find((entry) => entry.id === "A-a1-a2")).toMatchObject({
      homeTeamId: "a1",
      awayTeamId: "a2",
      homeScore: 0,
      awayScore: 3,
    });

    const a1 = rows.find((row) => row.teamId === "a1")!;
    const a2 = rows.find((row) => row.teamId === "a2")!;

    expect(a1.played).toBe(9);
    expect(a1.wins).toBe(8);
    expect(a1.losses).toBe(1);
    expect(a1.points).toBe(24);
    expect(a1.goalsFor).toBe(8);
    expect(a1.goalsAgainst).toBe(3);

    // a2 przejmuje komplet zwycięstw — punkty naprawdę zmieniły właściciela.
    expect(a2.played).toBe(9);
    expect(a2.wins).toBe(9);
    expect(a2.losses).toBe(0);
    expect(a2.points).toBe(27);
  });

  it("U10-J04 — zmiana lidera tabeli", async () => {
    const rows = calculateStandings(
      groupOf(await readTournament(tournamentId), "A")
    );

    // a2 ma komplet dziewięciu zwycięstw i przejmuje pierwsze miejsce.
    expect(rows[0].teamId).toBe("a2");
    expect(rows[0].points).toBe(27);
    expect(rows[1].teamId).toBe("a1");
    expect(rows[1].points).toBe(24);
  });

  it("U10-J05/J06 — przejście resolved → tie → resolved", async () => {
    const target = "A-a1-a2";

    const drawn = await patchMatch(tournamentId, "A", target, {
      homeScore: 1,
      awayScore: 1,
    });

    const tied = calculateStandings(groupOf(drawn, "A"));
    const a1 = tied.find((row) => row.teamId === "a1")!;

    expect(a1.points).toBe(25);
    expect(a1.draws).toBe(1);
    expect(a1.wins).toBe(8);

    // Powrót do rozstrzygnięcia przez wpisanie wyniku po karnych.
    const decided = await patchMatch(tournamentId, "A", target, {
      homeScore: 2,
      awayScore: 1,
    });

    const resolved = calculateStandings(groupOf(decided, "A"));
    const back = resolved.find((row) => row.teamId === "a1")!;

    expect(back.points).toBe(27);
    expect(back.draws).toBe(0);
    expect(back.isTieUnresolved).toBe(false);
  });

  it("U10-J07 — zapis bez zmian nie kasuje terminarza", async () => {
    const before = groupOf(await readTournament(tournamentId), "A");
    const loaded = await readTournament(tournamentId);

    await postgresRepository.saveTournament(tournamentId, {
      ...loaded,
      id: tournamentId,
    });

    const after = groupOf(await readTournament(tournamentId), "A");

    expect(after.matches).toHaveLength(before.matches.length);
    expect(calculateStandings(after).map((row) => row.teamId)).toEqual(
      calculateStandings(before).map((row) => row.teamId)
    );
  });

  /* --- U10-K: usunięcie wyniku ---------------------------------------- */

  it("U10-K01 — usunięcie wyniku cofa statystyki", async () => {
    const target = "A-a1-a2";
    const before = calculateStandings(
      groupOf(await readTournament(tournamentId), "A")
    );
    const a1Before = before.find((row) => row.teamId === "a1")!;

    const removed = await patchMatch(tournamentId, "A", target, null);
    const after = calculateStandings(groupOf(removed, "A"));
    const a1After = after.find((row) => row.teamId === "a1")!;

    expect(a1After.played).toBe(a1Before.played - 1);
    expect(a1After.points).toBe(a1Before.points - 3);
    expect(a1After.goalsFor).toBe(a1Before.goalsFor - 2);
  });

  it("U10-K02 — usunięcie z kompletnej grupy czyni ją niekompletną", async () => {
    const group = groupOf(await readTournament(tournamentId), "A");

    expect(group.matches.length).toBeLessThan(expectedPairCount(10));

    // Brak kompletu => brak komunikatu o karnych nawet przy remisie.
    const rows = calculateStandings(group);
    for (const row of rows.filter((entry) => entry.isTieUnresolved)) {
      expect(row.tieNote).toBeUndefined();
    }
  });

  it("U10-K03 — ranking przelicza się po usunięciu", async () => {
    const rows = calculateStandings(
      groupOf(await readTournament(tournamentId), "A")
    );

    expect(rows.map((row) => row.position)).toEqual(
      Array.from({ length: 10 }, (_, index) => index + 1)
    );
    expect(totalPlayed(rows)).toBe(88);
  });

  /* --- U10-L: izolacja grup ------------------------------------------- */

  it("U10-L01 — zmiany w grupie A nie ruszają grupy B", async () => {
    const before = calculateStandings(
      groupOf(await readTournament(tournamentId), "B")
    );

    const snapshot = await patchMatch(tournamentId, "A", "A-a3-a4", {
      homeScore: 7,
      awayScore: 0,
    });

    const after = calculateStandings(groupOf(snapshot, "B"));

    expect(after.map((row) => row.teamId)).toEqual(
      before.map((row) => row.teamId)
    );
    expect(after.map((row) => row.points)).toEqual(
      before.map((row) => row.points)
    );
    expect(after.map((row) => row.goalsFor)).toEqual(
      before.map((row) => row.goalsFor)
    );
  });

  it("U10-L02 — postęp liczony osobno dla każdej grupy", async () => {
    const tournament = await readTournament(tournamentId);

    const a = groupOf(tournament, "A").matches.length;
    const b = groupOf(tournament, "B").matches.length;

    expect(b).toBe(expectedPairCount(10));
    expect(a).toBeLessThan(b);
  });

  it("U10-L03 — żadna drużyna nie występuje w obu grupach", async () => {
    const tournament = await readTournament(tournamentId);

    const a = groupOf(tournament, "A").teams.map((entry) => entry.id);
    const b = groupOf(tournament, "B").teams.map((entry) => entry.id);

    expect(a).toHaveLength(10);
    expect(b).toHaveLength(10);
    expect(a.filter((id) => b.includes(id))).toEqual([]);
  });

  /* --- U10-M: invarianty ligi ----------------------------------------- */

  it("U10-M01 — zero stanu pucharowego", async () => {
    const state = await getPlayoffState(tournamentId);

    expect(state.format).toBe("league");
    expect(state.groupStageFrozen).toBe(false);

    for (const scope of state.scopes) {
      expect(scope.snapshot).toBeNull();
      expect(scope.placement).toBeNull();
      expect(scope.classification).toBeNull();
      expect(scope.rounds).toEqual([]);
    }
  });

  it("U10-M02 — silnik pucharowy odrzuca turniej ligowy", async () => {
    await expect(completeGroupStage(tournamentId)).rejects.toBeInstanceOf(
      TournamentOperationError
    );
  });

  it("U10-M03 — planowana liczba meczów bez dodatków pucharowych", () => {
    expect(
      plannedMatchesForScope({
        teamCount: 10,
        format: "league",
        playoffConfig: null,
      })
    ).toBe(45);
  });

  /* --- niezmienniki round-robin --------------------------------------- */

  it("INV-10/11/12 — pary round-robin są unikalne i bez samograjów", async () => {
    const group = groupOf(await readTournament(tournamentId), "B");
    const keys = pairKeys(group.matches);

    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toHaveLength(expectedPairCount(10));
    expect(
      group.matches.some((entry) => entry.homeTeamId === entry.awayTeamId)
    ).toBe(false);
  });
});
