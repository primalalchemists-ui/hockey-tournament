import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, like, sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { matches, tournaments } from "@/lib/db/schema";
import { postgresRepository } from "@/lib/data/postgres/repository";
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
import type { Group, Match, Team, Tournament } from "@/types/tournament";
import type { PlayoffConfig } from "@/types/tournament-config";
import {
  deleteOwnFixtures,
  readCurrentTournamentId,
  restoreCurrentTournament,
} from "./helpers/current-tournament";

/**
 * SILNIK FAZY PUCHAROWEJ na prawdziwej bazie.
 *
 * Scenariusz referencyjny: 2 grupy x 7 drużyn, top 4 do play-off,
 * mecz o 3. miejsce, minigrupa dla miejsc 5-7.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);

const CONFIG: PlayoffConfig = {
  qualifiedTeamCount: 4,
  thirdPlaceMatch: true,
  placementMode: "placement_group",
  tieBreaker: "penalties",
};

function buildTeams(groupKey: string, count: number): Team[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${groupKey.toLowerCase()}${index + 1}`,
    name: `${groupKey}${index + 1}`,
    shortName: `${groupKey}${index + 1}`,
    logoText: `${groupKey}${index + 1}`,
    sourceOrder: index + 1,
  }));
}

/**
 * Deterministyczny round-robin: drużyna o niższym indeksie zawsze wygrywa.
 * Daje jednoznaczną kolejność 1..n bez remisów.
 */
function buildRoundRobin(groupKey: string, teams: Team[]): Match[] {
  const result: Match[] = [];

  for (let i = 0; i < teams.length; i += 1) {
    for (let j = i + 1; j < teams.length; j += 1) {
      const home = teams[i].id;
      const away = teams[j].id;

      result.push({
        id: `${groupKey}-${home}-${away}`,
        group: groupKey,
        homeTeamId: home,
        awayTeamId: away,
        homeScore: 1,
        awayScore: 0,
      });
    }
  }

  return result;
}

function buildTournamentPayload(
  title: string,
  groupKeys: string[],
  teamCount: number
): Tournament {
  const groups: Group[] = groupKeys.map((key) => {
    const teams = buildTeams(key, teamCount);

    return {
      key,
      name: `Grupa ${key}`,
      teams,
      matches: buildRoundRobin(key, teams),
    };
  });

  return {
    id: "ignored",
    title,
    scorers: [],
    assets: {
      scheduleImage: "",
      scheduleImageType: "",
      scheduleImageName: "",
      regulationImage: "",
      regulationImageType: "",
      regulationImageName: "",
    },
    groups,
  };
}

async function createPlayoffTournament(
  title: string,
  options: { groupKeys: string[]; teamCount: number; config?: PlayoffConfig }
) {
  const created = await postgresRepository.createTournament({
    title,
    settings: {
      structure: options.groupKeys.length > 1 ? "groups" : "groups",
      format: "group_playoff",
      playoffConfig: options.config ?? CONFIG,
      scorersEnabled: true,
    },
  });

  await postgresRepository.saveTournament(
    created.id,
    buildTournamentPayload(title, options.groupKeys, options.teamCount)
  );

  return created.id;
}

async function cleanupVitestTournaments(originalCurrentId: string | null) {
  try {
    await deleteOwnFixtures("vitest-", originalCurrentId);
  } finally {
    // Przywrócenie stanu publicznego jest niezależne od powodzenia
    // sprzątania — inaczej kolejność plików testowych decydowałaby
    // o tym, który turniej widzi kibic.
    await restoreCurrentTournament(originalCurrentId);
  }
}

