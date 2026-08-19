import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { matches as matchesTable } from "@/lib/db/schema";
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
import { getRewindConfirmationCopy } from "@/lib/playoff/rewind-copy";
import type { Match, Team } from "@/types/tournament";
import {
  deleteOwnFixtures,
  readCurrentTournamentId,
  restoreCurrentTournament,
} from "./helpers/current-tournament";

const hasDatabase = Boolean(process.env.DATABASE_URL);

/** Ile meczow turnieju ma wpisany wynik — na wszystkich etapach. */
async function countScored(tournamentId: string) {
  const [row] = await getDb()
    .select({ n: sql<number>`count(${matchesTable.homeScore})::int` })
    .from(matchesTable)
    .where(eq(matchesTable.tournamentId, tournamentId));

  return row.n;
}

/**
 * TEKST OKNA COFANIA FAZY.
 *
 * Kazde zdanie musi odpowiadac temu, co silnik NAPRAWDE robi:
 *
 *   completed -> final   kasuje wylacznie znacznik zakonczenia,
 *                        zaden wynik nie jest usuwany,
 *   final -> semifinal   zeruje wyniki finalow i meczu o 3. miejsce,
 *                        minigrupa i wczesniejsze rundy zostaja,
 *   -> group_stage       rozmontowuje drabinke, minigrupe i rozstawienie,
 *                        wyniki grupowe zostaja.
 */

const COMPLETED_TO_FINAL = getRewindConfirmationCopy({
  currentPhase: "completed",
  targetPhase: "final",
  targetLabel: "Finały",
  // Silnik nie kasuje tu zadnego wyniku - kinds dla "completed" sa puste.
  resultsToDiscard: 0,
  removesBracket: false,
  thirdPlaceMatch: true,
});

const FINAL_TO_SEMIFINAL = getRewindConfirmationCopy({
  currentPhase: "final",
  targetPhase: "semifinal",
  targetLabel: "Półfinały",
  resultsToDiscard: 4,
  removesBracket: false,
  thirdPlaceMatch: true,
});

const SEMIFINAL_TO_GROUP = getRewindConfirmationCopy({
  currentPhase: "semifinal",
  targetPhase: "group_stage",
  targetLabel: "Faza grupowa",
  resultsToDiscard: 6,
  removesBracket: true,
  thirdPlaceMatch: true,
});

const ALL = [COMPLETED_TO_FINAL, FINAL_TO_SEMIFINAL, SEMIFINAL_TO_GROUP];

describe("I-L: powrot z zakonczonego turnieju", () => {
  it("K: tytul nazywa faze docelowa wprost", () => {
    expect(COMPLETED_TO_FINAL.title).toBe("Cofnąć turniej do finałów?");
  });

  it("I: zniknelo zdanie o pustym etapie", () => {
    const text = COMPLETED_TO_FINAL.lines.join(" ");

    expect(text).not.toContain("bieżący etap");
    expect(text).not.toContain("pusty");
  });

  it("L: opisuje realny skutek - turniej przestaje byc zakonczony", () => {
    const text = COMPLETED_TO_FINAL.lines.join(" ");

    expect(text).toContain("przestanie być oznaczony jako zakończony");
    // Silnik naprawde nic tu nie kasuje.
    expect(text).toContain("Wszystkie wpisane wyniki pozostaną zapisane");
    expect(text).toContain("Klasyfikacja końcowa zniknie");
  });
});

