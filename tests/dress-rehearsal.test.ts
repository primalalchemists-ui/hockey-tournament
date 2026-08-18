import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { postgresRepository } from "@/lib/data/postgres/repository";
import {
  completeCurrentRound,
  completeGroupStage,
  completeTournament,
  describeReopen,
  getPlayoffState,
  reopenPreviousPhase,
  savePlayoffMatchResult,
  type PlayoffScopeView,
  type PlayoffStateView,
} from "@/lib/data/postgres/playoff-engine";
import { TournamentOperationError } from "@/lib/data/types";
import { buildBracketTopology } from "@/lib/playoff/topology";
import { WIN_POINTS } from "@/lib/playoff/aggregate-stats";
import { calculatePlannedMatchCount } from "@/lib/playoff/planned-matches";
import type { Group, Match, Team, Tournament } from "@/types/tournament";
import type { PlayoffConfig } from "@/types/tournament-config";
import {
  deleteOwnFixtures,
  readCurrentTournamentId,
  restoreCurrentTournament,
} from "./helpers/current-tournament";

/**
 * PROBA GENERALNA SILNIKA TURNIEJOWEGO - scenariusze A-F.
 *
 * To nie sa testy jednostkowe pojedynczych funkcji. Kazdy scenariusz
 * przechodzi realny cykl zycia turnieju na prawdziwej bazie:
 *
 *   faza grupowa -> zamrozenie -> drabinka -> minigrupa
 *   -> klasyfikacja koncowa
 *
 * i ma z gory zapisany oczekiwany rezultat sportowy.
 *
 * Wszystkie turnieje sa jednorazowe (prefiks "vitest-rehearsal") i gina
 * w afterAll. Realne SUN CUP, Rabbit Cup ani turniej publiczny nie sa
 * przy tym dotykane.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);

const BASE_CONFIG: PlayoffConfig = {
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
 * Deterministyczny round-robin: nizszy numer zawsze wygrywa 1:0.
 *
 * Daje jednoznaczna kolejnosc 1..n bez remisow, wiec rozstawienie
 * do play-offu jest przewidywalne i nie zalezy od tie-breakerow.
 */
function buildRoundRobin(groupKey: string, teams: Team[]): Match[] {
  const result: Match[] = [];

  for (let i = 0; i < teams.length; i += 1) {
    for (let j = i + 1; j < teams.length; j += 1) {
      result.push({
        id: `${groupKey}-${teams[i].id}-${teams[j].id}`,
        group: groupKey,
        homeTeamId: teams[i].id,
        awayTeamId: teams[j].id,
        homeScore: 1,
        awayScore: 0,
      });
    }
  }

  return result;
}

function buildPayload(
  title: string,
  groupKeys: string[],
  teamCount: number,
  withResults: boolean
): Tournament {
  const groups: Group[] = groupKeys.map((key) => {
    const teams = buildTeams(key, teamCount);

    return {
      key,
      name: `Grupa ${key}`,
      teams,
      matches: withResults ? buildRoundRobin(key, teams) : [],
    };
  });

  return {
    id: "ignored",
    title,
    scorers: [],
    assets: {},
    groups,
  };
}

type FixtureOptions = {
  groupKeys?: string[];
  teamCount: number;
  config?: PlayoffConfig;
  /** false = turniej bez ani jednego wyniku (scenariusz H). */
  withResults?: boolean;
};

export async function createRehearsalFixture(
  name: string,
  options: FixtureOptions
) {
  const title = `Vitest Rehearsal ${name}`;
  const groupKeys = options.groupKeys ?? ["A"];

  const created = await postgresRepository.createTournament({
    title,
    settings: {
      structure: "groups",
      format: "group_playoff",
      playoffConfig: options.config ?? BASE_CONFIG,
      scorersEnabled: false,
    },
  });

  await postgresRepository.saveTournament(
    created.id,
    buildPayload(title, groupKeys, options.teamCount, options.withResults ?? true)
  );

  return created.id;
}

/** Zwyciezca zawsze gospodarz - jednoznaczny wynik kazdej rundy. */
async function playMatch(
  tournamentId: string,
  externalId: string,
  homeScore = 3,
  awayScore = 1
) {
  await savePlayoffMatchResult({
    tournamentId,
    matchExternalId: externalId,
    homeScore,
    awayScore,
  });
}

function scopeOf(state: PlayoffStateView, groupKey: string): PlayoffScopeView {
  const scope = state.scopes.find((item) => item.groupKey === groupKey);
  if (!scope) throw new Error(`Brak grupy ${groupKey}`);
  return scope;
}

