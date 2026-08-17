import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { teams, tournamentAssets, tournaments } from "@/lib/db/schema";
import { postgresRepository } from "@/lib/data/postgres/repository";
import { airtableRepository } from "@/lib/data/airtable/repository";
import { mergeTournamentData } from "@/lib/merge-data";
import { isAirtableAssetUrl, isCloudinaryUrl } from "@/lib/assets/naming";

/**
 * Stan assetów w PostgreSQL po rehoście.
 *
 * Te testy pilnują najważniejszego rezultatu tego etapu: adapter Postgres
 * nie może już zależeć od Airtable przy renderowaniu obrazków.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);
const hasAirtable = Boolean(
  process.env.AIRTABLE_BASE_ID && process.env.AIRTABLE_TOKEN
);

async function activeTournamentId() {
  const rows = await getDb()
    .select({ id: tournaments.id })
    .from(tournaments)
    .where(eq(tournaments.isActive, true))
    .limit(1);

  return rows[0]?.id ?? null;
}

describe.skipIf(!hasDatabase)("assety w PostgreSQL po rehoście", () => {
  it("żaden URL w bazie nie wskazuje na Airtable", async () => {
    const tournamentId = await activeTournamentId();
    expect(tournamentId).not.toBeNull();

    const db = getDb();

    const [teamRows, assetRows] = await db.batch([
      db
        .select({ externalId: teams.externalId, logoUrl: teams.logoUrl })
        .from(teams)
        .where(eq(teams.tournamentId, tournamentId!)),
      db
        .select({ kind: tournamentAssets.kind, url: tournamentAssets.url })
        .from(tournamentAssets)
        .where(eq(tournamentAssets.tournamentId, tournamentId!)),
    ]);

    const offenders = [
      ...teamRows.filter((row) => isAirtableAssetUrl(row.logoUrl)).map((r) => r.externalId),
      ...assetRows.filter((row) => isAirtableAssetUrl(row.url)).map((r) => r.kind),
    ];

    expect(offenders).toEqual([]);
  });

  it("wszystkie assety mają URL Cloudinary i zapisany public_id", async () => {
    const tournamentId = await activeTournamentId();
    const db = getDb();

    const [teamRows, assetRows] = await db.batch([
      db
        .select({
          externalId: teams.externalId,
          logoUrl: teams.logoUrl,
          logoPublicId: teams.logoPublicId,
        })
        .from(teams)
        .where(eq(teams.tournamentId, tournamentId!)),
      db
        .select({
          kind: tournamentAssets.kind,
          url: tournamentAssets.url,
          publicId: tournamentAssets.publicId,
        })
        .from(tournamentAssets)
        .where(eq(tournamentAssets.tournamentId, tournamentId!)),
    ]);

    const withLogo = teamRows.filter((row) => row.logoUrl);

    expect(withLogo.length).toBeGreaterThan(0);
    expect(assetRows.length).toBeGreaterThan(0);

    for (const row of withLogo) {
      expect(isCloudinaryUrl(row.logoUrl), `logo ${row.externalId}`).toBe(true);
      expect(row.logoPublicId, `public_id ${row.externalId}`).toBeTruthy();
      expect(row.logoPublicId).toContain("/teams/");
    }

    for (const row of assetRows) {
      expect(isCloudinaryUrl(row.url), `asset ${row.kind}`).toBe(true);
      expect(row.publicId, `public_id ${row.kind}`).toBeTruthy();
      expect(row.publicId).toContain("/assets/");
    }
  });

  it("model domenowy z Postgresa nie zawiera już airtableusercontent", async () => {
    const result = await postgresRepository.getActiveTournament();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    expect(JSON.stringify(result.tournament)).not.toContain(
      "airtableusercontent.com"
    );
  });

  it("liczba assetów zgadza się z liczbą drużyn z logo i slotów turnieju", async () => {
    const result = await postgresRepository.getActiveTournament();
    if (result.status !== "ok") throw new Error("brak turnieju");

    const tournament = mergeTournamentData(result.tournament);
    const logos = tournament.groups
      .flatMap((group) => group.teams)
      .filter((team) => team.logoUrl);

    expect(logos).toHaveLength(18);
    expect(logos.every((team) => isCloudinaryUrl(team.logoUrl))).toBe(true);
  });

  it("public_id NIE jest wystawiany w modelu domenowym", async () => {
    // Kontrakt zgodności z adapterem Airtable pozostaje nienaruszony.
    const result = await postgresRepository.getActiveTournament();
    if (result.status !== "ok") throw new Error("brak turnieju");

    const team = result.tournament.groups?.[0].teams[0];

    expect(team).toBeDefined();
    expect(team).not.toHaveProperty("logoPublicId");
    expect(result.tournament.assets).not.toHaveProperty("heroBannerImagePublicId");
  });
});

describe.skipIf(!hasDatabase || !hasAirtable)(
  "adapter Airtable po rehoście",
  () => {
    it("nadal działa i nadal serwuje własne URL-e — jest drogą powrotu", async () => {
      const result = await airtableRepository.getActiveTournament();

      expect(result.status).toBe("ok");
      if (result.status !== "ok") return;

      const tournament = mergeTournamentData(result.tournament);
      const logos = tournament.groups
        .flatMap((group) => group.teams)
        .map((team) => team.logoUrl)
        .filter(Boolean) as string[];

      expect(logos).toHaveLength(18);
      // Rehost nie dotknął Airtable — jego assety pozostają po jego stronie.
      expect(logos.every((url) => isAirtableAssetUrl(url))).toBe(true);
    });
  }
);