describe("M/N: cofniecie o jedna runde", () => {
  it("M: nazywa dokladnie te rundy, ktorych wyniki znikna", () => {
    const text = FINAL_TO_SEMIFINAL.lines.join(" ");

    expect(text).toContain("Wyniki finałów i meczów o 3. miejsce");
    expect(text).toContain("(4)");
  });

  it("N: nie obiecuje usuniecia minigrupy, ktorej silnik nie rusza", () => {
    const text = FINAL_TO_SEMIFINAL.lines.join(" ");

    expect(text).toContain("minigrupy pozostaną zapisane");
  });

  it("bez meczu o 3. miejsce mowi wylacznie o finalach", () => {
    const copy = getRewindConfirmationCopy({
      currentPhase: "final",
      targetPhase: "semifinal",
      targetLabel: "Półfinały",
      resultsToDiscard: 2,
      removesBracket: false,
      thirdPlaceMatch: false,
    });

    expect(copy.lines[0]).toContain("Wyniki finałów zostaną usunięte");
    expect(copy.lines[0]).not.toContain("3. miejsce");
  });

  it("pusta runda nie dostaje zdania o kasowaniu wynikow", () => {
    const copy = getRewindConfirmationCopy({
      currentPhase: "final",
      targetPhase: "semifinal",
      targetLabel: "Półfinały",
      resultsToDiscard: 0,
      removesBracket: false,
      thirdPlaceMatch: true,
    });

    expect(copy.lines[0]).not.toContain("zostaną usunięte");
    expect(copy.lines[0]).toContain("do rozegrania");
  });
});

describe("N: rozmontowanie drabinki", () => {
  it("mowi o drabince i minigrupie razem z liczba wynikow", () => {
    const text = SEMIFINAL_TO_GROUP.lines.join(" ");

    expect(SEMIFINAL_TO_GROUP.title).toBe("Cofnąć do fazy grupowej?");
    expect(text).toContain("Drabinka i minigrupa zostaną usunięte");
    expect(text).toContain("(6)");
    expect(text).toContain("Wyniki fazy grupowej pozostaną zapisane");
  });
});

describe("J: jezyk bez technicznego zargonu", () => {
  it("J: zero identyfikatorow i pojec wewnetrznych", () => {
    for (const copy of ALL) {
      const text = `${copy.title} ${copy.lines.join(" ")}`;

      expect(text).not.toMatch(/po-[A-Z]-/);
      expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
      expect(text.toLowerCase()).not.toContain("snapshot");
      expect(text.toLowerCase()).not.toContain("downstream");
      expect(text.toLowerCase()).not.toContain("propagacj");
      expect(text.toLowerCase()).not.toContain("bracket");
    }
  });

  it("modal zostaje krotki", () => {
    for (const copy of ALL) {
      expect(copy.lines.length).toBeLessThanOrEqual(3);

      for (const line of copy.lines) {
        expect(line.length).toBeLessThanOrEqual(110);
      }
    }
  });

  it("tytul zawsze jest pytaniem o konkretna faze", () => {
    for (const copy of ALL) {
      expect(copy.title.startsWith("Cofnąć")).toBe(true);
      expect(copy.title.endsWith("?")).toBe(true);
      expect(copy.title).not.toContain("poprzedniej fazy");
    }
  });
});

/* ==========================================================================
 * WERYFIKACJA NA PRAWDZIWYM SILNIKU
 * ======================================================================== */