function roundOf(scope: PlayoffScopeView, kind: string) {
  const round = scope.rounds.find((item) => item.kind === kind);
  if (!round) throw new Error(`Brak rundy ${kind}`);
  return round;
}

function classificationOf(scope: PlayoffScopeView) {
  return (scope.classification?.entries ?? []).map((entry) => [
    entry.position,
    entry.team.teamId,
  ]);
}

/**
 * Rozgrywa CALY play-off: kolejne rundy drabinki, mecz o 3. miejsce
 * i minigrupe. Wszedzie wygrywa gospodarz, wiec wynik jest jednoznaczny.
 */
async function playWholeBracket(tournamentId: string) {
  // Zabezpieczenie przed petla nieskonczona: 16 druzyn to 4 rundy.
  for (let guard = 0; guard < 6; guard += 1) {
    const state = await getPlayoffState(tournamentId);

    const activeRounds = state.scopes.flatMap((scope) =>
      scope.rounds.filter((round) => round.status === "active")
    );

    const pending = activeRounds
      .flatMap((round) => round.matches)
      .filter((match) => !match.isFinished);

    for (const match of pending) {
      await playMatch(tournamentId, match.externalId);
    }

    /*
      Finalow NIE zamyka completeCurrentRound - robi to dopiero
      "Zakoncz turniej", bo razem z finalem musza byc rozstrzygniete
      mecz o 3. miejsce i minigrupa.
    */
    const isFinalPhase = activeRounds.some((round) => round.kind === "final");

    if (activeRounds.length === 0 || isFinalPhase) break;

    await completeCurrentRound(tournamentId);
  }

  // Minigrupa nie nalezy do sekwencji rund drabinki.
  const state = await getPlayoffState(tournamentId);

  for (const scope of state.scopes) {
    for (const match of scope.placement?.matches ?? []) {
      if (match.homeScore === null) {
        await playMatch(tournamentId, match.externalId, 2, 1);
      }
    }
  }
}

/** Wczytuje grupy turnieju; model domenowy ma je opcjonalne. */
async function loadGroups(tournamentId: string): Promise<Group[]> {
  const loaded = await postgresRepository.getTournamentById(tournamentId);

  if (loaded.status !== "ok") throw new Error("Brak turnieju");

  return loaded.tournament.groups ?? [];
}

/** Zapisuje podmienione grupy, zachowujac reszte modelu turnieju. */
async function saveGroups(tournamentId: string, nextGroups: Group[]) {
  await postgresRepository.saveTournament(tournamentId, {
    id: "ignored",
    title: "Vitest Rehearsal",
    scorers: [],
    assets: {},
    groups: nextGroups,
  });
}

let originalCurrentId: string | null = null;

beforeAll(async () => {
  originalCurrentId = await readCurrentTournamentId();
});

afterAll(async () => {
  try {
    await deleteOwnFixtures("vitest-rehearsal", originalCurrentId);
  } finally {
    await restoreCurrentTournament(originalCurrentId);
  }
});

/* ========================================================================
 * A - TOP 2: prosto z grupy do finalu
 * ====================================================================== */

describe.skipIf(!hasDatabase)("A: top 2", () => {
  /*
    Mecz o 3. miejsce jest tu WYLACZONY, bo przy dwoch druzynach nie ma
    przegranych polfinalow. Silnik nie zostawia tego przypadku na pozniej:
    proba zapisania takiej konfiguracji jest odrzucana - patrz test ponizej.
  */
  const config: PlayoffConfig = {
    qualifiedTeamCount: 2,
    thirdPlaceMatch: false,
    placementMode: "none",
    tieBreaker: "penalties",
  };

  let id = "";

  beforeAll(async () => {
    id = await createRehearsalFixture("Top2", { teamCount: 6, config });
  });

  it("A: topologia to sam final - bez polfinalow i bez meczu o 3. miejsce", async () => {
    const scope = scopeOf(await getPlayoffState(id), "A");

    expect(scope.rounds.map((round) => round.kind)).toEqual(["final"]);
  });

  it("A: zamrozenie wystawia do finalu miejsca 1 i 2", async () => {
    await completeGroupStage(id);

    const scope = scopeOf(await getPlayoffState(id), "A");
    const final = roundOf(scope, "final").matches[0];

    expect([final.home?.teamId, final.away?.teamId]).toEqual(["a1", "a2"]);
  });

  it("A: klasyfikacja 1-6, miejsca 3-6 z zamrozonej tabeli", async () => {
    await playWholeBracket(id);
    await completeTournament(id);

    const scope = scopeOf(await getPlayoffState(id), "A");

    expect(scope.classification?.complete).toBe(true);
    expect(classificationOf(scope)).toEqual([
      [1, "a1"],
      [2, "a2"],
      [3, "a3"],
      [4, "a4"],
      [5, "a5"],
      [6, "a6"],
    ]);
  });

  it("A: konfiguracja z meczem o 3. miejsce jest odrzucana", async () => {
    await expect(
      createRehearsalFixture("Top2Invalid", {
        teamCount: 6,
        config: { ...config, thirdPlaceMatch: true },
      })
    ).rejects.toThrow(/3. miejsce/);
  });

  it("A: 15 meczow grupowych + final = 16 planowanych", () => {
    expect(
      calculatePlannedMatchCount({
        format: "group_playoff",
        playoffConfig: config,
        scopes: [{ teamCount: 6 }],
      })
    ).toBe(16);
  });
});

