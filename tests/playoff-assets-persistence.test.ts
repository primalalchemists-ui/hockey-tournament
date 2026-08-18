import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { tournamentAssets, tournaments } from "@/lib/db/schema";
import { postgresRepository } from "@/lib/data/postgres/repository";
import {
  getPlayoffState,
  setPlayoffAsset,
} from "@/lib/data/postgres/playoff-engine";
import type { Tournament } from "@/types/tournament";
import type { TournamentSettings } from "@/types/tournament-config";
import {
  deleteOwnFixtures,
  readCurrentTournamentId,
  restoreCurrentTournament,
} from "./helpers/current-tournament";

/**
 * TRWAŁOŚĆ GRAFIK PLAY-OFF.
 *
 * Realny błąd: upload do Cloudinary działał, setPlayoffAsset zapisywał
 * wiersz, a kolejne kliknięcie „Zapisz" w panelu go kasowało. Tła drabinki
 * i podium leżą w tej samej tabeli co harmonogram czy hero, ale NIE są
 * częścią draftu panelu — kasowanie „nieobecnych" zabierało je razem
 * z rodzajami, których payload rzeczywiście dotyczy.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);

const SETTINGS: TournamentSettings = {
  structure: "groups",
  format: "group_playoff",
  playoffConfig: {
    qualifiedTeamCount: 4,
    thirdPlaceMatch: true,
    placementMode: "placement_group",
    tieBreaker: "penalties",
  },
  scorersEnabled: false,
};

const BRACKET_URL = "https://res.cloudinary.com/demo/image/upload/v1/bracket-bg.jpg";
const PODIUM_URL = "https://res.cloudinary.com/demo/image/upload/v1/podium-bg.jpg";

function payload(id: string, title: string): Tournament {
  return {
    id,
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
      {
        key: "A",
        name: "Grupa A",
        teams: [
          { id: "pa-1", name: "Drużyna 1", shortName: "D1", logoText: "D1", sourceOrder: 1 },
          { id: "pa-2", name: "Drużyna 2", shortName: "D2", logoText: "D2", sourceOrder: 2 },
        ],
        matches: [],
      },
    ],
  };
}

async function assetRow(tournamentId: string, kind: string) {
  const rows = await getDb()
    .select()
    .from(tournamentAssets)
    .where(
      and(
        eq(tournamentAssets.tournamentId, tournamentId),
        eq(tournamentAssets.kind, kind)
      )
    );

  return rows[0] ?? null;
}

async function revisionOf(tournamentId: string) {
  const rows = await getDb()
    .select({ revision: tournaments.publicRevision })
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId));

  return rows[0].revision;
}

describe.skipIf(!hasDatabase)("grafiki play-off przeżywają zapis turnieju", () => {
  let originalCurrentId: string | null = null;
  let tournamentA = "";
  let tournamentB = "";

  beforeAll(async () => {
    originalCurrentId = await readCurrentTournamentId();

    tournamentA = (
      await postgresRepository.createTournament({
        title: "Vitest Assets A",
        settings: SETTINGS,
      })
    ).id;

    tournamentB = (
      await postgresRepository.createTournament({
        title: "Vitest Assets B",
        settings: SETTINGS,
      })
    ).id;

    await postgresRepository.saveTournament(
      tournamentA,
      payload(tournamentA, "Vitest Assets A")
    );
    await postgresRepository.saveTournament(
      tournamentB,
      payload(tournamentB, "Vitest Assets B")
    );
  });

  afterAll(async () => {
    try {
      await deleteOwnFixtures("vitest-assets", originalCurrentId);
    } finally {
      await restoreCurrentTournament(originalCurrentId);
    }
  });

  it("A/C: zapis tła drabinki i podium trafia do bazy", async () => {
    await setPlayoffAsset({
      tournamentId: tournamentA,
      kind: "playoff_bracket_background",
      asset: {
        url: BRACKET_URL,
        publicId: "tournaments/vitest-bracket",
        mimeType: "image/jpeg",
        fileName: "bracket.jpg",
      },
    });

    await setPlayoffAsset({
      tournamentId: tournamentA,
      kind: "podium_background",
      asset: {
        url: PODIUM_URL,
        publicId: "tournaments/vitest-podium",
        mimeType: "image/jpeg",
        fileName: "podium.jpg",
      },
    });

    expect((await assetRow(tournamentA, "playoff_bracket_background"))?.url).toBe(
      BRACKET_URL
    );
    expect((await assetRow(tournamentA, "podium_background"))?.url).toBe(
      PODIUM_URL
    );
  });

  it("B/D: świeży odczyt repozytorium zwraca obie grafiki", async () => {
    const state = await getPlayoffState(tournamentA);

    expect(state.bracketBackgroundUrl).toBe(BRACKET_URL);
    expect(state.podiumBackgroundUrl).toBe(PODIUM_URL);
  });

  it("E/F: zapis turnieju po zapisie grafik NIE kasuje ich", async () => {
    // Dokładnie to robi przycisk „Zapisz" w panelu.
    await postgresRepository.saveTournament(
      tournamentA,
      payload(tournamentA, "Vitest Assets A")
    );

    expect((await assetRow(tournamentA, "playoff_bracket_background"))?.url).toBe(
      BRACKET_URL
    );
    expect((await assetRow(tournamentA, "podium_background"))?.url).toBe(
      PODIUM_URL
    );

    const state = await getPlayoffState(tournamentA);
    expect(state.bracketBackgroundUrl).toBe(BRACKET_URL);
    expect(state.podiumBackgroundUrl).toBe(PODIUM_URL);
  });

  it("zapis nadal czyści rodzaje, którymi panel FAKTYCZNIE zarządza", async () => {
    const db = getDb();

    await db.insert(tournamentAssets).values({
      tournamentId: tournamentA,
      kind: "hero_banner",
      url: "https://res.cloudinary.com/demo/image/upload/v1/hero.jpg",
      publicId: "tournaments/vitest-hero",
    });

    // Payload bez hero = admin usunął baner. To ma zadziałać jak dotąd.
    await postgresRepository.saveTournament(
      tournamentA,
      payload(tournamentA, "Vitest Assets A")
    );

    expect(await assetRow(tournamentA, "hero_banner")).toBeNull();
    // ...ale grafiki play-off zostają nietknięte.
    expect(await assetRow(tournamentA, "playoff_bracket_background")).not.toBeNull();
  });

  it("G/H: grafika trafia do WSKAZANEGO turnieju i nie wycieka do innego", async () => {
    const stateB = await getPlayoffState(tournamentB);

    expect(stateB.bracketBackgroundUrl).toBeNull();
    expect(stateB.podiumBackgroundUrl).toBeNull();

    const rows = await getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(tournamentAssets)
      .where(eq(tournamentAssets.tournamentId, tournamentB));

    expect(rows[0].n).toBe(0);
  });

  it("L: ustawienie i usunięcie grafiki podnosi wersję publiczną", async () => {
    const before = await revisionOf(tournamentB);

    await setPlayoffAsset({
      tournamentId: tournamentB,
      kind: "podium_background",
      asset: {
        url: PODIUM_URL,
        publicId: "tournaments/vitest-podium-b",
        mimeType: null,
        fileName: null,
      },
    });

    const afterSet = await revisionOf(tournamentB);
    expect(afterSet).toBeGreaterThan(before);

    await setPlayoffAsset({
      tournamentId: tournamentB,
      kind: "podium_background",
      asset: null,
    });

    expect(await revisionOf(tournamentB)).toBeGreaterThan(afterSet);
  });

  it("K: jawne usunięcie grafiki faktycznie ją kasuje", async () => {
    expect(await assetRow(tournamentB, "podium_background")).toBeNull();
  });
});

describe.skipIf(!hasDatabase)("I/J: odczyt publiczny i panel", () => {
  it("I: snapshot publiczny bierze grafiki z tej samej tabeli", async () => {
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync(
        new URL("../lib/data/postgres/playoff-engine.ts", import.meta.url),
        "utf8"
      )
    );

    // Jedno źródło prawdy: read model czyta assety po rodzaju.
    expect(source).toContain('a.kind === "playoff_bracket_background"');
    expect(source).toContain('a.kind === "podium_background"');
  });

  it("J: panel renderuje grafikę na podstawie stanu z serwera", async () => {
    const shell = await import("node:fs").then((fs) =>
      fs.readFileSync(
        new URL("../components/admin/admin-shell.tsx", import.meta.url),
        "utf8"
      )
    );

    // Manager dostaje URL z read modelu i WYBRANY turniej, nie publiczny.
    expect(shell).toContain("currentUrl={playoffState.bracketBackgroundUrl}");
    expect(shell).toContain("currentUrl={playoffState.podiumBackgroundUrl}");
    expect(shell).toContain("tournamentId={tournamentId}");
  });

  it("nazwy rodzajów są identyczne w każdej warstwie", async () => {
    const fs = await import("node:fs");
    const read = (path: string) =>
      fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

    const files = [
      "lib/data/postgres/playoff-engine.ts",
      "app/admin/actions.ts",
      "components/admin/admin-shell.tsx",
    ];

    for (const file of files) {
      const code = read(file);

      expect(code).toContain("playoff_bracket_background");
      expect(code).toContain("podium_background");
      // Żadnej skróconej wariacji nazwy.
      expect(code).not.toMatch(/"playoff_background"/);
    }
  });
});

describe.skipIf(!hasDatabase)("M: Rabbit Cup nietknięty", () => {
  it("zachowuje komplet swoich sześciu grafik", async () => {
    const db = getDb();

    const [rabbit] = await db
      .select({ id: tournaments.id })
      .from(tournaments)
      .where(eq(tournaments.slug, "rabbit-cup"));

    const rows = await db
      .select({ kind: tournamentAssets.kind })
      .from(tournamentAssets)
      .where(eq(tournamentAssets.tournamentId, rabbit.id));

    expect(rows.map((row) => row.kind).sort()).toEqual([
      "camp_banner",
      "camp_poster_left",
      "camp_poster_right",
      "hero_banner",
      "regulation",
      "schedule",
    ]);
  });
});