describe.skipIf(!hasDatabase)("N: tekst zgadza sie z realnym cofnieciem", () => {
  let id = "";
  let originalCurrentId: string | null = null;

  beforeAll(async () => {
    originalCurrentId = await readCurrentTournamentId();

    const teams: Team[] = Array.from({ length: 7 }, (_, index) => ({
      id: `a${index + 1}`,
      name: `A${index + 1}`,
      sourceOrder: index + 1,
    }));

    const matches: Match[] = [];
    for (let i = 0; i < teams.length; i += 1) {
      for (let j = i + 1; j < teams.length; j += 1) {
        matches.push({
          id: `A-${teams[i].id}-${teams[j].id}`,
          group: "A",
          homeTeamId: teams[i].id,
          awayTeamId: teams[j].id,
          homeScore: 1,
          awayScore: 0,
        });
      }
    }

    const created = await postgresRepository.createTournament({
      title: "Vitest Rewindcopy Cup",
      settings: {
        structure: "groups",
        format: "group_playoff",
        playoffConfig: {
          qualifiedTeamCount: 4,
          thirdPlaceMatch: true,
          placementMode: "placement_group",
          tieBreaker: "penalties",
        },
        scorersEnabled: false,
      },
    });

    id = created.id;

    await postgresRepository.saveTournament(id, {
      id: "ignored",
      title: "Vitest Rewindcopy Cup",
      scorers: [],
      assets: {},
      groups: [{ key: "A", name: "Grupa A", teams, matches }],
    });

    await completeGroupStage(id);

    const semis = (await getPlayoffState(id)).scopes[0].rounds.find(
      (round) => round.kind === "semifinal"
    )!;

    for (const match of semis.matches) {
      await savePlayoffMatchResult({
        tournamentId: id,
        matchExternalId: match.externalId,
        homeScore: 3,
        awayScore: 1,
      });
    }

    await completeCurrentRound(id);

    const scope = (await getPlayoffState(id)).scopes[0];

    for (const kind of ["final", "third_place"] as const) {
      const round = scope.rounds.find((item) => item.kind === kind)!;
      await savePlayoffMatchResult({
        tournamentId: id,
        matchExternalId: round.matches[0].externalId,
        homeScore: 4,
        awayScore: 2,
      });
    }

    for (const match of scope.placement!.matches) {
      await savePlayoffMatchResult({
        tournamentId: id,
        matchExternalId: match.externalId,
        homeScore: 2,
        awayScore: 1,
      });
    }

    await completeTournament(id);
  });

  afterAll(async () => {
    try {
      await deleteOwnFixtures("vitest-rewindcopy", originalCurrentId);
    } finally {
      await restoreCurrentTournament(originalCurrentId);
    }
  });

  it("N: cofniecie z zakonczonego NIE kasuje ani jednego wyniku", async () => {
    const impact = await describeReopen(id);

    // To jest liczba, na ktorej opiera sie tekst okna.
    expect(impact.resultsToDiscard).toBe(0);
    expect(impact.removesBracket).toBe(false);
    expect(impact.targetPhase).toBe("final");

    const before = await countScored(id);

    await reopenPreviousPhase({ tournamentId: id, confirmDataLoss: true });

    const state = await getPlayoffState(id);

    // Obietnica z okna: wszystkie wyniki zostaja, znika sam znacznik konca.
    expect(await countScored(id)).toBe(before);
    expect(state.phase).toBe("final");
    expect(state.isCompleted).toBe(false);
    expect(state.completionToken).toBeNull();
  });

  it("N: cofniecie z finalow kasuje dokladnie zapowiedziana liczbe", async () => {
    const impact = await describeReopen(id);

    // Final + mecz o 3. miejsce.
    expect(impact.resultsToDiscard).toBe(2);
    expect(impact.targetPhase).toBe("semifinal");

    const copy = getRewindConfirmationCopy({
      currentPhase: "final",
      targetPhase: impact.targetPhase,
      targetLabel: impact.targetLabel,
      resultsToDiscard: impact.resultsToDiscard,
      removesBracket: impact.removesBracket,
      thirdPlaceMatch: true,
    });

    expect(copy.lines[0]).toContain("(2)");

    const before = await countScored(id);

    await reopenPreviousPhase({ tournamentId: id, confirmDataLoss: true });

    // Zniknely dokladnie dwa wyniki - ani jeden wiecej.
    expect(await countScored(id)).toBe(before - 2);

    // Obietnica: minigrupa i wczesniejsze rundy zostaja.
    const scope = (await getPlayoffState(id)).scopes[0];

    expect(
      scope.placement?.matches.every((match) => match.homeScore !== null)
    ).toBe(true);
    expect(
      scope.rounds
        .find((round) => round.kind === "semifinal")!
        .matches.every((match) => match.homeScore !== null)
    ).toBe(true);
  });
});