/* ========================================================================
 * B - TOP 4 + MECZ O 3. MIEJSCE + MINIGRUPA (odpowiednik SUN CUP U8)
 * ====================================================================== */

describe.skipIf(!hasDatabase)("B: top 4 z minigrupa", () => {
  let id = "";

  beforeAll(async () => {
    id = await createRehearsalFixture("Top4Full", {
      groupKeys: ["A", "B"],
      teamCount: 7,
    });
  });

  it("B: faza grupowa to 21 meczow w grupie", async () => {
    const [group] = await loadGroups(id);

    expect(group.matches).toHaveLength(21);
  });

  it("B: po zamrozeniu polfinaly to 1-4 i 2-3", async () => {
    await completeGroupStage(id);

    const scope = scopeOf(await getPlayoffState(id), "A");

    expect(
      roundOf(scope, "semifinal").matches.map((match) => [
        match.home?.teamId,
        match.away?.teamId,
      ])
    ).toEqual([
      ["a1", "a4"],
      ["a2", "a3"],
    ]);
  });

  it("B: minigrupa obejmuje miejsca 5-7 i ma 3 mecze", async () => {
    const scope = scopeOf(await getPlayoffState(id), "A");

    expect(scope.placement?.positionFrom).toBe(5);
    expect(scope.placement?.positionTo).toBe(7);
    expect(scope.placement?.matches).toHaveLength(3);
  });

  it("B: zwyciezcy polfinalow ida do finalu, przegrani o 3. miejsce", async () => {
    const before = scopeOf(await getPlayoffState(id), "A");

    for (const match of roundOf(before, "semifinal").matches) {
      await playMatch(id, match.externalId);
    }

    const after = scopeOf(await getPlayoffState(id), "A");

    expect(
      roundOf(after, "final").matches.map((m) => [
        m.home?.teamId,
        m.away?.teamId,
      ])
    ).toEqual([["a1", "a2"]]);

    expect(
      roundOf(after, "third_place").matches.map((m) => [
        m.home?.teamId,
        m.away?.teamId,
      ])
    ).toEqual([["a4", "a3"]]);
  });

  it("B: klasyfikacja koncowa 1-7 bez dziur, w obu grupach", async () => {
    await playWholeBracket(id);
    await completeTournament(id);

    const state = await getPlayoffState(id);

    for (const scope of state.scopes) {
      const key = scope.groupKey.toLowerCase();

      expect(scope.classification?.complete).toBe(true);
      expect(classificationOf(scope)).toEqual([
        [1, `${key}1`],
        [2, `${key}2`],
        [3, `${key}4`],
        [4, `${key}3`],
        [5, `${key}5`],
        [6, `${key}6`],
        [7, `${key}7`],
      ]);
    }
  });

  it("B: 28 planowanych meczow na grupe, 56 na turniej", () => {
    expect(
      calculatePlannedMatchCount({
        format: "group_playoff",
        playoffConfig: BASE_CONFIG,
        scopes: [{ teamCount: 7 }, { teamCount: 7 }],
      })
    ).toBe(56);
  });
});

/* ========================================================================
 * C - TOP 4 BEZ MECZU O 3. MIEJSCE
 * ====================================================================== */

