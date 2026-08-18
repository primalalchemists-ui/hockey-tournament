import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, like, sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { tournaments } from "@/lib/db/schema";
import { postgresRepository } from "@/lib/data/postgres/repository";
import {
  completeCurrentRound,
  completeGroupStage,
  completeTournament,
  getPlayoffState,
  savePlayoffMatchResult,
  setPlayoffAsset,
} from "@/lib/data/postgres/playoff-engine";
import type { Group, Match, Team, Tournament } from "@/types/tournament";
import type { PlayoffConfig } from "@/types/tournament-config";
import {
  deleteOwnFixtures,
  readCurrentTournamentId,
  restoreCurrentTournament,
} from "./helpers/current-tournament";

/**
 * READ MODEL DLA PUBLICZNEGO FRONTENDU.
 *
 * Frontend nie liczy niczego sam — te testy pilnują, że dostaje komplet
 * danych prezentacyjnych: nazwy, loga, rozstawienie, etykiety slotów,
 * zakresy miejsc i tła sekcji.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);

const CONFIG: PlayoffConfig = {
  qualifiedTeamCount: 4,
  thirdPlaceMatch: true,
  placementMode: "placement_group",
  tieBreaker: "penalties",
};

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function teamsOf(key: string, count: number): Team[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${key.toLowerCase()}${index + 1}`,
    name: `Drużyna ${key}${index + 1}`,
    shortName: `${key}${index + 1}`,
    logoText: `${key}${index + 1}`,
    logoUrl: `https://res.cloudinary.com/demo/${key}${index + 1}.png`,
    sourceOrder: index + 1,
  }));
}

function roundRobin(key: string, teams: Team[]): Match[] {
  const out: Match[] = [];

  for (let i = 0; i < teams.length; i += 1) {
    for (let j = i + 1; j < teams.length; j += 1) {
      out.push({
        id: `${key}-${teams[i].id}-${teams[j].id}`,
        group: key,
        homeTeamId: teams[i].id,
        awayTeamId: teams[j].id,
        homeScore: 1,
        awayScore: 0,
      });
    }
  }

  return out;
}

function payloadOf(title: string, keys: string[], count: number): Tournament {
  const groups: Group[] = keys.map((key) => {
    const teams = teamsOf(key, count);
    return { key, name: `Grupa ${key}`, teams, matches: roundRobin(key, teams) };
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

async function makeTournament(
  title: string,
  keys: string[],
  teamCount: number,
  config: PlayoffConfig = CONFIG
) {
  const created = await postgresRepository.createTournament({
    title,
    settings: {
      structure: "groups",
      format: "group_playoff",
      playoffConfig: config,
      scorersEnabled: true,
    },
  });

  await postgresRepository.saveTournament(
    created.id,
    payloadOf(title, keys, teamCount)
  );

  return created.id;
}

describe.skipIf(!hasDatabase)("read model publicznego frontendu", () => {
  let originalCurrentId: string | null = null;
  let refId = "";

  beforeAll(async () => {
    originalCurrentId = await readCurrentTournamentId();

    refId = await makeTournament("Vitest Public Cup", ["A", "B"], 7);
  });

  afterAll(async () => {
    const db = getDb();

    try {
      await deleteOwnFixtures("vitest-", originalCurrentId);
    } finally {
      await restoreCurrentTournament(originalCurrentId);
    }
  });

  /* --- B: faza grupowa --------------------------------------------------- */

  it("w fazie grupowej daje preview z nazwami i logami, bez drabinki", async () => {
    const state = await getPlayoffState(refId);

    expect(state.phase).toBe("group_stage");
    expect(state.phaseLabel).toBe("Faza grupowa");
    expect(state.isCompleted).toBe(false);

    const scope = state.scopes[0];

    // Cała topologia jest widoczna od początku, ale tylko pierwsza runda
    // zna uczestników — i to prowizorycznie.
    expect(scope.rounds.length).toBeGreaterThan(0);
    expect(scope.rounds[0].matches.every((match) => match.provisional)).toBe(true);
    expect(scope.preview).not.toBeNull();

    const pair = scope.preview!.pairs[0];
    expect(pair.homeTeamName).toBe("Drużyna A1");
    expect(pair.homeLogoUrl).toContain("res.cloudinary.com");
    expect(pair.homeSeed).toBe(1);
    expect(pair.awaySeed).toBe(4);
  });

  it("brak teł jest poprawnym stanem (fallback)", async () => {
    const state = await getPlayoffState(refId);

    expect(state.bracketBackgroundUrl).toBeNull();
    expect(state.podiumBackgroundUrl).toBeNull();
  });

  /* --- C, D, L, M: oficjalna drabinka ------------------------------------ */

  it("po zamrożeniu preview znika, pojawia się drabinka z etykietami slotów", async () => {
    await completeGroupStage(refId);

    const state = await getPlayoffState(refId);
    const scope = state.scopes[0];

    expect(state.phaseLabel).toBe("Półfinały");
    expect(scope.preview).toBeNull();
    expect(scope.rounds.map((r) => r.kind)).toEqual([
      "semifinal",
      "final",
      "third_place",
    ]);

    const semifinal = scope.rounds[0].matches[0];
    expect(semifinal.home?.name).toBe("Drużyna A1");
    expect(semifinal.home?.seed).toBe(1);
    expect(semifinal.home?.logoUrl).toContain("res.cloudinary.com");
    expect(semifinal.isFinished).toBe(false);

    // Slot przyszłej rundy ma czytelną etykietę, nie UUID.
    const final = scope.rounds[1].matches[0];
    expect(final.home).toBeNull();
    // Etykieta jest teraz precyzyjna, bo służy wyłącznie czytnikom ekranu.
    expect(final.homeLabel).toBe("Zwycięzca półfinału 1");
    expect(UUID_PATTERN.test(final.homeLabel)).toBe(false);

    const third = scope.rounds[2].matches[0];
    expect(third.homeLabel).toBe("Przegrany półfinału 1");
  });

  it("wynik trafia do widoku wraz ze zwycięzcą", async () => {
    const before = await getPlayoffState(refId);
    const sf = before.scopes[0].rounds[0].matches[0];

    await savePlayoffMatchResult({
      tournamentId: refId,
      matchExternalId: sf.externalId,
      homeScore: 5,
      awayScore: 2,
    });

    const after = await getPlayoffState(refId);
    const updated = after.scopes[0].rounds[0].matches[0];

    expect(updated.homeScore).toBe(5);
    expect(updated.isFinished).toBe(true);
    expect(updated.winnerTeamId).toBe("a1");
  });

  it("kolejna runda wypełnia się NATYCHMIAST, bez zamykania rundy", async () => {
    const state = await getPlayoffState(refId);
    const scope = state.scopes[0];

    // Faza wciąż półfinałowa...
    expect(state.phase).toBe("semifinal");

    // ...ale zwycięzca rozegranego półfinału już jest w finale.
    expect(scope.rounds[1].matches[0].home?.teamId).toBe("a1");
    // Drugi slot nadal czeka.
    expect(scope.rounds[1].matches[0].away).toBeNull();
    // Drugi slot finału czeka na zwycięzcę DRUGIEGO półfinału.
    expect(scope.rounds[1].matches[0].awayLabel).toBe(
      "Zwycięzca półfinału 2"
    );
  });

  /* --- J: niezależność grup --------------------------------------------- */

  it("grupy A i B mają niezależne scope'y", async () => {
    const state = await getPlayoffState(refId);

    expect(state.scopes.map((s) => s.groupKey)).toEqual(["A", "B"]);

    const teamsA = state.scopes[0].rounds.flatMap((r) =>
      r.matches.flatMap((m) => [m.home?.teamId, m.away?.teamId])
    );

    expect(teamsA.every((id) => !id || id.startsWith("a"))).toBe(true);
    // Wynik wpisany w grupie A nie pojawił się w grupie B.
    expect(state.scopes[1].rounds[0].matches[0].isFinished).toBe(false);
  });

  /* --- N, P: minigrupa --------------------------------------------------- */

  it("minigrupa ma nazwy i loga zamiast identyfikatorów", async () => {
    const state = await getPlayoffState(refId);
    const placement = state.scopes[0].placement!;

    expect(placement.positionFrom).toBe(5);
    expect(placement.positionTo).toBe(7);
    expect(placement.matches).toHaveLength(3);

    for (const match of placement.matches) {
      expect(match.home.name).toMatch(/^Drużyna A/);
      expect(match.home.logoUrl).toContain("res.cloudinary.com");
      expect(UUID_PATTERN.test(JSON.stringify(match))).toBe(false);
    }

    expect(placement.standings[0].teamName).toMatch(/^Drużyna A/);
  });

  it("cały read model nie zawiera wewnętrznych UUID-ów", async () => {
    const state = await getPlayoffState(refId);

    expect(UUID_PATTERN.test(JSON.stringify(state))).toBe(false);
  });

  /* --- T, U, V, W: tła --------------------------------------------------- */

  it("zapisuje i usuwa tło drabinki oraz podium", async () => {
    await setPlayoffAsset({
      tournamentId: refId,
      kind: "playoff_bracket_background",
      asset: {
        url: "https://res.cloudinary.com/demo/bracket.png",
        publicId: "tournaments/x/bracket",
        mimeType: "image/png",
        fileName: "bracket.png",
      },
    });

    await setPlayoffAsset({
      tournamentId: refId,
      kind: "podium_background",
      asset: {
        url: "https://res.cloudinary.com/demo/podium.png",
        publicId: "tournaments/x/podium",
        mimeType: "image/png",
        fileName: "podium.png",
      },
    });

    let state = await getPlayoffState(refId);
    expect(state.bracketBackgroundUrl).toBe(
      "https://res.cloudinary.com/demo/bracket.png"
    );
    expect(state.podiumBackgroundUrl).toBe(
      "https://res.cloudinary.com/demo/podium.png"
    );

    // Ponowny zapis nadpisuje, nie duplikuje.
    await setPlayoffAsset({
      tournamentId: refId,
      kind: "playoff_bracket_background",
      asset: {
        url: "https://res.cloudinary.com/demo/bracket2.png",
        publicId: "tournaments/x/bracket",
        mimeType: "image/png",
        fileName: "bracket2.png",
      },
    });

    state = await getPlayoffState(refId);
    expect(state.bracketBackgroundUrl).toBe(
      "https://res.cloudinary.com/demo/bracket2.png"
    );

    await setPlayoffAsset({
      tournamentId: refId,
      kind: "playoff_bracket_background",
      asset: null,
    });

    state = await getPlayoffState(refId);
    expect(state.bracketBackgroundUrl).toBeNull();
    // Usunięcie jednego tła nie rusza drugiego.
    expect(state.podiumBackgroundUrl).not.toBeNull();
  });

  /* --- Q, R: podium ------------------------------------------------------ */

  it("klasyfikacja końcowa jest kompletna dopiero po zakończeniu turnieju", async () => {
    // przed zakończeniem
    let state = await getPlayoffState(refId);
    expect(state.isCompleted).toBe(false);
    expect(state.scopes[0].classification?.complete).toBe(false);

    // dograj wszystko
    for (const scope of state.scopes) {
      for (const match of scope.rounds[0].matches) {
        if (!match.isFinished) {
          await savePlayoffMatchResult({
            tournamentId: refId,
            matchExternalId: match.externalId,
            homeScore: 3,
            awayScore: 1,
          });
        }
      }
    }

    await completeCurrentRound(refId);

    state = await getPlayoffState(refId);

    for (const scope of state.scopes) {
      await savePlayoffMatchResult({
        tournamentId: refId,
        matchExternalId: scope.rounds[1].matches[0].externalId,
        homeScore: 4,
        awayScore: 2,
      });
      await savePlayoffMatchResult({
        tournamentId: refId,
        matchExternalId: scope.rounds[2].matches[0].externalId,
        homeScore: 3,
        awayScore: 1,
      });
      for (const match of scope.placement!.matches) {
        await savePlayoffMatchResult({
          tournamentId: refId,
          matchExternalId: match.externalId,
          homeScore: 2,
          awayScore: 1,
        });
      }
    }

    await completeTournament(refId);

    state = await getPlayoffState(refId);

    expect(state.isCompleted).toBe(true);
    expect(state.phaseLabel).toBe("Zakończony");

    const classification = state.scopes[0].classification!;
    expect(classification.complete).toBe(true);

    // podium 1-3 z danymi prezentacyjnymi
    const podium = classification.entries.filter(
      (entry) => entry.position !== null && entry.position <= 3
    );
    expect(podium).toHaveLength(3);
    expect(podium[0].team.name).toMatch(/^Drużyna A/);
    expect(podium[0].team.logoUrl).toContain("res.cloudinary.com");

    // miejsca 4+
    const rest = classification.entries.filter(
      (entry) => entry.position !== null && entry.position > 3
    );
    expect(rest.map((entry) => entry.position)).toEqual([4, 5, 6, 7]);
    expect(rest.every((entry) => entry.team.name.startsWith("Drużyna"))).toBe(
      true
    );
  });
});