describe.skipIf(!hasDatabase)("silnik play-off — scenariusz referencyjny", () => {
  let originalCurrentId: string | null = null;
  let tournamentId = "";

  beforeAll(async () => {
    originalCurrentId = await readCurrentTournamentId();

    tournamentId = await createPlayoffTournament("Vitest Reference Cup", {
      groupKeys: ["A", "B"],
      teamCount: 7,
    });
  });

  afterAll(async () => {
    await cleanupVitestTournaments(originalCurrentId);
  });

  it("startuje w fazie grupowej i pokazuje podgląd rozstawienia", async () => {
    const state = await getPlayoffState(tournamentId);

    expect(state.phase).toBe("group_stage");
    expect(state.groupStageFrozen).toBe(false);
    expect(state.scopes).toHaveLength(2);

    const scopeA = state.scopes[0];
    expect(scopeA.groupKey).toBe("A");
    expect(scopeA.preview).not.toBeNull();
    expect(scopeA.preview?.isReliable).toBe(true);
    expect(scopeA.preview?.pairs.map((p) => [p.homeTeamId, p.awayTeamId])).toEqual([
      ["a1", "a4"],
      ["a2", "a3"],
    ]);

    // Podgląd nie jest zapisywany — brak snapshotu.
    expect(scopeA.snapshot).toBeNull();

    /*
      Drabinka ISTNIEJE od początku turnieju (pełna topologia), ale jest
      prowizoryczna: uczestników ma wyłącznie pierwsza runda.
    */
    expect(scopeA.rounds.map((round) => round.kind)).toEqual([
      "semifinal",
      "final",
      "third_place",
    ]);
    expect(scopeA.rounds[0].matches.every((match) => match.provisional)).toBe(true);
    expect(scopeA.rounds[1].matches[0].home).toBeNull();
  });

  it("zamyka fazę grupową: snapshot + drabinka + minigrupa", async () => {
    await completeGroupStage(tournamentId);

    const state = await getPlayoffState(tournamentId);

    expect(state.phase).toBe("semifinal");
    expect(state.groupStageFrozen).toBe(true);

    for (const scope of state.scopes) {
      // snapshot 1..7
      expect(scope.snapshot?.map((row) => row.position)).toEqual([
        1, 2, 3, 4, 5, 6, 7,
      ]);

      // drabinka: SF -> F + mecz o 3. miejsce
      expect(scope.rounds.map((r) => r.kind)).toEqual([
        "semifinal",
        "final",
        "third_place",
      ]);
      expect(scope.rounds[0].status).toBe("active");
      expect(scope.rounds[1].status).toBe("pending");

      const key = scope.groupKey.toLowerCase();

      expect(
        scope.rounds[0].matches.map((m) => [m.home?.teamId, m.away?.teamId])
      ).toEqual([
        [`${key}1`, `${key}4`],
        [`${key}2`, `${key}3`],
      ]);

      // finał czeka z pustymi slotami
      expect(scope.rounds[1].matches[0].home).toBeNull();

      // minigrupa: miejsca 5-7, każdy z każdym
      expect(scope.placement?.teamIds.sort()).toEqual(
        [`${key}5`, `${key}6`, `${key}7`].sort()
      );
      expect(scope.placement?.matches).toHaveLength(3);
      expect(scope.placement?.complete).toBe(false);
    }
  });

  it("drabinki grup A i B są całkowicie niezależne", async () => {
    const state = await getPlayoffState(tournamentId);

    const idsA = state.scopes[0].rounds.flatMap((r) =>
      r.matches.map((m) => m.externalId)
    );
    const idsB = state.scopes[1].rounds.flatMap((r) =>
      r.matches.map((m) => m.externalId)
    );

    expect(idsA.some((id) => idsB.includes(id))).toBe(false);

    const teamsA = state.scopes[0].rounds.flatMap((r) =>
      r.matches.flatMap((m) => [m.home?.teamId, m.away?.teamId])
    );

    expect(teamsA.every((id) => !id || id.startsWith("a"))).toBe(true);
  });

  it("odrzuca ponowne zamknięcie fazy grupowej", async () => {
    await expect(completeGroupStage(tournamentId)).rejects.toBeInstanceOf(
      TournamentOperationError
    );

    // brak duplikatów drabinki
    const state = await getPlayoffState(tournamentId);
    expect(state.scopes[0].rounds).toHaveLength(3);
  });

  it("zmiana wyniku grupowego po zamrożeniu NIE zmienia rozstawienia", async () => {
    const before = await getPlayoffState(tournamentId);
    const seedsBefore = before.scopes[0].rounds[0].matches.map((m) => [
      m.home?.teamId,
      m.away?.teamId,
    ]);

    // Odwracamy wynik meczu a1 vs a7 — a1 przestaje być liderem na żywo.
    const payload = buildTournamentPayload("Vitest Reference Cup", ["A", "B"], 7);
    const target = payload.groups[0].matches.find((m) => m.id === "A-a1-a7")!;
    target.homeScore = 0;
    target.awayScore = 9;

    await postgresRepository.saveTournament(tournamentId, payload);

    const after = await getPlayoffState(tournamentId);

    // Oficjalna drabinka pochodzi ze snapshotu — jest nietknięta.
    expect(
      after.scopes[0].rounds[0].matches.map((m) => [m.home?.teamId, m.away?.teamId])
    ).toEqual(seedsBefore);

    // Snapshot też się nie zmienił.
    expect(after.scopes[0].snapshot?.[0].teamId).toBe("a1");

    // Zapis tabeli nie skasował drabinki ani minigrupy.
    expect(after.scopes[0].rounds).toHaveLength(3);
    expect(after.scopes[0].placement?.matches).toHaveLength(3);

    // przywracamy oryginalny wynik
    target.homeScore = 1;
    target.awayScore = 0;
    await postgresRepository.saveTournament(tournamentId, payload);
  });

  it("odrzuca remis w meczu play-off", async () => {
    const state = await getPlayoffState(tournamentId);
    const sf1 = state.scopes[0].rounds[0].matches[0];

    await expect(
      savePlayoffMatchResult({
        tournamentId,
        matchExternalId: sf1.externalId,
        homeScore: 2,
        awayScore: 2,
      })
    ).rejects.toThrow(/rzutach karnych/);
  });

  it("propaguje zwycięzcę do finału i przegranego do meczu o 3. miejsce", async () => {
    const state = await getPlayoffState(tournamentId);

    for (const scope of state.scopes) {
      const [sf1, sf2] = scope.rounds[0].matches;

      await savePlayoffMatchResult({
        tournamentId,
        matchExternalId: sf1.externalId,
        homeScore: 3,
        awayScore: 1,
      });
      await savePlayoffMatchResult({
        tournamentId,
        matchExternalId: sf2.externalId,
        homeScore: 0,
        awayScore: 2,
      });
    }

    const after = await getPlayoffState(tournamentId);

    for (const scope of after.scopes) {
      const key = scope.groupKey.toLowerCase();
      const final = scope.rounds[1].matches[0];
      const third = scope.rounds[2].matches[0];

      // zwycięzcy: 1 (wygrał 3:1) i 3 (wygrał 2:0 jako gość)
      expect(final.home?.teamId).toBe(`${key}1`);
      expect(final.away?.teamId).toBe(`${key}3`);

      // przegrani: 4 i 2
      expect(third.home?.teamId).toBe(`${key}4`);
      expect(third.away?.teamId).toBe(`${key}2`);
    }
  });

  it("nie pozwala wpisać wyniku finału w trakcie półfinałów", async () => {
    /*
      Uczestnik finału bywa już znany (zwycięzca półfinału propaguje się
      od razu), ale to NIE znaczy, że mecz wolno rozliczyć. Finał otwiera
      dopiero jawne zamknięcie półfinałów.
    */
    const state = await getPlayoffState(tournamentId);
    const scope = state.scopes[0];

    await expect(
      savePlayoffMatchResult({
        tournamentId,
        matchExternalId: scope.rounds[1].matches[0].externalId,
        homeScore: 5,
        awayScore: 2,
      })
    ).rejects.toThrow(/nie rozpoczął/i);

    // Mecz o 3. miejsce należy do tej samej fazy co finał — też zablokowany.
    await expect(
      savePlayoffMatchResult({
        tournamentId,
        matchExternalId: scope.rounds[2].matches[0].externalId,
        homeScore: 1,
        awayScore: 0,
      })
    ).rejects.toThrow(/nie rozpoczął/i);

    // Wynik finału nadal pusty — odrzucenie nie zostawiło śladu.
    const after = await getPlayoffState(tournamentId);
    expect(after.scopes[0].rounds[1].matches[0].homeScore).toBeNull();
  });

  it("pozwala zmienić zwycięzcę, gdy kolejny etap nie ma wyniku", async () => {
    const state = await getPlayoffState(tournamentId);
    const scope = state.scopes[0];
    const key = scope.groupKey.toLowerCase();
    const sf1 = scope.rounds[0].matches[0];

    await savePlayoffMatchResult({
      tournamentId,
      matchExternalId: sf1.externalId,
      homeScore: 0,
      awayScore: 4,
    });

    const after = await getPlayoffState(tournamentId);
    const scopeAfter = after.scopes[0];

    // propagacja zaktualizowała slot finału i meczu o 3. miejsce
    expect(scopeAfter.rounds[1].matches[0].home?.teamId).toBe(`${key}4`);
    expect(scopeAfter.rounds[2].matches[0].home?.teamId).toBe(`${key}1`);

    // przywracamy pierwotny wynik
    await savePlayoffMatchResult({
      tournamentId,
      matchExternalId: sf1.externalId,
      homeScore: 3,
      awayScore: 1,
    });
  });

  it("kończy półfinały i przechodzi do finałów", async () => {
    await completeCurrentRound(tournamentId);

    const state = await getPlayoffState(tournamentId);

    expect(state.phase).toBe("final");

    for (const scope of state.scopes) {
      expect(scope.rounds[0].status).toBe("completed");
      expect(scope.rounds[1].status).toBe("active");
      expect(scope.rounds[2].status).toBe("active");
    }
  });

  it("blokuje zakończenie turnieju przy brakujących wynikach", async () => {
    await expect(completeTournament(tournamentId)).rejects.toThrow(
      /Nie można zakończyć turnieju/
    );
  });

  it("odrzuca remis w minigrupie", async () => {
    const state = await getPlayoffState(tournamentId);
    const placementMatch = state.scopes[0].placement!.matches[0];

    await expect(
      savePlayoffMatchResult({
        tournamentId,
        matchExternalId: placementMatch.externalId,
        homeScore: 2,
        awayScore: 2,
      })
    ).rejects.toThrow(/rzutach karnych/);
  });

  it("kończy finały, mecz o 3. miejsce i minigrupę", async () => {
    const state = await getPlayoffState(tournamentId);

    for (const scope of state.scopes) {
      await savePlayoffMatchResult({
        tournamentId,
        matchExternalId: scope.rounds[1].matches[0].externalId,
        homeScore: 4,
        awayScore: 2,
      });
      await savePlayoffMatchResult({
        tournamentId,
        matchExternalId: scope.rounds[2].matches[0].externalId,
        homeScore: 1,
        awayScore: 3,
      });

      // minigrupa: niższy numer wygrywa, daje jednoznaczne 5/6/7
      for (const match of scope.placement!.matches) {
        await savePlayoffMatchResult({
          tournamentId,
          matchExternalId: match.externalId,
          homeScore: 2,
          awayScore: 1,
        });
      }
    }

    await completeTournament(tournamentId);

    const final = await getPlayoffState(tournamentId);
    expect(final.phase).toBe("completed");
    expect(final.isCompleted).toBe(true);
  });

  it("wylicza końcową klasyfikację 1-7 niezależnie dla każdej grupy", async () => {
    const state = await getPlayoffState(tournamentId);

    for (const scope of state.scopes) {
      const key = scope.groupKey.toLowerCase();
      const classification = scope.classification!;

      expect(classification.complete).toBe(true);
      expect(classification.entries.map((e) => [e.position, e.team.teamId])).toEqual([
        [1, `${key}1`],
        [2, `${key}3`],
        [3, `${key}2`],
        [4, `${key}4`],
        [5, `${key}5`],
        [6, `${key}6`],
        [7, `${key}7`],
      ]);
    }

    // Grupy nie mieszają się w klasyfikacji.
    const teamsA = state.scopes[0].classification!.entries.map((e) => e.team.teamId);
    expect(teamsA.every((id) => id.startsWith("a"))).toBe(true);
  });
});