describe.skipIf(!hasDatabase)("C: trzecie miejsce z zamrozonej tabeli", () => {
  let id = "";

  beforeAll(async () => {
    id = await createRehearsalFixture("NoThird", {
      teamCount: 7,
      config: { ...BASE_CONFIG, thirdPlaceMatch: false },
    });
  });

  it("C: silnik nie tworzy meczu o 3. miejsce", async () => {
    await completeGroupStage(id);

    const scope = scopeOf(await getPlayoffState(id), "A");

    expect(scope.rounds.map((round) => round.kind)).toEqual([
      "semifinal",
      "final",
    ]);
  });

  it("C: przegrani polfinalow dzieleni wedlug zamrozonych miejsc", async () => {
    await playWholeBracket(id);
    await completeTournament(id);

    const scope = scopeOf(await getPlayoffState(id), "A");

    /*
      Polfinaly wygrali a1 i a2. Przegrali a4 (z pary 1-4) oraz a3
      (z pary 2-3). O podziale miejsc 3 i 4 decyduje wylacznie zamrozona
      tabela: a3 byl w niej wyzej niz a4. Zaden mecz nie jest zmyslany.
    */
    expect(classificationOf(scope).slice(0, 4)).toEqual([
      [1, "a1"],
      [2, "a2"],
      [3, "a3"],
      [4, "a4"],
    ]);
  });
});

/* ========================================================================
 * D - BEZ MINIGRUPY
 * ====================================================================== */

describe.skipIf(!hasDatabase)("D: miejsca 5-7 bez minigrupy", () => {
  let id = "";

  beforeAll(async () => {
    id = await createRehearsalFixture("NoPlacement", {
      teamCount: 7,
      config: { ...BASE_CONFIG, placementMode: "none" },
    });
  });

  it("D: odpadajace druzyny nie dostaja ani jednego nowego meczu", async () => {
    await completeGroupStage(id);

    const scope = scopeOf(await getPlayoffState(id), "A");

    expect(scope.placement).toBeNull();
  });

  it("D: klasyfikacja nadal obejmuje pelne 1-7", async () => {
    await playWholeBracket(id);
    await completeTournament(id);

    const scope = scopeOf(await getPlayoffState(id), "A");

    expect(scope.classification?.complete).toBe(true);
    expect(classificationOf(scope).slice(4)).toEqual([
      [5, "a5"],
      [6, "a6"],
      [7, "a7"],
    ]);
  });
});

/* ========================================================================
 * E - TOP 8
 * ====================================================================== */

describe.skipIf(!hasDatabase)("E: drabinka osmiodruzynowa", () => {
  let id = "";

  beforeAll(async () => {
    id = await createRehearsalFixture("Top8", {
      teamCount: 10,
      config: { ...BASE_CONFIG, qualifiedTeamCount: 8 },
    });
  });

  it("E: cwiercfinal, polfinal, final - razem 7 meczow drabinki", async () => {
    await completeGroupStage(id);

    const scope = scopeOf(await getPlayoffState(id), "A");

    expect(scope.rounds.map((round) => round.kind)).toEqual([
      "quarterfinal",
      "semifinal",
      "final",
      "third_place",
    ]);

    const bracketMatches = scope.rounds
      .filter((round) => round.kind !== "third_place")
      .flatMap((round) => round.matches);

    expect(bracketMatches).toHaveLength(7);
  });

  it("E: cwiercfinaly rozstawione 1-8, 4-5, 2-7, 3-6", async () => {
    const scope = scopeOf(await getPlayoffState(id), "A");

    expect(
      roundOf(scope, "quarterfinal").matches.map((m) => [
        m.home?.teamId,
        m.away?.teamId,
      ])
    ).toEqual([
      // Kolejnosc slotow jest zbalansowana: jedynka i dwojka moga spotkac
      // sie dopiero w finale, wiec sasiadujace pary to 1-8 i 4-5.
      ["a1", "a8"],
      ["a4", "a5"],
      ["a2", "a7"],
      ["a3", "a6"],
    ]);
  });

  it("E: zwyciezca awansuje dokladnie o jedna runde", async () => {
    const before = scopeOf(await getPlayoffState(id), "A");

    for (const match of roundOf(before, "quarterfinal").matches) {
      await playMatch(id, match.externalId);
    }
    await completeCurrentRound(id);

    const after = scopeOf(await getPlayoffState(id), "A");

    expect(
      roundOf(after, "semifinal").matches.map((m) => [
        m.home?.teamId,
        m.away?.teamId,
      ])
    ).toEqual([
      ["a1", "a4"],
      ["a2", "a3"],
    ]);

    // Final nadal pusty - nikt nie przewiduje wyniku polfinalu.
    expect(roundOf(after, "final").matches[0].home).toBeNull();
  });
});