/* ==========================================================================
 * WARIANTY PREZENTACJI
 * ======================================================================== */

describe.skipIf(!hasDatabase)("warianty prezentacji", () => {
  let originalCurrentId: string | null = null;

  beforeAll(async () => {
    originalCurrentId = await readCurrentTournamentId();
  });

  afterAll(async () => {
    const db = getDb();

    try {
      await deleteOwnFixtures("vitest-", originalCurrentId);
    } finally {
      await restoreCurrentTournament(originalCurrentId);
    }
  });

  /* --- E, F, G, H: rozmiary drabinki ------------------------------------ */

  it.each([
    [2, ["final"]],
    [4, ["semifinal", "final"]],
    [8, ["quarterfinal", "semifinal", "final"]],
    [16, ["round_of_16", "quarterfinal", "semifinal", "final"]],
  ])("drabinka %i-drużynowa ma rundy %j", async (size, expected) => {
    const id = await makeTournament(
      `Vitest Bracket ${size}`,
      ["A"],
      size as number,
      {
        ...CONFIG,
        qualifiedTeamCount: size as 2 | 4 | 8 | 16,
        thirdPlaceMatch: false,
        placementMode: "none",
      }
    );

    await completeGroupStage(id);

    const state = await getPlayoffState(id);

    expect(state.scopes[0].rounds.map((r) => r.kind)).toEqual(expected);

    // Liczba meczów maleje o połowę w każdej rundzie.
    const counts = state.scopes[0].rounds.map((r) => r.matches.length);
    expect(counts[counts.length - 1]).toBe(1);
  });

  /* --- K: single --------------------------------------------------------- */

  it("structure=single nie ujawnia języka grupowego", async () => {
    const created = await postgresRepository.createTournament({
      title: "Vitest Single Public",
      settings: {
        structure: "single",
        format: "group_playoff",
        playoffConfig: { ...CONFIG, placementMode: "none" },
      scorersEnabled: true,
      },
    });

    const teams = teamsOf("S", 4);

    await postgresRepository.saveTournament(created.id, {
      id: "ignored",
      title: "Vitest Single Public",
      scorers: [],
      assets: {
        scheduleImage: "",
        scheduleImageType: "",
        scheduleImageName: "",
        regulationImage: "",
        regulationImageType: "",
        regulationImageName: "",
      },
      groups: [
        {
          key: "__main__",
          name: "Klasyfikacja",
          teams,
          matches: roundRobin("__main__", teams),
        },
      ],
    });

    await completeGroupStage(created.id);

    const state = await getPlayoffState(created.id);

    expect(state.scopes).toHaveLength(1);
    expect(state.scopes[0].groupName).not.toContain("Grupa");
    expect(state.scopes[0].rounds.length).toBeGreaterThan(0);
  });

  /* --- O: minigrupa 5 drużyn -------------------------------------------- */

  it("minigrupa 5 drużyn daje zakres miejsc 5–9", async () => {
    const id = await makeTournament("Vitest Placement Five", ["A"], 9);

    await completeGroupStage(id);

    const state = await getPlayoffState(id);
    const placement = state.scopes[0].placement!;

    expect(placement.teamIds).toHaveLength(5);
    expect(placement.positionFrom).toBe(5);
    expect(placement.positionTo).toBe(9);
    expect(placement.matches).toHaveLength(10);
  });

  /* --- S: shared 3-4 bez meczu o 3. miejsce ------------------------------ */

  it("bez meczu o 3. miejsce rozstrzyga zamrożona tabela grupowa", async () => {
    const id = await makeTournament("Vitest Shared Third", ["A"], 4, {
      ...CONFIG,
      thirdPlaceMatch: false,
      placementMode: "none",
    });

    await completeGroupStage(id);

    let state = await getPlayoffState(id);

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

    await savePlayoffMatchResult({
      tournamentId: id,
      matchExternalId: state.scopes[0].rounds[1].matches[0].externalId,
      homeScore: 3,
      awayScore: 0,
    });

    await completeTournament(id);
    state = await getPlayoffState(id);

    const classification = state.scopes[0].classification!;

    /*
      ZMIANA REGUŁY DOMENOWEJ.

      Wcześniej przegrani półfinałów dzielili miejsca 3-4. Teraz szereguje
      ich zamrożona tabela grupowa — bez rozgrywania fikcyjnego meczu
      i bez wymyślania wyniku. Dzięki temu klasyfikacja nie ma dziur.
    */
    const positions = classification.entries
      .map((entry) => entry.position)
      .filter((position): position is number => position !== null)
      .sort((a, b) => a - b);

    expect(positions).toEqual([1, 2, 3, 4]);
    expect(classification.entries.every((entry) => !entry.shared)).toBe(true);

    const snapshotOrder = (state.scopes[0].snapshot ?? []).map(
      (entry) => entry.teamId
    );

    const third = classification.entries.find((entry) => entry.position === 3)!;
    const fourth = classification.entries.find((entry) => entry.position === 4)!;

    // Trzecie miejsce należy do tego półfinalisty, który był wyżej w grupie.
    expect(snapshotOrder.indexOf(third.team.teamId)).toBeLessThan(
      snapshotOrder.indexOf(fourth.team.teamId)
    );
  });

  /* --- A, X: liga bez sekcji pucharowych --------------------------------- */

  it("turniej ligowy nie ma stanu pucharowego", async () => {
    const created = await postgresRepository.createTournament({
      title: "Vitest League Public",
      settings: {
        structure: "groups",
        format: "league",
        playoffConfig: null,
        scorersEnabled: true,
      },
    });

    const state = await getPlayoffState(created.id);

    expect(state.format).toBe("league");
    expect(state.config).toBeNull();
    expect(state.scopes.every((scope) => scope.rounds.length === 0)).toBe(true);
    expect(state.scopes.every((scope) => scope.preview === null)).toBe(true);
    expect(state.scopes.every((scope) => scope.classification === null)).toBe(
      true
    );
  });
});
