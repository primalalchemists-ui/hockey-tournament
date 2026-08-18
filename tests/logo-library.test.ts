import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, like, sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import {
  teamLogoAliases,
  teamLogoAssets,
  teams,
  tournaments,
} from "@/lib/db/schema";
import { postgresRepository } from "@/lib/data/postgres/repository";
import {
  deleteOwnFixtures,
  readCurrentTournamentId,
  restoreCurrentTournament,
} from "./helpers/current-tournament";
import {
  findLogoByContentHash,
  listLogoLibrary,
  reserveLogoSlug,
  suggestLogosForTeamName,
  upsertLogoAsset,
} from "@/lib/data/postgres/logo-library";
import { normalizeTeamNameForLogoMatching } from "@/lib/logos/normalize";
import type { Tournament } from "@/types/tournament";
import type { TournamentSettings } from "@/types/tournament-config";

/**
 * BIBLIOTEKA LOGOTYPÓW — testy integracyjne.
 *
 * Pracują na własnym turnieju ("vitest-logo-*") i własnych wpisach
 * biblioteki. Rabbit Cup jest wyłącznie CZYTANY.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);

const SETTINGS: TournamentSettings = {
  structure: "groups",
  format: "league",
  playoffConfig: null,
  scorersEnabled: true,
};

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function payload(
  title: string,
  teamsInput: Array<{ id: string; name: string; slug?: string; url?: string }>
): Tournament {
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
      {
        key: "A",
        name: "Grupa A",
        teams: teamsInput.map((team, index) => ({
          id: team.id,
          name: team.name,
          shortName: team.name,
          logoText: "LOGO",
          logoUrl: team.url ?? "",
          logoAssetSlug: team.slug,
          sourceOrder: index + 1,
        })),
        matches: [],
      },
    ],
  };
}

describe.skipIf(!hasDatabase)("biblioteka logotypów", () => {
  let tournamentId = "";
  let assetSlug = "";
  let originalCurrentId: string | null = null;

  beforeAll(async () => {
    originalCurrentId = await readCurrentTournamentId();

    const created = await postgresRepository.createTournament({
      title: "Vitest Logo Cup",
      settings: SETTINGS,
    });

    tournamentId = created.id;

    const { item } = await upsertLogoAsset({
      canonicalName: "Vitest Klub",
      url: "https://res.cloudinary.com/demo/image/upload/v1/team-logos/vitest-klub.png",
      cloudinaryPublicId: "team-logos/vitest-klub",
      contentHash: HASH_A,
    });

    assetSlug = item.slug;
  });

  afterAll(async () => {
    try {
      await deleteOwnFixtures("vitest-logo", originalCurrentId);
      await getDb()
        .delete(teamLogoAssets)
        .where(like(teamLogoAssets.slug, "vitest-klub%"));
    } finally {
      await restoreCurrentTournament(originalCurrentId);
    }
  });

  it("J: identyczna zawartość zwraca istniejący asset", async () => {
    const again = await upsertLogoAsset({
      canonicalName: "Zupełnie Inna Nazwa",
      url: "https://res.cloudinary.com/demo/image/upload/v1/inne.png",
      cloudinaryPublicId: "team-logos/inne",
      contentHash: HASH_A,
    });

    expect(again.reusedExisting).toBe(true);
    expect(again.item.slug).toBe(assetSlug);
    // Nowy wiersz NIE powstał.
    expect(again.item.canonicalName).toBe("Vitest Klub");
  });

  it("K: znany hash jest wykrywany zanim cokolwiek trafi do Cloudinary", async () => {
    const known = await findLogoByContentHash(HASH_A);

    expect(known).not.toBeNull();
    expect(known?.slug).toBe(assetSlug);

    // Kontrakt akcji: sprawdzenie hasha wyprzedza upload_stream.
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync(
        new URL("../app/admin/logo-actions.ts", import.meta.url),
        "utf8"
      )
    );

    expect(source.indexOf("findLogoByContentHash")).toBeLessThan(
      source.indexOf("upload_stream")
    );
  });

  it("M: zajęty slug nie nadpisuje cudzego assetu", async () => {
    const reserved = await reserveLogoSlug("Vitest Klub");

    expect(reserved).not.toBe("vitest-klub");
    expect(reserved.startsWith("vitest-klub-")).toBe(true);
  });

  it("L: nowy asset dostaje public_id w team-logos/", async () => {
    const db = getDb();

    const [row] = await db
      .select({ publicId: teamLogoAssets.cloudinaryPublicId })
      .from(teamLogoAssets)
      .where(eq(teamLogoAssets.slug, assetSlug))
      .limit(1);

    expect(row.publicId).toBe("team-logos/vitest-klub");
  });
});

describe.skipIf(!hasDatabase)("przypisanie logo do drużyn", () => {
  let tournamentId = "";
  let sharedSlug = "";
  let originalCurrentId: string | null = null;

  beforeAll(async () => {
    originalCurrentId = await readCurrentTournamentId();

    const created = await postgresRepository.createTournament({
      title: "Vitest Logo Assign",
      settings: SETTINGS,
    });
    tournamentId = created.id;

    const { item } = await upsertLogoAsset({
      canonicalName: "Vitest Klub Wspólny",
      url: "https://res.cloudinary.com/demo/image/upload/v1/team-logos/vitest-klub-wspolny.png",
      cloudinaryPublicId: "team-logos/vitest-klub-wspolny",
      contentHash: HASH_B,
    });

    sharedSlug = item.slug;
  });

  afterAll(async () => {
    try {
      await deleteOwnFixtures("vitest-logo", originalCurrentId);
      await getDb()
        .delete(teamLogoAssets)
        .where(like(teamLogoAssets.slug, "vitest-klub-wspolny%"));
    } finally {
      await restoreCurrentTournament(originalCurrentId);
    }
  });

  async function teamRows() {
    return getDb()
      .select({
        externalId: teams.externalId,
        name: teams.name,
        logoUrl: teams.logoUrl,
        logoPublicId: teams.logoPublicId,
        logoAssetId: teams.logoAssetId,
      })
      .from(teams)
      .where(eq(teams.tournamentId, tournamentId));
  }

  it("H/O: jeden herb obsługuje wiele drużyn — jeden wiersz, jeden plik", async () => {
    await postgresRepository.saveTournament(
      tournamentId,
      payload("Vitest Logo Assign", [
        { id: "t1", name: "Vitest Klub Wspólny 1", slug: sharedSlug },
        { id: "t2", name: "Vitest Klub Wspólny 2", slug: sharedSlug },
      ])
    );

    const rows = await teamRows();
    const assetIds = new Set(rows.map((row) => row.logoAssetId));

    expect(rows).toHaveLength(2);
    expect(assetIds.size).toBe(1);
    expect([...assetIds][0]).not.toBeNull();

    // Obie drużyny wskazują ten sam plik w Cloudinary.
    expect(new Set(rows.map((row) => row.logoPublicId)).size).toBe(1);
    expect(rows[0].logoUrl).toBe(rows[1].logoUrl);
  });

  it("I: alias powstaje po świadomym przypisaniu", async () => {
    const aliases = await getDb()
      .select({ normalizedAlias: teamLogoAliases.normalizedAlias })
      .from(teamLogoAliases);

    const learned = aliases.map((row) => row.normalizedAlias);

    expect(learned).toContain(
      normalizeTeamNameForLogoMatching("Vitest Klub Wspólny 1")
    );
  });

  it("I: zapamiętany alias daje następnym razem trafienie PEWNE", async () => {
    const result = await suggestLogosForTeamName("Vitest Klub Wspólny 1");

    expect(result.autoSelect?.matchType).toBe("alias");
    expect(result.autoSelect?.logo.slug).toBe(sharedSlug);
  });

  it("P: zapis bez slugu w payloadzie NIE zrywa przypisania", async () => {
    await postgresRepository.saveTournament(
      tournamentId,
      payload("Vitest Logo Assign", [
        {
          id: "t1",
          name: "Vitest Klub Wspólny 1",
          url: "https://res.cloudinary.com/demo/image/upload/v1/team-logos/vitest-klub-wspolny.png",
        },
        {
          id: "t2",
          name: "Vitest Klub Wspólny 2",
          url: "https://res.cloudinary.com/demo/image/upload/v1/team-logos/vitest-klub-wspolny.png",
        },
      ])
    );

    const rows = await teamRows();

    expect(rows.every((row) => row.logoAssetId !== null)).toBe(true);
  });

  it("Q: zmiana nazwy drużyny nie tworzy drugiego logo", async () => {
    const before = (await listLogoLibrary()).length;

    await postgresRepository.saveTournament(
      tournamentId,
      payload("Vitest Logo Assign", [
        { id: "t1", name: "Vitest Klub Wspólny Nowa Nazwa", slug: sharedSlug },
        { id: "t2", name: "Vitest Klub Wspólny 2", slug: sharedSlug },
      ])
    );

    expect((await listLogoLibrary()).length).toBe(before);

    const rows = await teamRows();
    expect(new Set(rows.map((row) => row.logoAssetId)).size).toBe(1);
  });
});

describe.skipIf(!hasDatabase)("N/U/W: istniejące dane Rabbit Cupa", () => {
  it("N: każda drużyna z logo jest podpięta do biblioteki", async () => {
    const db = getDb();

    const [rabbit] = await db
      .select({ id: tournaments.id })
      .from(tournaments)
      .where(eq(tournaments.slug, "rabbit-cup"))
      .limit(1);

    expect(rabbit).toBeTruthy();

    const rows = await db
      .select({
        name: teams.name,
        logoUrl: teams.logoUrl,
        logoAssetId: teams.logoAssetId,
      })
      .from(teams)
      .where(eq(teams.tournamentId, rabbit.id));

    const withLogo = rows.filter((row) => Boolean(row.logoUrl));

    expect(withLogo.length).toBeGreaterThan(0);
    expect(withLogo.every((row) => row.logoAssetId !== null)).toBe(true);
  });

  it("U: obraz z biblioteki jest DOKŁADNIE tym samym plikiem co wcześniej", async () => {
    const db = getDb();

    const rows = await db
      .select({
        teamName: teams.name,
        teamUrl: teams.logoUrl,
        assetUrl: teamLogoAssets.url,
        assetPublicId: teamLogoAssets.cloudinaryPublicId,
        teamPublicId: teams.logoPublicId,
      })
      .from(teams)
      .innerJoin(teamLogoAssets, eq(teams.logoAssetId, teamLogoAssets.id))
      .innerJoin(tournaments, eq(teams.tournamentId, tournaments.id))
      .where(eq(tournaments.slug, "rabbit-cup"));

    expect(rows.length).toBeGreaterThan(0);

    for (const row of rows) {
      // Kolumna drużyny i wiersz biblioteki wskazują ten sam obraz,
      // więc niezależnie od ścieżki odczytu kibic widzi to samo.
      expect(row.teamUrl).toBe(row.assetUrl);
      expect(row.teamPublicId).toBe(row.assetPublicId);
    }
  });

  it("U: publiczny model domenowy zwraca te same adresy co baza", async () => {
    const db = getDb();

    const rows = await db
      .select({ externalId: teams.externalId, logoUrl: teams.logoUrl })
      .from(teams)
      .innerJoin(tournaments, eq(teams.tournamentId, tournaments.id))
      .where(eq(tournaments.slug, "rabbit-cup"));

    const expected = new Map(rows.map((row) => [row.externalId, row.logoUrl]));

    const [rabbit] = await db
      .select({ id: tournaments.id })
      .from(tournaments)
      .where(eq(tournaments.slug, "rabbit-cup"))
      .limit(1);

    const source = await postgresRepository.getTournamentById(rabbit.id);

    if (source.status !== "ok") throw new Error("Nie udało się wczytać turnieju");

    const teamsInModel = (source.tournament.groups ?? []).flatMap(
      (group) => group.teams
    );

    expect(teamsInModel.length).toBeGreaterThan(0);

    for (const team of teamsInModel) {
      if (!expected.has(team.id)) continue;
      expect(team.logoUrl ?? null).toBe(expected.get(team.id));
    }
  });

  it("W: biblioteka jest globalna, ale przypisania zostają przy turnieju", async () => {
    const db = getDb();

    const library = await listLogoLibrary();
    expect(library.length).toBeGreaterThan(0);

    const shared = await db
      .select({
        slug: teamLogoAssets.slug,
        tournamentCount: sql<number>`count(distinct ${teams.tournamentId})::int`,
      })
      .from(teamLogoAssets)
      .leftJoin(teams, eq(teams.logoAssetId, teamLogoAssets.id))
      .groupBy(teamLogoAssets.slug);

    // Ten sam wiersz biblioteki MOŻE obsługiwać wiele turniejów...
    expect(shared.length).toBeGreaterThan(0);

    // ...ale drużyna należy dokładnie do jednego turnieju.
    const perTeam = await db
      .select({ teamId: teams.id, tournamentId: teams.tournamentId })
      .from(teams);

    expect(new Set(perTeam.map((row) => row.teamId)).size).toBe(perTeam.length);
  });
});

describe.skipIf(!hasDatabase)("R: dialog drużyny dostaje propozycje", () => {
  it("dla realnej nazwy z Rabbit Cupa zwraca pewne trafienie", async () => {
    const result = await suggestLogosForTeamName("GKS KATOWICE 1");

    // Po seedzie nazwa drużyny jest nazwą własną albo aliasem assetu,
    // więc dialog może ją zaznaczyć bez pytania.
    expect(result.autoSelect).not.toBeNull();
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  it("dla nieznanej nazwy nie zaznacza niczego automatycznie", async () => {
    const result = await suggestLogosForTeamName("Nieistniejący Klub Testowy XYZ");

    expect(result.autoSelect).toBeNull();
  });

  it("dialog nie ujawnia identyfikatorów technicznych", async () => {
    const library = await listLogoLibrary();
    const item = library[0];

    // Do panelu jedzie slug i nazwa — nigdy UUID ani public_id.
    expect(item.slug).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
    );
    expect(Object.keys(item)).not.toContain("cloudinaryPublicId");
    expect(Object.keys(item)).not.toContain("contentHash");
    expect(Object.keys(item)).not.toContain("id");
  });

  it("miniatura jest lekką transformacją, nie oryginałem", async () => {
    const library = await listLogoLibrary();
    const cloudinary = library.find((item) =>
      item.url.includes("res.cloudinary.com")
    );

    if (!cloudinary) return;

    expect(cloudinary.thumbnailUrl).toContain("w_96");
    expect(cloudinary.thumbnailUrl).not.toBe(cloudinary.url);
  });
});

describe.skipIf(!hasDatabase)("A: komplet hashy w bibliotece", () => {
  it("każdy asset ma policzoną sumę kontrolną", async () => {
    const rows = await getDb()
      .select({
        canonicalName: teamLogoAssets.canonicalName,
        contentHash: teamLogoAssets.contentHash,
      })
      .from(teamLogoAssets);

    const withoutHash = rows.filter((row) => !row.contentHash);

    // Bez hasha ponowne wgranie tego samego pliku zrobiłoby kopię.
    expect(withoutHash.map((row) => row.canonicalName)).toEqual([]);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("żadne dwa assety nie mają tej samej zawartości", async () => {
    const rows = await getDb()
      .select({ contentHash: teamLogoAssets.contentHash })
      .from(teamLogoAssets);

    const hashes = rows
      .map((row) => row.contentHash)
      .filter((hash): hash is string => Boolean(hash));

    expect(new Set(hashes).size).toBe(hashes.length);
  });
});