/* ========================================================================
 * F - TOP 16 (test domenowy, bez ciezkiego fixture)
 * ====================================================================== */

describe("F: drabinka szesnastodruzynowa", () => {
  const seeding = new Map(
    Array.from({ length: 16 }, (_, index): [number, string] => [
      index + 1,
      `a${index + 1}`,
    ])
  );

  it("F: 1/8, cwiercfinal, polfinal, final", () => {
    const rounds = buildBracketTopology({
      scopeKey: "A",
      size: 16,
      thirdPlaceMatch: true,
    });

    expect(rounds.map((round) => round.kind)).toEqual([
      "round_of_16",
      "quarterfinal",
      "semifinal",
      "final",
      "third_place",
    ]);

    expect(rounds.map((round) => round.matches.length)).toEqual([8, 4, 2, 1, 1]);
  });

  it("F: pierwsza runda rozstawia najlepszego z najslabszym", () => {
    const rounds = buildBracketTopology({
      scopeKey: "A",
      size: 16,
      thirdPlaceMatch: false,
      liveSeeding: seeding,
    });

    expect(
      rounds[0].matches.map((match) => [match.homeTeamId, match.awayTeamId])
    ).toEqual([
      ["a1", "a16"],
      ["a8", "a9"],
      ["a4", "a13"],
      ["a5", "a12"],
      ["a2", "a15"],
      ["a7", "a10"],
      ["a3", "a14"],
      ["a6", "a11"],
    ]);

    // Kazda para pierwszej rundy sumuje sie do size + 1.
    for (const match of rounds[0].matches) {
      const home = Number(match.homeTeamId?.slice(1));
      const away = Number(match.awayTeamId?.slice(1));

      expect(home + away).toBe(17);
    }
  });

  it("F: zadna runda poza pierwsza nie zna uczestnikow z gory", () => {
    const rounds = buildBracketTopology({
      scopeKey: "A",
      size: 16,
      thirdPlaceMatch: false,
      liveSeeding: seeding,
    });

    for (const round of rounds.slice(1)) {
      for (const match of round.matches) {
        expect(match.homeTeamId).toBeNull();
        expect(match.awayTeamId).toBeNull();
      }
    }
  });
});

/* ========================================================================
 * G - DWIE NIEZALEZNE GRUPY
 * ====================================================================== */

describe.skipIf(!hasDatabase)("G: niezalezne sciezki grup", () => {
  let id = "";

  beforeAll(async () => {
    id = await createRehearsalFixture("Independent", {
      groupKeys: ["A", "B"],
      teamCount: 7,
      withResults: false,
    });
  });

  it("G: wynik w grupie A nie budzi rozstawienia w grupie B", async () => {
    const loadedGroups = await loadGroups(id);
    const groupA = loadedGroups.find((group) => group.key === "A")!;

    await saveGroups(
      id,
      loadedGroups.map((group) =>
        group.key !== "A"
          ? group
          : {
              ...group,
              matches: [
                {
                  id: "A-a1-a2",
                  group: "A",
                  homeTeamId: groupA.teams[0].id,
                  awayTeamId: groupA.teams[1].id,
                  homeScore: 5,
                  awayScore: 0,
                },
              ],
            }
      )
    );

    const state = await getPlayoffState(id);

    expect(scopeOf(state, "A").hasAnyGroupResult).toBe(true);
    expect(scopeOf(state, "B").hasAnyGroupResult).toBe(false);

    // Grupa B nie zna jeszcze zadnego uczestnika drabinki.
    for (const match of roundOf(scopeOf(state, "B"), "semifinal").matches) {
      expect(match.home).toBeNull();
      expect(match.away).toBeNull();
    }
  });

  it("G: kazda grupa ma wlasny snapshot i wlasna drabinke", async () => {
    // Komplet wynikow w obu grupach, zeby mozna bylo zamrozic.
    const loadedGroups = await loadGroups(id);

    await saveGroups(
      id,
      loadedGroups.map((group) => ({
        ...group,
        matches: buildRoundRobin(group.key, group.teams),
      }))
    );

    await completeGroupStage(id);

    const state = await getPlayoffState(id);

    for (const scope of state.scopes) {
      const key = scope.groupKey.toLowerCase();

      expect(scope.snapshot?.map((row) => row.teamId)).toEqual(
        Array.from({ length: 7 }, (_, index) => `${key}${index + 1}`)
      );

      for (const match of roundOf(scope, "semifinal").matches) {
        expect(match.home?.teamId?.startsWith(key)).toBe(true);
        expect(match.away?.teamId?.startsWith(key)).toBe(true);
      }
    }
  });

  it("G: zwyciezca polfinalu grupy A nie trafia do finalu grupy B", async () => {
    const before = await getPlayoffState(id);

    for (const match of roundOf(scopeOf(before, "A"), "semifinal").matches) {
      await playMatch(id, match.externalId);
    }

    const after = await getPlayoffState(id);

    expect(
      roundOf(scopeOf(after, "A"), "final").matches[0].home?.teamId
    ).toBe("a1");

    // Grupa B nie zagrala jeszcze nic - jej final pozostaje pusty.
    expect(roundOf(scopeOf(after, "B"), "final").matches[0].home).toBeNull();
  });

  it("G: klasyfikacje i minigrupy sa liczone osobno", async () => {
    await playWholeBracket(id);
    await completeTournament(id);

    const state = await getPlayoffState(id);

    for (const scope of state.scopes) {
      const key = scope.groupKey.toLowerCase();

      expect(
        classificationOf(scope).every(([, teamId]) =>
          String(teamId).startsWith(key)
        )
      ).toBe(true);

      expect(
        scope.placement?.teamIds.every((teamId) => teamId.startsWith(key))
      ).toBe(true);
    }
  });
});

