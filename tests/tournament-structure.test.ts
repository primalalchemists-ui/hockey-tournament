import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, like, sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { tournaments } from "@/lib/db/schema";
import { postgresRepository } from "@/lib/data/postgres/repository";
import { TournamentOperationError } from "@/lib/data/types";
import { TournamentConfigError, MAIN_POOL_KEY } from "@/types/tournament-config";
import { calculateStandings } from "@/lib/standings";
import { mergeTournamentData } from "@/lib/merge-data";
import type { Tournament } from "@/types/tournament";

/**
 * STRUKTURA I FORMAT TURNIEJU na prawdziwej bazie.
 *
 * Turnieje testowe mają slug "vitest-*" i są usuwane w afterAll.
 * Produkcyjny Rabbit Cup nie jest dotykany.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);

async function readRow(id: string) {
  const rows = await getDb()
    .select({
      structure: tournaments.structure,
      format: tournaments.format,
      playoffConfig: tournaments.playoffConfig,
    })
    .from(tournaments)
    .where(eq(tournaments.id, id))
    .limit(1);

  return rows[0];
}

describe.skipIf(!hasDatabase)("struktura i format turnieju", () => {
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
  });

  /* --- 1-4: cztery kombinacje ------------------------------------------ */

  it("A: single + league tworzy techniczną pulę, nie 'Grupa A'", async () => {
    const created = await postgresRepository.createTournament({
      title: "Vitest Single League",
      settings: { structure: "single", format: "league", playoffConfig: null },
    });

    expect(await readRow(created.id)).toMatchObject({
      structure: "single",
      format: "league",
      playoffConfig: null,
    });

    const result = await postgresRepository.getTournamentById(created.id);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    expect(result.settings.structure).toBe("single");
    expect(result.tournament.groups).toHaveLength(1);
    expect(result.tournament.groups?.[0].key).toBe(MAIN_POOL_KEY);
    // Kluczowe: nigdzie nie pojawia się "Grupa A".
    expect(result.tournament.groups?.[0].name).not.toContain("Grupa");
  });

  it("B: groups + league dostaje automatycznie Grupę A", async () => {
    const created = await postgresRepository.createTournament({
      title: "Vitest Groups League",
      settings: { structure: "groups", format: "league", playoffConfig: null },
    });

    expect(await readRow(created.id)).toMatchObject({
      structure: "groups",
      format: "league",
    });

    const result = await postgresRepository.getTournamentById(created.id);
    if (result.status !== "ok") throw new Error("brak turnieju");

    expect(result.tournament.groups).toHaveLength(1);
    expect(result.tournament.groups?.[0].key).toBe("A");
    expect(result.tournament.groups?.[0].name).toBe("Grupa A");
  });

  it("C: single + group_playoff zapisuje konfigurację", async () => {
    const created = await postgresRepository.createTournament({
      title: "Vitest Single Playoff",
      settings: {
        structure: "single",
        format: "group_playoff",
        playoffConfig: {
          qualifiedTeamCount: 8,
          thirdPlaceMatch: true,
          placementMode: "none",
          tieBreaker: "penalties",
        },
      },
    });

    const result = await postgresRepository.getTournamentById(created.id);
    if (result.status !== "ok") throw new Error("brak turnieju");

    expect(result.settings.structure).toBe("single");
    expect(result.settings.format).toBe("group_playoff");
    expect(result.settings.playoffConfig).toEqual({
      qualifiedTeamCount: 8,
      thirdPlaceMatch: true,
      placementMode: "none",
      tieBreaker: "penalties",
    });
    expect(result.tournament.groups?.[0].key).toBe(MAIN_POOL_KEY);
  });

  it("D: groups + group_playoff zapisuje konfigurację i Grupę A", async () => {
    const created = await postgresRepository.createTournament({
      title: "Vitest Groups Playoff",
      settings: {
        structure: "groups",
        format: "group_playoff",
        playoffConfig: {
          qualifiedTeamCount: 4,
          thirdPlaceMatch: true,
          placementMode: "placement_group",
          tieBreaker: "penalties",
        },
      },
    });

    const result = await postgresRepository.getTournamentById(created.id);
    if (result.status !== "ok") throw new Error("brak turnieju");

    expect(result.settings.playoffConfig?.qualifiedTeamCount).toBe(4);
    expect(result.settings.playoffConfig?.placementMode).toBe("placement_group");
    expect(result.tournament.groups?.[0].key).toBe("A");
  });

  it("odrzuca utworzenie turnieju z niepoprawną konfiguracją", async () => {
    await expect(
      postgresRepository.createTournament({
        title: "Vitest Broken",
        settings: {
          structure: "groups",
          format: "group_playoff",
          // @ts-expect-error celowo niepoprawna wartość
          playoffConfig: { qualifiedTeamCount: 5, thirdPlaceMatch: true, placementMode: "none" },
        },
      })
    ).rejects.toBeInstanceOf(TournamentConfigError);
  });

  /* --- 7: standings dla single ----------------------------------------- */

  it("single działa z niezmienionym calculateStandings", async () => {
    const created = await postgresRepository.createTournament({
      title: "Vitest Single Standings",
      settings: { structure: "single", format: "league", playoffConfig: null },
    });

    const payload: Tournament = {
      id: "ignored",
      title: "Vitest Single Standings",
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
          key: MAIN_POOL_KEY,
          name: "Klasyfikacja",
          teams: [
            { id: "s-1", name: "Alfa", shortName: "AL", logoText: "AL", sourceOrder: 1 },
            { id: "s-2", name: "Beta", shortName: "BE", logoText: "BE", sourceOrder: 2 },
            { id: "s-3", name: "Gamma", shortName: "GA", logoText: "GA", sourceOrder: 3 },
          ],
          matches: [
            { id: "m1", group: MAIN_POOL_KEY, homeTeamId: "s-1", awayTeamId: "s-2", homeScore: 3, awayScore: 0 },
            { id: "m2", group: MAIN_POOL_KEY, homeTeamId: "s-1", awayTeamId: "s-3", homeScore: 1, awayScore: 1 },
            { id: "m3", group: MAIN_POOL_KEY, homeTeamId: "s-2", awayTeamId: "s-3", homeScore: 0, awayScore: 2 },
          ],
        },
      ],
    };

    await postgresRepository.saveTournament(created.id, payload);

    const result = await postgresRepository.getTournamentById(created.id);
    if (result.status !== "ok") throw new Error("brak turnieju");

    const tournament = mergeTournamentData(result.tournament);
    expect(tournament.groups).toHaveLength(1);

    const standings = calculateStandings(tournament.groups[0]);

    expect(standings).toHaveLength(3);
    expect(standings[0].teamId).toBe("s-1");
    expect(standings[0].points).toBe(4);
    expect(standings[1].teamId).toBe("s-3");
    expect(standings[1].points).toBe(4);
    expect(standings[2].teamId).toBe("s-2");
    expect(standings[2].points).toBe(0);
  });

  /* --- 12, 13: zmiany po utworzeniu ------------------------------------ */

  it("structure MOŻNA zmienić, dopóki turniej jest pusty", async () => {
    const created = await postgresRepository.createTournament({
      title: "Vitest Switchable",
      settings: { structure: "groups", format: "league", playoffConfig: null },
    });

    await postgresRepository.updateTournamentSettings(created.id, {
      structure: "single",
      format: "league",
    });

    const result = await postgresRepository.getTournamentById(created.id);
    if (result.status !== "ok") throw new Error("brak turnieju");

    expect(result.settings.structure).toBe("single");
    // Startowa pula również zmienia charakter — nie zostaje po niej "Grupa A".
    expect(result.tournament.groups?.[0].key).toBe(MAIN_POOL_KEY);
  });

  it("structure NIE MOŻE zostać zmienione, gdy turniej ma dane", async () => {
    const created = await postgresRepository.createTournament({
      title: "Vitest Locked",
      settings: { structure: "groups", format: "league", playoffConfig: null },
    });

    await postgresRepository.saveTournament(created.id, {
      id: "ignored",
      title: "Vitest Locked",
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
          key: "A",
          name: "Grupa A",
          teams: [
            { id: "l-1", name: "Alfa", shortName: "AL", logoText: "AL", sourceOrder: 1 },
          ],
          matches: [],
        },
      ],
    });

    await expect(
      postgresRepository.updateTournamentSettings(created.id, {
        structure: "single",
      })
    ).rejects.toBeInstanceOf(TournamentOperationError);

    const result = await postgresRepository.getTournamentById(created.id);
    if (result.status !== "ok") throw new Error("brak turnieju");

    expect(result.settings.structure).toBe("groups");
  });

  it("format i konfigurację play-off można edytować przed startem drabinki", async () => {
    const created = await postgresRepository.createTournament({
      title: "Vitest Editable Format",
      settings: { structure: "groups", format: "league", playoffConfig: null },
    });

    await postgresRepository.updateTournamentSettings(created.id, {
      format: "group_playoff",
      playoffConfig: {
        qualifiedTeamCount: 16,
        thirdPlaceMatch: false,
        placementMode: "none",
        tieBreaker: "penalties",
      },
    });

    let result = await postgresRepository.getTournamentById(created.id);
    if (result.status !== "ok") throw new Error("brak turnieju");

    expect(result.settings.format).toBe("group_playoff");
    expect(result.settings.playoffConfig?.qualifiedTeamCount).toBe(16);

    // powrót do ligi zeruje konfigurację
    await postgresRepository.updateTournamentSettings(created.id, {
      format: "league",
    });

    result = await postgresRepository.getTournamentById(created.id);
    if (result.status !== "ok") throw new Error("brak turnieju");

    expect(result.settings.format).toBe("league");
    expect(result.settings.playoffConfig).toBeNull();
  });

  it("zmiana nazwy przez ustawienia zachowuje tożsamość", async () => {
    const created = await postgresRepository.createTournament({
      title: "Vitest Rename Settings",
      settings: { structure: "groups", format: "league", playoffConfig: null },
    });

    await postgresRepository.updateTournamentSettings(created.id, {
      title: "Vitest Rename Settings 2026",
    });

    const rows = await getDb()
      .select({ id: tournaments.id, title: tournaments.title, slug: tournaments.slug })
      .from(tournaments)
      .where(eq(tournaments.id, created.id))
      .limit(1);

    expect(rows[0].id).toBe(created.id);
    expect(rows[0].title).toBe("Vitest Rename Settings 2026");
    expect(rows[0].slug).toBe("vitest-rename-settings-2026");
  });

  /* --- 11: pusty turniej play-off -------------------------------------- */

  it("pusty turniej play-off z qualified=4 jest dozwolony", async () => {
    const created = await postgresRepository.createTournament({
      title: "Vitest Empty Playoff",
      settings: {
        structure: "groups",
        format: "group_playoff",
        playoffConfig: {
          qualifiedTeamCount: 4,
          thirdPlaceMatch: true,
          placementMode: "placement_group",
          tieBreaker: "penalties",
        },
      },
    });

    const result = await postgresRepository.getTournamentById(created.id);
    if (result.status !== "ok") throw new Error("brak turnieju");

    expect(result.tournament.groups?.[0].teams).toEqual([]);
    expect(result.settings.playoffConfig?.qualifiedTeamCount).toBe(4);
  });

  /* --- 14: backfill Rabbit Cupa ---------------------------------------- */

  it("Rabbit Cup po migracji ma structure=groups i format=league", async () => {
    const rows = await getDb()
      .select({
        structure: tournaments.structure,
        format: tournaments.format,
        playoffConfig: tournaments.playoffConfig,
      })
      .from(tournaments)
      .where(eq(tournaments.slug, "rabbit-cup"))
      .limit(1);

    expect(rows).toHaveLength(1);
    expect(rows[0].structure).toBe("groups");
    expect(rows[0].format).toBe("league");
    expect(rows[0].playoffConfig).toBeNull();

    const result = await postgresRepository.getCurrentTournament();
    if (result.status !== "ok") throw new Error("brak turnieju");

    expect(result.settings).toEqual({
      structure: "groups",
      format: "league",
      playoffConfig: null,
    });
  });
});