/* ==========================================================================
 * COFANIE FAZ
 * ======================================================================== */

describe.skipIf(!hasDatabase)("cofanie faz", () => {
  let originalCurrentId: string | null = null;

  beforeAll(async () => {
    originalCurrentId = await readCurrentTournamentId();
  });

  afterAll(async () => {
    await cleanupVitestTournaments(originalCurrentId);
  });

  it("cofa z półfinałów do fazy grupowej, zachowując wyniki grupowe", async () => {
    const id = await createPlayoffTournament("Vitest Rewind Group", {
      groupKeys: ["A"],
      teamCount: 7,
    });

    await completeGroupStage(id);

    const impact = await describeReopen(id);
    expect(impact.targetPhase).toBe("group_stage");
    expect(impact.removesBracket).toBe(true);

    await reopenPreviousPhase({ tournamentId: id, confirmDataLoss: false });

    const state = await getPlayoffState(id);

    expect(state.phase).toBe("group_stage");
    expect(state.groupStageFrozen).toBe(false);
    // Topologia wraca do stanu prowizorycznego — oficjalnych meczów nie ma.
    expect(
      state.scopes[0].rounds.every((round) =>
        round.matches.every((match) => match.provisional)
      )
    ).toBe(true);
    expect(state.scopes[0].placement).toBeNull();
    expect(state.scopes[0].snapshot).toBeNull();

    // Wyniki fazy grupowej NIE zostały ruszone.
    expect(state.scopes[0].groupStandings).toHaveLength(7);
    expect(state.scopes[0].groupStandings[0].played).toBe(6);

    // Można ponownie zamknąć fazę grupową.
    await completeGroupStage(id);
    expect((await getPlayoffState(id)).phase).toBe("semifinal");
  });

  it("wymaga potwierdzenia, gdy cofnięcie skasuje wpisane wyniki", async () => {
    const id = await createPlayoffTournament("Vitest Rewind Confirm", {
      groupKeys: ["A"],
      teamCount: 7,
    });

    await completeGroupStage(id);

    const state = await getPlayoffState(id);
    await savePlayoffMatchResult({
      tournamentId: id,
      matchExternalId: state.scopes[0].rounds[0].matches[0].externalId,
      homeScore: 3,
      awayScore: 1,
    });

    const impact = await describeReopen(id);
    expect(impact.resultsToDiscard).toBe(1);

    await expect(
      reopenPreviousPhase({ tournamentId: id, confirmDataLoss: false })
    ).rejects.toThrow(/jawnego potwierdzenia/);

    await reopenPreviousPhase({ tournamentId: id, confirmDataLoss: true });

    expect((await getPlayoffState(id)).phase).toBe("group_stage");
  });

  it("cofa z finałów do półfinałów, zachowując wcześniejsze rundy", async () => {
    const id = await createPlayoffTournament("Vitest Rewind Final", {
      groupKeys: ["A"],
      teamCount: 7,
    });

    await completeGroupStage(id);

    let state = await getPlayoffState(id);
    const [sf1, sf2] = state.scopes[0].rounds[0].matches;

    await savePlayoffMatchResult({
      tournamentId: id,
      matchExternalId: sf1.externalId,
      homeScore: 3,
      awayScore: 1,
    });
    await savePlayoffMatchResult({
      tournamentId: id,
      matchExternalId: sf2.externalId,
      homeScore: 2,
      awayScore: 0,
    });

    await completeCurrentRound(id);

    state = await getPlayoffState(id);
    expect(state.phase).toBe("final");

    await savePlayoffMatchResult({
      tournamentId: id,
      matchExternalId: state.scopes[0].rounds[1].matches[0].externalId,
      homeScore: 5,
      awayScore: 1,
    });

    await reopenPreviousPhase({ tournamentId: id, confirmDataLoss: true });

    state = await getPlayoffState(id);

    expect(state.phase).toBe("semifinal");
    expect(state.scopes[0].rounds[0].status).toBe("active");
    expect(state.scopes[0].rounds[1].status).toBe("pending");

    // Wyniki półfinałów zostały zachowane.
    expect(state.scopes[0].rounds[0].matches[0].homeScore).toBe(3);

    // Finał został wyczyszczony wraz z uczestnikami wyprowadzonymi z SF.
    expect(state.scopes[0].rounds[1].matches[0].homeScore).toBeNull();
    expect(state.scopes[0].rounds[1].matches[0].home).toBeNull();

    // Po cofnięciu można poprawić półfinał.
    await savePlayoffMatchResult({
      tournamentId: id,
      matchExternalId: state.scopes[0].rounds[0].matches[0].externalId,
      homeScore: 0,
      awayScore: 6,
    });

    const fixed = await getPlayoffState(id);
    expect(fixed.scopes[0].rounds[1].matches[0].home?.teamId).toBe("a4");
  });
});

