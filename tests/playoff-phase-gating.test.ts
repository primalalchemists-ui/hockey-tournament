import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { postgresRepository } from "@/lib/data/postgres/repository";
import {
  completeCurrentRound,
  completeGroupStage,
  completeTournament,
  getPlayoffState,
  savePlayoffMatchResult,
} from "@/lib/data/postgres/playoff-engine";
import { TournamentOperationError } from "@/lib/data/types";
import type { Group, Match, Team, Tournament } from "@/types/tournament";
import type { PlayoffConfig } from "@/types/tournament-config";
import {
  deleteOwnFixtures,
  readCurrentTournamentId,
  restoreCurrentTournament,
} from "./helpers/current-tournament";

/**
 * BRAMKA FAZOWA PO STRONIE SERWERA.
 *
 * `disabled` w HTML jest wylacznie podpowiedzia dla oka - te testy
 * wywoluja operacje domenowe bezposrednio, z pominieciem panelu.
 * Fixtures sa jednorazowe (prefiks "vitest-gating") i gina w afterAll.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);

const CONFIG: PlayoffConfig = {
  qualifiedTeamCount: 4,
  thirdPlaceMatch: true,
  placementMode: "placement_group",
  tieBreaker: "penalties",
};

function buildTeams(count: number): Team[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `a${index + 1}`,
    name: `A${index + 1}`,
    shortName: `A${index + 1}`,
    logoText: `A${index + 1}`,
    sourceOrder: index + 1,
  }));
}

/** Nizszy numer zawsze wygrywa - jednoznaczne rozstawienie 1..n. */
function buildRoundRobin(teams: Team[]): Match[] {
  const result: Match[] = [];

  for (let i = 0; i < teams.length; i += 1) {
    for (let j = i + 1; j < teams.length; j += 1) {
      result.push({
        id: `A-${teams[i].id}-${teams[j].id}`,
        group: "A",
        homeTeamId: teams[i].id,
        awayTeamId: teams[j].id,
        homeScore: 1,
        awayScore: 0,
      });
    }
  }

  return result;
}

async function createFixture(name: string) {
  const title = `Vitest Gating ${name}`;
  const teams = buildTeams(7);

  const created = await postgresRepository.createTournament({
    title,
    settings: {
      structure: "groups",
      format: "group_playoff",
      playoffConfig: CONFIG,
      scorersEnabled: false,
    },
  });

  const groups: Group[] = [
    { key: "A", name: "Grupa A", teams, matches: buildRoundRobin(teams) },
  ];

  const payload: Tournament = {
    id: "ignored",
    title,
    scorers: [],
    assets: {},
    groups,
  };

  await postgresRepository.saveTournament(created.id, payload);

  return created.id;
}

let originalCurrentId: string | null = null;

beforeAll(async () => {
  originalCurrentId = await readCurrentTournamentId();
});

afterAll(async () => {
  try {
    await deleteOwnFixtures("vitest-gating", originalCurrentId);
  } finally {
    await restoreCurrentTournament(originalCurrentId);
  }
});

