import { describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { teamLogoAliases, teamLogoAssets, teams, tournaments } from "@/lib/db/schema";
import { suggestLogosForTeamName } from "@/lib/data/postgres/logo-library";

/**
 * SCALENIE POTWIERDZONYCH DUPLIKATÓW.
 *
 * Testy sprawdzają STAN PO operacji: dwa bajtowo identyczne pliki zostały
 * zastąpione jednym, a obie drużyny każdego klubu wskazują ten sam herb.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);

/** Pliki usunięte świadomie i pojedynczo — nigdy wzorcem. */
const DELETED = [
  "tournaments/rabbit-cup/teams/b-1773405580668",
  "tournaments/rabbit-cup/teams/a-1773405076043",
];

const KEPT = [
  "tournaments/rabbit-cup/teams/a-1773357702149",
  "tournaments/rabbit-cup/teams/b-1773405648230",
];

async function rabbitTeams() {
  return getDb()
    .select({
      name: teams.name,
      logoUrl: teams.logoUrl,
      logoPublicId: teams.logoPublicId,
      logoAssetId: teams.logoAssetId,
    })
    .from(teams)
    .innerJoin(tournaments, eq(teams.tournamentId, tournaments.id))
    .where(eq(tournaments.slug, "rabbit-cup"));
}

describe.skipIf(!hasDatabase)("scalone duplikaty", () => {
  it("E: oba warianty Naprzodu wskazują jeden asset", async () => {
    const rows = await rabbitTeams();
    const variants = rows.filter((row) => row.name.startsWith("NAPRZÓD JANÓW"));

    expect(variants).toHaveLength(2);
    expect(new Set(variants.map((row) => row.logoAssetId)).size).toBe(1);
    expect(new Set(variants.map((row) => row.logoPublicId)).size).toBe(1);
    expect(variants[0].logoUrl).toBe(variants[1].logoUrl);
  });

  it("F: oba warianty GKS wskazują jeden asset", async () => {
    const rows = await rabbitTeams();
    const variants = rows.filter((row) => row.name.startsWith("GKS KATOWICE"));

    expect(variants).toHaveLength(2);
    expect(new Set(variants.map((row) => row.logoAssetId)).size).toBe(1);
    expect(new Set(variants.map((row) => row.logoPublicId)).size).toBe(1);
  });

  it("G: aliasy wariantów prowadzą do assetu kanonicznego", async () => {
    for (const name of [
      "NAPRZÓD JANÓW KATOWICE 2",
      "GKS KATOWICE 1",
      "GKS KATOWICE 2",
    ]) {
      const result = await suggestLogosForTeamName(name);

      expect(result.autoSelect).not.toBeNull();
      // Herb jest tym samym, którego używa wariant bez numeru.
      expect(result.autoSelect?.logo.canonicalName).not.toMatch(/ [12]$/);
    }
  });

  it("H: w bibliotece nie ma już zduplikowanych wierszy", async () => {
    const db = getDb();

    const rows = await db
      .select({ publicId: teamLogoAssets.cloudinaryPublicId })
      .from(teamLogoAssets);

    for (const deleted of DELETED) {
      expect(rows.some((row) => row.publicId === deleted)).toBe(false);
    }

    for (const kept of KEPT) {
      expect(rows.some((row) => row.publicId === kept)).toBe(true);
    }

    /*
      Biblioteka rośnie, gdy admin dodaje nowe herby — nie przywiązujemy
      się do konkretnej liczby. Niezmiennik jest inny: żadne dwa wiersze
      nie wskazują tego samego pliku.
    */
    const publicIds = rows
      .map((row) => row.publicId)
      .filter((value): value is string => Boolean(value));

    expect(new Set(publicIds).size).toBe(publicIds.length);
    expect(rows.length).toBeGreaterThanOrEqual(16);
  });

  it("I: usunięte pliki nie mają już żadnych referencji", async () => {
    const db = getDb();

    const refs = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(teams)
      .where(inArray(teams.logoPublicId, DELETED));

    expect(refs[0].n).toBe(0);
  });

  it("J: pozostałe herby są nietknięte", async () => {
    const rows = await rabbitTeams();

    // Każda drużyna nadal ma logo i nadal jest to Cloudinary.
    expect(rows).toHaveLength(18);
    expect(rows.every((row) => Boolean(row.logoUrl))).toBe(true);
    expect(
      rows.every((row) => row.logoUrl?.includes("res.cloudinary.com"))
    ).toBe(true);
    expect(rows.every((row) => row.logoAssetId !== null)).toBe(true);

    // Rabbit Cup: 18 drużyn dzieli 16 plików (dwie pary po scaleniu).
    expect(new Set(rows.map((row) => row.logoPublicId)).size).toBe(16);
  });

  it("aliasy nie osierociały po skasowanym wierszu", async () => {
    const db = getDb();

    const aliases = await db.select().from(teamLogoAliases);
    const assets = await db.select({ id: teamLogoAssets.id }).from(teamLogoAssets);
    const ids = new Set(assets.map((row) => row.id));

    expect(aliases.every((alias) => ids.has(alias.logoAssetId))).toBe(true);
  });
});