/* ========================================================================
 * H - ZERO WYNIKOW
 * ====================================================================== */

describe.skipIf(!hasDatabase)("H: turniej przed pierwszym gwizdkiem", () => {
  let id = "";

  beforeAll(async () => {
    id = await createRehearsalFixture("ZeroResults", {
      teamCount: 7,
      withResults: false,
    });
  });

  it("H: ranking pokazuje same zera", async () => {
    const scope = scopeOf(await getPlayoffState(id), "A");

    expect(scope.hasAnyGroupResult).toBe(false);
    expect(scope.ranking).toHaveLength(7);

    for (const row of scope.ranking) {
      expect([row.played, row.points, row.goalsFor]).toEqual([0, 0, 0]);
    }
  });

  it("H: pelna topologia istnieje, ale bez ani jednego uczestnika", async () => {
    const scope = scopeOf(await getPlayoffState(id), "A");

    expect(scope.rounds.map((round) => round.kind)).toEqual([
      "semifinal",
      "final",
      "third_place",
    ]);

    for (const round of scope.rounds) {
      for (const match of round.matches) {
        expect(match.home).toBeNull();
        expect(match.away).toBeNull();
      }
    }
  });

  it("H: zamkniecie fazy grupowej jest zablokowane", async () => {
    await expect(completeGroupStage(id)).rejects.toThrow();
  });
});

/* ========================================================================
 * I - PIERWSZY WYNIK
 * ====================================================================== */

describe.skipIf(!hasDatabase)("I: pierwszy wynik w turnieju", () => {
  let id = "";

  beforeAll(async () => {
    id = await createRehearsalFixture("FirstResult", {
      teamCount: 7,
      withResults: false,
    });

    const [group] = await loadGroups(id);

    await saveGroups(id, [
      {
        ...group,
        matches: [
          {
            id: "A-a7-a1",
            group: "A",
            homeTeamId: group.teams[6].id,
            awayTeamId: group.teams[0].id,
            homeScore: 4,
            awayScore: 0,
          },
        ],
      },
    ]);
  });

  it("I: statystyki zaczynaja sie liczyc", async () => {
    const scope = scopeOf(await getPlayoffState(id), "A");

    const leader = scope.ranking[0];

    expect(leader.teamId).toBe("a7");
    expect([leader.played, leader.points, leader.goalsFor]).toEqual([1, 3, 4]);
  });

  it("I: pierwsza runda dostaje prowizoryczne rozstawienie", async () => {
    const scope = scopeOf(await getPlayoffState(id), "A");
    const semifinal = roundOf(scope, "semifinal");

    expect(semifinal.matches.every((match) => match.provisional)).toBe(true);
    expect(semifinal.matches[0].home?.teamId).toBe("a7");
  });

  it("I: dalsze rundy nadal nie znaja uczestnikow", async () => {
    const scope = scopeOf(await getPlayoffState(id), "A");

    expect(roundOf(scope, "final").matches[0].home).toBeNull();
    expect(roundOf(scope, "third_place").matches[0].home).toBeNull();
  });
});

/* ========================================================================
 * J - STATYSTYKI Z CALEGO TURNIEJU
 * ====================================================================== */

