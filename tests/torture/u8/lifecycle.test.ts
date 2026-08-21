import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { standingsSnapshotRows, standingsSnapshots } from "@/lib/db/schema";
import {
  completeCurrentRound,
  completeGroupStage,
  completeTournament,
  describeReopen,
  getPlayoffState,
  reopenPreviousPhase,
  savePlayoffMatchResult,
} from "@/lib/data/postgres/playoff-engine";
import { TournamentOperationError } from "@/lib/data/types";

import {
  deleteOwnFixtures,
  readCurrentTournamentId,
  restoreCurrentTournament,
} from "../../helpers/current-tournament";
import {
  createU8Fixture,
  decideStage,
  readCompletedAt,
  readPhase,
  scopeOf,
} from "../helpers/lifecycle";

/**
 * U8 — pełny cykl życia na prawdziwej bazie.
 *
 * Jeden jednorazowy turniej `Vitest ...` przechodzi całą drogę:
 * faza grupowa → zamrożenie → półfinały → finały → zakończenie → cofnięcie
 * → ponowne zamrożenie → ponowne zakończenie.
 *
 * Kolejność testów jest CZĘŚCIĄ scenariusza — kolejne kroki budują na
 * stanie pozostawionym przez poprzednie.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabase)("U8 — cykl życia", () => {
  let originalCurrentId: string | null = null;
  let tournamentId = "";

  beforeAll(async () => {
    originalCurrentId = await readCurrentTournamentId();
    tournamentId = await createU8Fixture("Vitest Torture U8");
  });

  afterAll(async () => {
    try {
      await deleteOwnFixtures("vitest-", originalCurrentId);
    } finally {
      await restoreCurrentTournament(originalCurrentId);
    }
  });

  /* --- U8-FRZ ---------------------------------------------------------- */

  it("U8-FRZ10 — zamrożenie poza fazą grupową jest odrzucane później", async () => {
    expect(await readPhase(tournamentId)).toBe("group_stage");
  });

  it("U8-FRZ04 — komplet 21/21 pozwala zamrozić fazę grupową", async () => {
    await completeGroupStage(tournamentId);

    expect(await readPhase(tournamentId)).toBe("semifinal");

    const state = await getPlayoffState(tournamentId);
    expect(state.groupStageFrozen).toBe(true);
  });

  it("U8-FRZ09 — ponowne zamrożenie jest odrzucane", async () => {
    await expect(completeGroupStage(tournamentId)).rejects.toBeInstanceOf(
      TournamentOperationError
    );
  });

  /* --- U8-SNP ---------------------------------------------------------- */

  it("U8-SNP01/02 — snapshot ma 7 wierszy na grupę i komplet kolumn", async () => {
    const db = getDb();
    const snaps = await db
      .select()
      .from(standingsSnapshots)
      .where(eq(standingsSnapshots.tournamentId, tournamentId));

    expect(snaps).toHaveLength(2);

    for (const snap of snaps) {
      const rows = await db
        .select()
        .from(standingsSnapshotRows)
        .where(eq(standingsSnapshotRows.snapshotId, snap.id));

      expect(rows).toHaveLength(7);
      expect([...rows].map((row) => row.position).sort((a, b) => a - b)).toEqual([
        1, 2, 3, 4, 5, 6, 7,
      ]);

      for (const row of rows) {
        expect(row.goalDifference).toBe(row.goalsFor - row.goalsAgainst);
        expect(row.played).toBe(row.wins + row.draws + row.losses);
        expect(row.points).toBe(3 * row.wins + row.draws);
      }
    }
  });

  it("U8-SEED01/02 — rozstawienie 1v4, 2v3 oraz minigrupa 5-7", async () => {
    const state = await getPlayoffState(tournamentId);

    for (const scope of state.scopes) {
      const semis = scope.rounds.find((round) => round.kind === "semifinal")!;
      const seeds = semis.matches.map((entry) => [
        entry.home?.seed,
        entry.away?.seed,
      ]);

      expect(seeds).toEqual([
        [1, 4],
        [2, 3],
      ]);

      const placementSeeds = scope.placement!.matches
        .flatMap((entry) => [entry.home?.seed, entry.away?.seed])
        .filter((seed): seed is number => typeof seed === "number");

      expect([...new Set(placementSeeds)].sort()).toEqual([5, 6, 7]);
      expect(scope.placement!.positionFrom).toBe(5);
      expect(scope.placement!.positionTo).toBe(7);
    }
  });

  it("U8-ISO02 — każda grupa ma własny snapshot i własną drabinkę", async () => {
    const state = await getPlayoffState(tournamentId);
    const [a, b] = state.scopes;

    const aTeams = a.snapshot!.map((entry) => entry.teamId);
    const bTeams = b.snapshot!.map((entry) => entry.teamId);

    expect(aTeams).toHaveLength(7);
    expect(bTeams).toHaveLength(7);
    expect(aTeams.filter((id) => bTeams.includes(id))).toEqual([]);
  });

  /* --- U8-GATE --------------------------------------------------------- */

  it("U8-GATE01 — wynik finału w trakcie półfinałów jest odrzucany", async () => {
    const state = await getPlayoffState(tournamentId);
    const scope = scopeOf(state, "A");
    const final = scope.rounds.find((round) => round.kind === "final")!;

    await expect(
      savePlayoffMatchResult({
        tournamentId,
        matchExternalId: final.matches[0].externalId,
        homeScore: 3,
        awayScore: 1,
      })
    ).rejects.toBeInstanceOf(TournamentOperationError);
  });

  it("U8-SF09 — remis w półfinale jest odrzucany", async () => {
    const state = await getPlayoffState(tournamentId);
    const scope = scopeOf(state, "A");
    const semi = scope.rounds.find((round) => round.kind === "semifinal")!;

    await expect(
      savePlayoffMatchResult({
        tournamentId,
        matchExternalId: semi.matches[0].externalId,
        homeScore: 2,
        awayScore: 2,
      })
    ).rejects.toBeInstanceOf(TournamentOperationError);
  });

  it("U8-GATE07 — zamknięcie rundy bez wyników jest odrzucane", async () => {
    await expect(completeCurrentRound(tournamentId)).rejects.toBeInstanceOf(
      TournamentOperationError
    );
  });

  /* --- U8-SF / U8-GATE10 ----------------------------------------------- */

  it("U8-SF01..04 — zwycięzcy półfinałów trafiają do finału", async () => {
    await decideStage(tournamentId, (m) => m.kind === "semifinal");
    await completeCurrentRound(tournamentId);

    expect(await readPhase(tournamentId)).toBe("final");

    const state = await getPlayoffState(tournamentId);

    for (const scope of state.scopes) {
      const semis = scope.rounds.find((round) => round.kind === "semifinal")!;
      const final = scope.rounds.find((round) => round.kind === "final")!;
      const third = scope.rounds.find((round) => round.kind === "third_place")!;

      const winners = semis.matches.map((entry) => entry.winnerTeamId);
      const finalists = [
        final.matches[0].home?.teamId,
        final.matches[0].away?.teamId,
      ];

      expect(finalists.filter(Boolean)).toHaveLength(2);
      for (const winner of winners) expect(finalists).toContain(winner);

      const thirdPair = [
        third.matches[0].home?.teamId,
        third.matches[0].away?.teamId,
      ];

      // Przegrani półfinałów — rozłączni z finalistami.
      expect(thirdPair.filter((id) => finalists.includes(id))).toEqual([]);
    }
  });

  it("U8-GATE02 — półfinał po przejściu do finałów jest zamknięty", async () => {
    const state = await getPlayoffState(tournamentId);
    const scope = scopeOf(state, "A");
    const semi = scope.rounds.find((round) => round.kind === "semifinal")!;

    await expect(
      savePlayoffMatchResult({
        tournamentId,
        matchExternalId: semi.matches[0].externalId,
        homeScore: 5,
        awayScore: 0,
      })
    ).rejects.toBeInstanceOf(TournamentOperationError);
  });

  it("U8-GATE11 — finały kończy osobna operacja", async () => {
    await expect(completeCurrentRound(tournamentId)).rejects.toBeInstanceOf(
      TournamentOperationError
    );
  });

  /* --- U8-CPL ---------------------------------------------------------- */

  it("U8-CPL01..03 — brak wyników blokuje zakończenie", async () => {
    await expect(completeTournament(tournamentId)).rejects.toBeInstanceOf(
      TournamentOperationError
    );
  });

  it("U8-CPL03 — minigrupa blokuje zakończenie, choć nie blokowała rundy", async () => {
    await decideStage(
      tournamentId,
      (m) => m.kind === "final" || m.kind === "third_place"
    );

    // Finały gotowe, minigrupa nie — turniej nadal nie może się zakończyć.
    await expect(completeTournament(tournamentId)).rejects.toBeInstanceOf(
      TournamentOperationError
    );
  });

  it("U8-CPL07 — komplet kończy turniej i ustawia token ceremonii", async () => {
    await decideStage(tournamentId, (m) => m.kind === "placement_group");
    await completeTournament(tournamentId);

    expect(await readPhase(tournamentId)).toBe("completed");
    expect(await readCompletedAt(tournamentId)).toBeInstanceOf(Date);
  });

  it("U8-CPL06 — ponowne zakończenie jest odrzucane", async () => {
    await expect(completeTournament(tournamentId)).rejects.toBeInstanceOf(
      TournamentOperationError
    );
  });

  /* --- U8-CLS / U8-CONS na prawdziwych danych -------------------------- */

  it("U8-CLS05 — klasyfikacja 1-7 bez dziur w obu grupach", async () => {
    const state = await getPlayoffState(tournamentId);

    for (const scope of state.scopes) {
      const positions = scope.classification!.entries.map(
        (entry) => entry.position
      );

      expect(positions).toEqual([1, 2, 3, 4, 5, 6, 7]);
      expect(scope.classification!.complete).toBe(true);
      expect(
        new Set(scope.classification!.entries.map((entry) => entry.team.teamId))
          .size
      ).toBe(7);
    }
  });

  it("U8-CONS01/03 — Ranking pokrywa się z klasyfikacją", async () => {
    const state = await getPlayoffState(tournamentId);

    for (const scope of state.scopes) {
      const classification = scope.classification!.entries.map(
        (entry) => entry.team.teamId
      );
      const ranking = scope.ranking.map((row) => row.teamId);

      expect(ranking).toEqual(classification);
      expect(scope.ranking.every((row) => !row.isTieUnresolved)).toBe(true);

      const mini = scope.placement!.standings.map(
        (row) => scope.placement!.positionFrom + row.position - 1
      );
      expect(mini).toEqual([5, 6, 7]);
    }
  });

  it("U8-AGG01/05 — statystyki sumują wszystkie etapy i się zgadzają", async () => {
    const state = await getPlayoffState(tournamentId);
    const scope = scopeOf(state, "A");

    for (const row of scope.ranking) {
      expect(row.played).toBe(row.wins + row.draws + row.losses);
      expect(row.goalDifference).toBe(row.goalsFor - row.goalsAgainst);
      expect(row.points).toBe(3 * row.wins + row.draws);
    }

    // Mistrz rozegrał 6 grupowych + półfinał + finał.
    expect(scope.ranking[0].played).toBe(8);
  });

  /* --- U8-RWD ---------------------------------------------------------- */

  it("U8-RWD01/03 — cofnięcie z zakończonego wraca do finałów", async () => {
    const impact = await describeReopen(tournamentId);

    expect(impact.targetPhase).toBe("final");
    expect(impact.removesBracket).toBe(false);

    await reopenPreviousPhase({ tournamentId, confirmDataLoss: true });

    expect(await readPhase(tournamentId)).toBe("final");
    expect(await readCompletedAt(tournamentId)).toBeNull();
  });

  it("U8-RWD08 — dane zostają kompletne, ale turniej nie jest zakończony", async () => {
    /*
      MATRIX POPRAWIONY: to są DWIE różne rzeczy.

      Cofnięcie z `completed` do `final` nie kasuje żadnych wyników, więc
      klasyfikacja nadal jest matematycznie kompletna. Zmienia się wyłącznie
      STAN ZAKOŃCZENIA: znika `completedAt`, a wraz z nim token ceremonii.
    */
    const state = await getPlayoffState(tournamentId);

    // STAN ZAKOŃCZENIA — turniej nie jest już oficjalnie zakończony.
    expect(state.phase).toBe("final");
    expect(state.completionToken).toBeNull();
    expect(await readCompletedAt(tournamentId)).toBeNull();

    // KOMPLETNOŚĆ DANYCH — wszystkie wymagane wyniki nadal istnieją.
    for (const scope of state.scopes) {
      expect(scope.classification!.complete).toBe(true);
      expect(scope.classification!.missing).toEqual([]);
      expect(
        scope.classification!.entries.map((entry) => entry.position)
      ).toEqual([1, 2, 3, 4, 5, 6, 7]);
    }
  });

  it("U8-RWD04 — cofnięcie z finałów czyści wyniki finałowe", async () => {
    await reopenPreviousPhase({ tournamentId, confirmDataLoss: true });

    expect(await readPhase(tournamentId)).toBe("semifinal");

    const state = await getPlayoffState(tournamentId);
    const scope = scopeOf(state, "A");
    const final = scope.rounds.find((round) => round.kind === "final")!;

    expect(final.matches[0].homeScore).toBeNull();
    expect(final.matches[0].awayScore).toBeNull();
    // Uczestnik wyprowadzony z półfinału znika razem z wynikiem.
    expect(final.matches[0].home).toBeNull();
  });

  it("U8-RWD05 — cofnięcie do fazy grupowej usuwa drabinkę i snapshot", async () => {
    await reopenPreviousPhase({ tournamentId, confirmDataLoss: true });

    expect(await readPhase(tournamentId)).toBe("group_stage");

    const snaps = await getDb()
      .select()
      .from(standingsSnapshots)
      .where(eq(standingsSnapshots.tournamentId, tournamentId));

    expect(snaps).toEqual([]);

    const state = await getPlayoffState(tournamentId);
    expect(state.groupStageFrozen).toBe(false);

    for (const scope of state.scopes) {
      expect(scope.placement).toBeNull();
      expect(scope.snapshot).toBeNull();
    }
  });

  it("U8-RWD05 — wyniki fazy grupowej przeżywają cofnięcie", async () => {
    const state = await getPlayoffState(tournamentId);
    const scope = scopeOf(state, "A");

    expect(scope.groupStandings).toHaveLength(7);
    expect(scope.groupStandings[0].played).toBe(6);
    expect(scope.groupStandings[0].points).toBe(18);
  });

  /* --- U8-RFZ ---------------------------------------------------------- */

  it("U8-RFZ01..03 — ponowne zamrożenie tworzy nowy snapshot", async () => {
    await completeGroupStage(tournamentId);

    const snaps = await getDb()
      .select()
      .from(standingsSnapshots)
      .where(eq(standingsSnapshots.tournamentId, tournamentId));

    // Dokładnie jeden snapshot na grupę — zero pozostałości po poprzednim.
    expect(snaps).toHaveLength(2);

    const state = await getPlayoffState(tournamentId);
    for (const scope of state.scopes) {
      expect(scope.snapshot).toHaveLength(7);

      const semis = scope.rounds.find((round) => round.kind === "semifinal")!;
      expect(
        semis.matches.map((entry) => [entry.home?.seed, entry.away?.seed])
      ).toEqual([
        [1, 4],
        [2, 3],
      ]);
    }
  });

  /* --- U8-RCP ---------------------------------------------------------- */

  it("U8-RCP01..03 — ponowne zakończenie daje nowy token ceremonii", async () => {
    await decideStage(tournamentId, (m) => m.kind === "semifinal");
    await completeCurrentRound(tournamentId);
    await decideStage(
      tournamentId,
      (m) => m.kind === "final" || m.kind === "third_place"
    );
    await decideStage(tournamentId, (m) => m.kind === "placement_group");
    await completeTournament(tournamentId);

    expect(await readPhase(tournamentId)).toBe("completed");

    const state = await getPlayoffState(tournamentId);
    expect(state.completionToken).not.toBeNull();

    for (const scope of state.scopes) {
      expect(scope.classification!.complete).toBe(true);
      expect(scope.classification!.entries.map((entry) => entry.position)).toEqual(
        [1, 2, 3, 4, 5, 6, 7]
      );
    }
  });
});