describe.skipIf(!hasDatabase)("A-D: w trakcie polfinalow", () => {
  let id = "";

  beforeAll(async () => {
    id = await createFixture("Semifinal");
    await completeGroupStage(id);
  });

  it("AL: minigrupa jest edytowalna od razu po zamrozeniu grup", async () => {
    const scope = (await getPlayoffState(id)).scopes[0];

    expect(
      scope.placement?.matches.every((m) => m.editability === "editable")
    ).toBe(true);
  });

  it("A: wynik polfinalu zapisuje sie normalnie", async () => {
    const scope = (await getPlayoffState(id)).scopes[0];
    const semifinal = scope.rounds.find((r) => r.kind === "semifinal")!;

    await savePlayoffMatchResult({
      tournamentId: id,
      matchExternalId: semifinal.matches[0].externalId,
      homeScore: 3,
      awayScore: 1,
    });

    const after = (await getPlayoffState(id)).scopes[0];
    const round = after.rounds.find((r) => r.kind === "semifinal")!;

    expect(round.matches[0].homeScore).toBe(3);
  });

  it("B: zapis wyniku finalu jest odrzucony mimo znanego uczestnika", async () => {
    const scope = (await getPlayoffState(id)).scopes[0];
    const final = scope.rounds.find((r) => r.kind === "final")!;

    // Zwyciezca polfinalu jest juz widoczny w finale - to podglad, nie zgoda.
    expect(final.matches[0].home?.teamId).toBe("a1");
    expect(final.matches[0].editability).toBe("pending");

    await expect(
      savePlayoffMatchResult({
        tournamentId: id,
        matchExternalId: final.matches[0].externalId,
        homeScore: 2,
        awayScore: 1,
      })
    ).rejects.toThrow(TournamentOperationError);
  });

  it("C: mecz o 3. miejsce tez jest zablokowany", async () => {
    const scope = (await getPlayoffState(id)).scopes[0];
    const third = scope.rounds.find((r) => r.kind === "third_place")!;

    await expect(
      savePlayoffMatchResult({
        tournamentId: id,
        matchExternalId: third.matches[0].externalId,
        homeScore: 1,
        awayScore: 0,
      })
    ).rejects.toThrow(/nie rozpocz/i);
  });

  it("D: wynik minigrupy zapisuje sie rownolegle z drabinka", async () => {
    const scope = (await getPlayoffState(id)).scopes[0];

    await savePlayoffMatchResult({
      tournamentId: id,
      matchExternalId: scope.placement!.matches[0].externalId,
      homeScore: 4,
      awayScore: 2,
    });

    const after = (await getPlayoffState(id)).scopes[0];

    expect(after.placement?.matches[0].homeScore).toBe(4);
  });

  it("Q-T: brak wynikow opisany druzynami, nie identyfikatorami", async () => {
    try {
      await completeCurrentRound(id);
      throw new Error("Operacja powinna zostac odrzucona.");
    } catch (error) {
      expect(error).toBeInstanceOf(TournamentOperationError);

      const details = (error as TournamentOperationError).details;

      expect(details).toBeDefined();
      expect(details!.title).toMatch(/polfina|półfina/i);

      const names = details!.matches.flatMap((match) => [
        match.home?.name,
        match.away?.name,
      ]);

      // T: realne nazwy druzyn.
      expect(names).toContain("A2");
      expect(names).toContain("A3");

      // S: pogrupowane po grupie.
      expect(details!.matches[0].groupName).toBe("Grupa A");

      // Q/R: zero identyfikatorow technicznych.
      const serialized = JSON.stringify(details);
      expect(serialized).not.toMatch(/po-A-semifinal/);
      expect(serialized).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
    }
  });

  it("AM: niekompletna minigrupa NIE blokuje zamkniecia polfinalow", async () => {
    const scope = (await getPlayoffState(id)).scopes[0];
    const semifinal = scope.rounds.find((r) => r.kind === "semifinal")!;

    await savePlayoffMatchResult({
      tournamentId: id,
      matchExternalId: semifinal.matches[1].externalId,
      homeScore: 5,
      awayScore: 2,
    });

    // Minigrupa ma dopiero 1 z 3 wynikow - a mimo to runda sie domyka.
    expect(scope.placement?.complete).toBe(false);

    await completeCurrentRound(id);

    expect((await getPlayoffState(id)).phase).toBe("final");
  });
});

describe.skipIf(!hasDatabase)("E-H: w trakcie finalow", () => {
  let id = "";

  beforeAll(async () => {
    id = await createFixture("Final");
    await completeGroupStage(id);

    const scope = (await getPlayoffState(id)).scopes[0];
    const semifinal = scope.rounds.find((r) => r.kind === "semifinal")!;

    for (const match of semifinal.matches) {
      await savePlayoffMatchResult({
        tournamentId: id,
        matchExternalId: match.externalId,
        homeScore: 3,
        awayScore: 1,
      });
    }

    await completeCurrentRound(id);
  });

  it("H: polfinal jest juz zamkniety i wymaga cofniecia fazy", async () => {
    const scope = (await getPlayoffState(id)).scopes[0];
    const semifinal = scope.rounds.find((r) => r.kind === "semifinal")!;

    expect(semifinal.matches[0].editability).toBe("completed");

    await expect(
      savePlayoffMatchResult({
        tournamentId: id,
        matchExternalId: semifinal.matches[0].externalId,
        homeScore: 0,
        awayScore: 9,
      })
    ).rejects.toThrow(/cofnij/i);
  });

  it("E/F: final i mecz o 3. miejsce sa teraz edytowalne", async () => {
    const scope = (await getPlayoffState(id)).scopes[0];

    for (const kind of ["final", "third_place"] as const) {
      const round = scope.rounds.find((r) => r.kind === kind)!;

      expect(round.matches[0].editability).toBe("editable");

      await savePlayoffMatchResult({
        tournamentId: id,
        matchExternalId: round.matches[0].externalId,
        homeScore: 4,
        awayScore: 2,
      });
    }

    const after = (await getPlayoffState(id)).scopes[0];

    expect(
      after.rounds.find((r) => r.kind === "final")!.matches[0].homeScore
    ).toBe(4);
  });

  it("AN: niekompletna minigrupa blokuje zakonczenie turnieju", async () => {
    try {
      await completeTournament(id);
      throw new Error("Operacja powinna zostac odrzucona.");
    } catch (error) {
      expect(error).toBeInstanceOf(TournamentOperationError);

      const details = (error as TournamentOperationError).details;

      expect(details!.title).toMatch(/turnieju/i);
      expect(
        details!.matches.every(
          (match) => match.roundLabel === "Minigrupa klasyfikacyjna"
        )
      ).toBe(true);

      expect(details!.matches[0].home?.name).toMatch(/^A[5-7]$/);
    }
  });

  it("G: pozostale mecze minigrupy nadal mozna uzupelnic", async () => {
    const scope = (await getPlayoffState(id)).scopes[0];

    for (const match of scope.placement!.matches) {
      expect(match.editability).toBe("editable");

      if (match.homeScore === null) {
        await savePlayoffMatchResult({
          tournamentId: id,
          matchExternalId: match.externalId,
          homeScore: 3,
          awayScore: 0,
        });
      }
    }

    await completeTournament(id);

    expect((await getPlayoffState(id)).phase).toBe("completed");
  });
});