/* ==========================================================================
 * WARIANTY KONFIGURACJI
 * ======================================================================== */

describe.skipIf(!hasDatabase)("warianty konfiguracji", () => {
  let originalCurrentId: string | null = null;

  beforeAll(async () => {
    originalCurrentId = await readCurrentTournamentId();
  });

  afterAll(async () => {
    await cleanupVitestTournaments(originalCurrentId);
  });

  it("bez meczu o 3. miejsce nie generuje fikcyjnego meczu", async () => {
    const id = await createPlayoffTournament("Vitest No Third", {
      groupKeys: ["A"],
      teamCount: 7,
      config: { ...CONFIG, thirdPlaceMatch: false },
    });

    await completeGroupStage(id);

    const state = await getPlayoffState(id);

    expect(state.scopes[0].rounds.map((r) => r.kind)).toEqual([
      "semifinal",
      "final",
    ]);
  });

  it("placementMode=none nie tworzy minigrupy", async () => {
    const id = await createPlayoffTournament("Vitest No Placement", {
      groupKeys: ["A"],
      teamCount: 7,
      config: { ...CONFIG, placementMode: "none" },
    });

    await completeGroupStage(id);

    const state = await getPlayoffState(id);
    expect(state.scopes[0].placement).toBeNull();
  });

  it("drabinka 8-drużynowa przechodzi QF -> SF -> F", async () => {
    const id = await createPlayoffTournament("Vitest Eight", {
      groupKeys: ["A"],
      teamCount: 8,
      config: { ...CONFIG, qualifiedTeamCount: 8, placementMode: "none" },
    });

    await completeGroupStage(id);

    let state = await getPlayoffState(id);
    expect(state.phase).toBe("quarterfinal");
    expect(state.scopes[0].rounds.map((r) => r.kind)).toEqual([
      "quarterfinal",
      "semifinal",
      "final",
      "third_place",
    ]);

    for (const match of state.scopes[0].rounds[0].matches) {
      await savePlayoffMatchResult({
        tournamentId: id,
        matchExternalId: match.externalId,
        homeScore: 2,
        awayScore: 1,
      });
    }

    await completeCurrentRound(id);
    state = await getPlayoffState(id);
    expect(state.phase).toBe("semifinal");

    for (const match of state.scopes[0].rounds[1].matches) {
      await savePlayoffMatchResult({
        tournamentId: id,
        matchExternalId: match.externalId,
        homeScore: 3,
        awayScore: 0,
      });
    }

    await completeCurrentRound(id);
    expect((await getPlayoffState(id)).phase).toBe("final");
  });

  it("blokuje zamknięcie fazy grupowej przy niekompletnych wynikach", async () => {
    const created = await postgresRepository.createTournament({
      title: "Vitest Incomplete",
      settings: {
        structure: "groups",
        format: "group_playoff",
        playoffConfig: CONFIG, scorersEnabled: true,
      },
    });

    const payload = buildTournamentPayload("Vitest Incomplete", ["A"], 7);
    payload.groups[0].matches = payload.groups[0].matches.slice(0, 19);

    await postgresRepository.saveTournament(created.id, payload);

    await expect(completeGroupStage(created.id)).rejects.toThrow(
      /brakuje wyników 2 meczów/
    );

    // Nic nie zostało zapisane częściowo.
    const state = await getPlayoffState(created.id);
    expect(state.phase).toBe("group_stage");
    expect(state.scopes[0].snapshot).toBeNull();
    expect(
      state.scopes[0].rounds.every((round) =>
        round.matches.every((match) => match.provisional)
      )
    ).toBe(true);
  });

  it("blokuje zamknięcie przy zbyt małej liczbie drużyn", async () => {
    const created = await postgresRepository.createTournament({
      title: "Vitest Too Small",
      settings: {
        structure: "groups",
        format: "group_playoff",
        playoffConfig: CONFIG, scorersEnabled: true,
      },
    });

    await postgresRepository.saveTournament(
      created.id,
      buildTournamentPayload("Vitest Too Small", ["A"], 3)
    );

    await expect(completeGroupStage(created.id)).rejects.toThrow(
      /wymaga 4 drużyn/
    );
  });

  it("turniej ligowy nie ma dostępu do silnika pucharowego", async () => {
    const created = await postgresRepository.createTournament({
      title: "Vitest League Only",
      settings: {
        structure: "groups",
        format: "league",
        playoffConfig: null,
        scorersEnabled: true,
      },
    });

    await expect(completeGroupStage(created.id)).rejects.toThrow(
      /nie jest turniejem z fazą pucharową/
    );
  });

  it("mecze pucharowe nie trafiają do klasyfikacji fazy grupowej", async () => {
    const id = await createPlayoffTournament("Vitest Isolation", {
      groupKeys: ["A"],
      teamCount: 7,
    });

    await completeGroupStage(id);

    const before = await getPlayoffState(id);
    const groupPlayedBefore = before.scopes[0].groupStandings.reduce(
      (sum, row) => sum + row.played,
      0
    );

    const sf = before.scopes[0].rounds[0].matches[0];
    await savePlayoffMatchResult({
      tournamentId: id,
      matchExternalId: sf.externalId,
      homeScore: 7,
      awayScore: 0,
    });

    const after = await getPlayoffState(id);
    const groupPlayedAfter = after.scopes[0].groupStandings.reduce(
      (sum, row) => sum + row.played,
      0
    );

    expect(groupPlayedAfter).toBe(groupPlayedBefore);

    // liczba meczów grupowych w bazie bez zmian
    const groupMatchCount = await getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(matches)
      .where(and(eq(matches.tournamentId, id), eq(matches.stage, "group")));

    expect(groupMatchCount[0].n).toBe(21);
  });
});