describe.skipIf(!hasDatabase)("J: punkty z fazy pucharowej", () => {
  let id = "";

  beforeAll(async () => {
    id = await createRehearsalFixture("Aggregate", { teamCount: 7 });
    await completeGroupStage(id);

    const scope = scopeOf(await getPlayoffState(id), "A");
    const semifinals = roundOf(scope, "semifinal").matches;

    /*
      Celowa niespodzianka: polfinal 1-4 wygrywa a4, a nie faworyt a1.
      Dzieki temu mistrz ma MNIEJ punktow niz druzyna z czwartego miejsca
      i widac, ze o kolejnosci decyduje oficjalne miejsce, a nie dorobek.
    */
    await playMatch(id, semifinals[0].externalId, 1, 3);
    await playMatch(id, semifinals[1].externalId, 4, 2);
    await completeCurrentRound(id);

    const afterSemis = scopeOf(await getPlayoffState(id), "A");

    await playMatch(id, roundOf(afterSemis, "final").matches[0].externalId, 2, 1);
    await playMatch(
      id,
      roundOf(afterSemis, "third_place").matches[0].externalId,
      5,
      0
    );

    for (const match of afterSemis.placement?.matches ?? []) {
      await playMatch(id, match.externalId, 2, 1);
    }

    await completeTournament(id);
  });

  it("J: kazde zwyciestwo w play-off dorzuca 3 punkty", async () => {
    const scope = scopeOf(await getPlayoffState(id), "A");
    const byId = new Map(scope.ranking.map((row) => [row.teamId, row]));

    // a4: 3 zwyciestwa grupowe + polfinal + final = 5 x 3 pkt.
    expect(byId.get("a4")?.points).toBe(5 * WIN_POINTS);
    expect(byId.get("a4")?.played).toBe(8);

    // a1: 6 zwyciestw grupowych, przegrany polfinal, wygrany mecz o 3. miejsce.
    expect(byId.get("a1")?.points).toBe(7 * WIN_POINTS);
    expect(byId.get("a1")?.played).toBe(8);
  });

  it("J: mistrz jest pierwszy, mimo mniejszego dorobku punktowego", async () => {
    const scope = scopeOf(await getPlayoffState(id), "A");

    expect(scope.ranking[0].teamId).toBe("a4");
    expect(scope.ranking[0].points).toBeLessThan(scope.ranking[1].points);
    expect(classificationOf(scope)[0]).toEqual([1, "a4"]);
  });

  it("J: bilans bramek sumuje faze grupowa i play-off", async () => {
    const scope = scopeOf(await getPlayoffState(id), "A");
    const champion = scope.ranking.find((row) => row.teamId === "a4")!;

    // 3 zwyciestwa grupowe po 1:0, polfinal 3:1 i final 2:1.
    expect(champion.goalsFor).toBe(3 + 3 + 2);
    expect(champion.goalsAgainst).toBe(3 + 1 + 1);
    expect(champion.goalDifference).toBe(
      champion.goalsFor - champion.goalsAgainst
    );
  });
});

/* ========================================================================
 * K - COFANIE
 * ====================================================================== */

describe.skipIf(!hasDatabase)("K: cofanie zakonczonego turnieju", () => {
  let id = "";

  beforeAll(async () => {
    id = await createRehearsalFixture("Rewind", { teamCount: 7 });
    await completeGroupStage(id);
    await playWholeBracket(id);
    await completeTournament(id);
  });

  it("K: turniej startuje jako zakonczony", async () => {
    const state = await getPlayoffState(id);

    expect(state.phase).toBe("completed");
    expect(state.isCompleted).toBe(true);
    expect(state.completionToken).not.toBeNull();
  });

  it("K: cofniecie wraca do finalow i gasi ceremonie", async () => {
    await reopenPreviousPhase({ tournamentId: id, confirmDataLoss: true });

    const state = await getPlayoffState(id);

    expect(state.phase).toBe("final");
    expect(state.isCompleted).toBe(false);
    expect(state.completionToken).toBeNull();

    /*
      Wyniki finalu nie znikaja, wiec klasyfikacja nadal umie sie policzyc.
      O ceremonii decyduje jednak completionToken - podium wraca do stanu
      pustego, dopoki turniej nie zostanie zakonczony ponownie.
      Patrz components/playoff/podium-section.tsx: complete && token.
    */
    const scope = scopeOf(state, "A");
    expect(Boolean(scope.classification?.complete && state.completionToken)).toBe(
      false
    );
    expect(scope.classificationSkeleton).toHaveLength(7);
  });

  it("K: wyniki grupowe przezywaja cofniecie az do fazy grupowej", async () => {
    const impact = await describeReopen(id);
    expect(impact.resultsToDiscard).toBeGreaterThanOrEqual(0);

    await reopenPreviousPhase({ tournamentId: id, confirmDataLoss: true });
    await reopenPreviousPhase({ tournamentId: id, confirmDataLoss: true });

    const state = await getPlayoffState(id);

    expect(state.phase).toBe("group_stage");
    expect(state.groupStageFrozen).toBe(false);

    const scope = scopeOf(state, "A");

    // Tabela grupowa nadal kompletna: 6 meczow na druzyne.
    expect(scope.groupStandings.every((row) => row.played === 6)).toBe(true);
    expect(scope.snapshot).toBeNull();
  });
});

