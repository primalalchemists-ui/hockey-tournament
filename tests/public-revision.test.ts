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
  reopenPreviousPhase,
  savePlayoffMatchResult,
  setPlayoffAsset,
} from "@/lib/data/postgres/playoff-engine";
import {
  getPublicSnapshot,
  getPublicVersion,
} from "@/lib/data/postgres/public-snapshot";
import type { Match, Team, Tournament } from "@/types/tournament";
import type { PlayoffConfig } from "@/types/tournament-config";

/**
 * WERSJONOWANIE PUBLICZNEGO STANU.
 *
 * Każda mutacja widoczna dla kibica musi podnieść licznik — inaczej
 * publiczny frontend nigdy nie zauważy zmiany.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);

const CONFIG: PlayoffConfig = {
  qualifiedTeamCount: 4,
  thirdPlaceMatch: true,
  placementMode: "placement_group",
  tieBreaker: "penalties",
};

function teamsOf(key: string, count: number): Team[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${key.toLowerCase()}${index + 1}`,
    name: `Ekipa ${key}${index + 1}`,
    shortName: `${key}${index + 1}`,
    logoText: `${key}${index + 1}`,
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

function payloadOf(title: string, teams: Team[]): Tournament {
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
    groups: [
      { key: "A", name: "Grupa A", teams, matches: roundRobin("A", teams) },
    ],
  };
}

async function revisionOf(tournamentId: string) {
  const rows = await getDb()
    .select({ revision: tournaments.publicRevision })
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId))
    .limit(1);

  return rows[0].revision;
}

describe.skipIf(!hasDatabase)("public revision", () => {
  let originalCurrentId: string | null = null;

  beforeAll(async () => {
    const current = await getDb()
      .select({ id: tournaments.id })
      .from(tournaments)
      .where(eq(tournaments.isCurrent, true))
      .limit(1);

    originalCurrentId = current[0]?.id ?? null;
  });

  afterAll(async () => {
    const db = getDb();

    await db
      .delete(tournaments)
      .where(
        originalCurrentId
          ? and(
              like(tournaments.slug, "vitest-%"),
              sql`${tournaments.id} <> ${originalCurrentId}`
            )
          : like(tournaments.slug, "vitest-%")
      );

    if (originalCurrentId) {
      await db
        .update(tournaments)
        .set({ isCurrent: true })
        .where(eq(tournaments.id, originalCurrentId));
    }
  });

  it("A: nowy turniej startuje z wersją 0", async () => {
    const created = await postgresRepository.createTournament({
      title: "Vitest Revision Zero",
      settings: {
        structure: "groups",
        format: "league",
        playoffConfig: null,
        scorersEnabled: true,
      },
    });

    expect(await revisionOf(created.id)).toBe(0);
  });

  it("B, I, J: zapis danych publicznych podnosi wersję", async () => {
    const created = await postgresRepository.createTournament({
      title: "Vitest Revision Save",
      settings: {
        structure: "groups",
        format: "league",
        playoffConfig: null,
        scorersEnabled: true,
      },
    });

    const before = await revisionOf(created.id);

    const teams = teamsOf("A", 4);
    await postgresRepository.saveTournament(
      created.id,
      payloadOf("Vitest Revision Save", teams)
    );

    const afterMatches = await revisionOf(created.id);
    expect(afterMatches).toBe(before + 1);

    // strzelcy — również widoczni publicznie
    const withScorer = payloadOf("Vitest Revision Save", teams);
    withScorer.scorers = [
      { id: "s1", playerName: "Tester", goals: 3, teamId: teams[0].id },
    ];
    await postgresRepository.saveTournament(created.id, withScorer);
    expect(await revisionOf(created.id)).toBe(afterMatches + 1);

    // ticker + assety
    const withTicker = payloadOf("Vitest Revision Save", teams);
    withTicker.tickerMessage = "Zapraszamy na finał";
    withTicker.assets.scheduleImage = "https://res.cloudinary.com/demo/s.pdf";
    await postgresRepository.saveTournament(created.id, withTicker);
    expect(await revisionOf(created.id)).toBe(afterMatches + 2);
  });

  it("ustawienia turnieju (tytuł/format) podnoszą wersję", async () => {
    const created = await postgresRepository.createTournament({
      title: "Vitest Revision Settings",
      settings: {
        structure: "groups",
        format: "league",
        playoffConfig: null,
        scorersEnabled: true,
      },
    });

    const before = await revisionOf(created.id);

    await postgresRepository.updateTournamentSettings(created.id, {
      title: "Vitest Revision Settings 2026",
    });

    expect(await revisionOf(created.id)).toBe(before + 1);
  });

  it("K: archiwizacja NIE podnosi wersji — kibic tego nie widzi", async () => {
    const created = await postgresRepository.createTournament({
      title: "Vitest Revision Archive",
      settings: {
        structure: "groups",
        format: "league",
        playoffConfig: null,
        scorersEnabled: true,
      },
    });

    const before = await revisionOf(created.id);

    await postgresRepository.setTournamentArchived(created.id, true);
    expect(await revisionOf(created.id)).toBe(before);

    await postgresRepository.setTournamentArchived(created.id, false);
    expect(await revisionOf(created.id)).toBe(before);
  });

  it("C-H: wszystkie operacje silnika pucharowego podnoszą wersję", async () => {
    const created = await postgresRepository.createTournament({
      title: "Vitest Revision Engine",
      settings: {
        structure: "groups",
        format: "group_playoff",
        playoffConfig: CONFIG,
        scorersEnabled: true,
      },
    });

    const teams = teamsOf("A", 7);
    await postgresRepository.saveTournament(
      created.id,
      payloadOf("Vitest Revision Engine", teams)
    );

    // E: completeGroupStage
    let previous = await revisionOf(created.id);
    await completeGroupStage(created.id);
    let current = await revisionOf(created.id);
    expect(current).toBeGreaterThan(previous);

    // C: wynik play-off
    let state = await getPlayoffState(created.id);
    previous = current;
    await savePlayoffMatchResult({
      tournamentId: created.id,
      matchExternalId: state.scopes[0].rounds[0].matches[0].externalId,
      homeScore: 3,
      awayScore: 1,
    });
    current = await revisionOf(created.id);
    expect(current).toBeGreaterThan(previous);

    // D: wynik minigrupy
    previous = current;
    await savePlayoffMatchResult({
      tournamentId: created.id,
      matchExternalId: state.scopes[0].placement!.matches[0].externalId,
      homeScore: 2,
      awayScore: 1,
    });
    current = await revisionOf(created.id);
    expect(current).toBeGreaterThan(previous);

    // J: tło sekcji
    previous = current;
    await setPlayoffAsset({
      tournamentId: created.id,
      kind: "playoff_bracket_background",
      asset: {
        url: "https://res.cloudinary.com/demo/bg.png",
        publicId: "p/bg",
        mimeType: "image/png",
        fileName: "bg.png",
      },
    });
    current = await revisionOf(created.id);
    expect(current).toBeGreaterThan(previous);

    // F: completeCurrentRound
    await savePlayoffMatchResult({
      tournamentId: created.id,
      matchExternalId: state.scopes[0].rounds[0].matches[1].externalId,
      homeScore: 2,
      awayScore: 0,
    });
    previous = await revisionOf(created.id);
    await completeCurrentRound(created.id);
    current = await revisionOf(created.id);
    expect(current).toBeGreaterThan(previous);

    // H: reopenPreviousPhase
    previous = current;
    await reopenPreviousPhase({
      tournamentId: created.id,
      confirmDataLoss: true,
    });
    current = await revisionOf(created.id);
    expect(current).toBeGreaterThan(previous);

    // G: completeTournament — po cofnięciu półfinały trzeba rozegrać ponownie
    state = await getPlayoffState(created.id);

    for (const match of state.scopes[0].rounds[0].matches) {
      if (!match.isFinished) {
        await savePlayoffMatchResult({
          tournamentId: created.id,
          matchExternalId: match.externalId,
          homeScore: 3,
          awayScore: 1,
        });
      }
    }

    await completeCurrentRound(created.id);
    state = await getPlayoffState(created.id);

    await savePlayoffMatchResult({
      tournamentId: created.id,
      matchExternalId: state.scopes[0].rounds[1].matches[0].externalId,
      homeScore: 4,
      awayScore: 1,
    });
    await savePlayoffMatchResult({
      tournamentId: created.id,
      matchExternalId: state.scopes[0].rounds[2].matches[0].externalId,
      homeScore: 3,
      awayScore: 2,
    });
    for (const match of state.scopes[0].placement!.matches) {
      await savePlayoffMatchResult({
        tournamentId: created.id,
        matchExternalId: match.externalId,
        homeScore: 2,
        awayScore: 1,
      });
    }

    previous = await revisionOf(created.id);
    await completeTournament(created.id);
    current = await revisionOf(created.id);
    expect(current).toBeGreaterThan(previous);
  });

  it("L, M: wersja publiczna dotyczy wyświetlanego turnieju", async () => {
    const created = await postgresRepository.createTournament({
      title: "Vitest Revision Current",
      settings: {
        structure: "groups",
        format: "league",
        playoffConfig: null,
        scorersEnabled: true,
      },
    });

    await postgresRepository.saveTournament(
      created.id,
      payloadOf("Vitest Revision Current", teamsOf("A", 4))
    );

    await postgresRepository.setCurrentTournament(created.id);

    const version = await getPublicVersion();

    expect(version.tournamentId).toBe(created.id);
    expect(version.revision).toBe(await revisionOf(created.id));

    // Przełączenie na inny turniej zmienia tournamentId — to wystarcza
    // frontendowi, nawet gdyby wersje obu turniejów były identyczne.
    if (originalCurrentId) {
      await postgresRepository.setCurrentTournament(originalCurrentId);
      const back = await getPublicVersion();
      expect(back.tournamentId).toBe(originalCurrentId);
      expect(back.tournamentId).not.toBe(created.id);
    }
  });

  it("snapshot zwraca spójny stan wraz z wersją", async () => {
    const snapshot = await getPublicSnapshot();

    expect(snapshot).not.toBeNull();
    if (!snapshot) return;

    const version = await getPublicVersion();

    expect(snapshot.tournamentId).toBe(version.tournamentId);
    expect(snapshot.revision).toBe(version.revision);
    expect(snapshot.tournament.groups.length).toBeGreaterThan(0);
    expect(snapshot.settings.format).toBeDefined();
  });

  it("snapshot ligowy nie zawiera stanu pucharowego", async () => {
    const snapshot = await getPublicSnapshot();

    if (!snapshot) throw new Error("brak snapshotu");

    if (snapshot.settings.format === "league") {
      expect(snapshot.playoffState).toBeNull();
    }
  });
});