/* ========================================================================
 * L - KOREKTA WYNIKU
 * ====================================================================== */

describe.skipIf(!hasDatabase)("L: korekta wyniku polfinalu", () => {
  let id = "";

  beforeAll(async () => {
    id = await createRehearsalFixture("Correction", { teamCount: 7 });
    await completeGroupStage(id);
  });

  it("L: zmiana zwyciezcy podmienia uczestnika finalu", async () => {
    const scope = scopeOf(await getPlayoffState(id), "A");
    const semifinal = roundOf(scope, "semifinal").matches[0];

    await playMatch(id, semifinal.externalId, 3, 1);

    expect(
      roundOf(scopeOf(await getPlayoffState(id), "A"), "final").matches[0].home
        ?.teamId
    ).toBe("a1");

    // Korekta: mecz jednak wygral a4.
    await playMatch(id, semifinal.externalId, 1, 3);

    const after = scopeOf(await getPlayoffState(id), "A");

    expect(roundOf(after, "final").matches[0].home?.teamId).toBe("a4");
    expect(roundOf(after, "third_place").matches[0].home?.teamId).toBe("a1");
  });

  it("L: korekta jest zablokowana, gdy kolejny etap ma juz wynik", async () => {
    const scope = scopeOf(await getPlayoffState(id), "A");
    const semifinals = roundOf(scope, "semifinal").matches;

    await playMatch(id, semifinals[1].externalId, 3, 1);
    await completeCurrentRound(id);

    const withFinal = scopeOf(await getPlayoffState(id), "A");
    await playMatch(id, roundOf(withFinal, "final").matches[0].externalId, 2, 1);

    await expect(
      savePlayoffMatchResult({
        tournamentId: id,
        matchExternalId: semifinals[0].externalId,
        homeScore: 5,
        awayScore: 0,
      })
    ).rejects.toThrow(TournamentOperationError);

    // Drabinka pozostaje spojna: final nadal ma poprzedniego uczestnika.
    expect(
      roundOf(scopeOf(await getPlayoffState(id), "A"), "final").matches[0].home
        ?.teamId
    ).toBe("a4");
  });
});

/* ========================================================================
 * M - SPOJNOSC KLASYFIKACJI KONCOWEJ
 * ====================================================================== */

describe.skipIf(!hasDatabase)(
  "M: ranking, klasyfikacja i podium mowia to samo",
  () => {
    let id = "";

    beforeAll(async () => {
      id = await createRehearsalFixture("Consistency", {
        groupKeys: ["A", "B"],
        teamCount: 7,
      });
      await completeGroupStage(id);
      await playWholeBracket(id);
      await completeTournament(id);
    });

    it("M: kolejnosc rankingu jest identyczna z klasyfikacja koncowa", async () => {
      const state = await getPlayoffState(id);

      for (const scope of state.scopes) {
        expect(scope.ranking.map((row) => row.teamId)).toEqual(
          classificationOf(scope).map(([, teamId]) => teamId)
        );
      }
    });

    it("M: miejsca sa ciagle od 1 i bez powtorzen", async () => {
      const state = await getPlayoffState(id);

      for (const scope of state.scopes) {
        expect(classificationOf(scope).map(([position]) => position)).toEqual([
          1, 2, 3, 4, 5, 6, 7,
        ]);

        expect(scope.ranking.map((row) => row.position)).toEqual([
          1, 2, 3, 4, 5, 6, 7,
        ]);
      }
    });

    it("M: szkielet podium ma tyle slotow, ile druzyn", async () => {
      const state = await getPlayoffState(id);

      for (const scope of state.scopes) {
        expect(scope.classificationSkeleton).toHaveLength(7);
      }
    });
  }
);
