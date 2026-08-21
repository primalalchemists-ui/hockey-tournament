import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import {
  matches,
  standingsSnapshotRows,
  standingsSnapshots,
  teamLogoAssets,
  teams,
  tournamentAssets,
  tournamentCollectionMembers,
  tournaments,
} from "@/lib/db/schema";
import { postgresRepository } from "@/lib/data/postgres/repository";
import {
  completeGroupStage,
  getPlayoffState,
} from "@/lib/data/postgres/playoff-engine";
import { TournamentOperationError } from "@/lib/data/types";
import {
  connectTournaments,
  getPublicCategories,
} from "@/lib/data/postgres/collections";

import {
  deleteOwnFixtures,
  readCurrentTournamentId,
  restoreCurrentTournament,
} from "./helpers/current-tournament";
import { createU8Fixture } from "./torture/helpers/lifecycle";

/**
 * TRWAŁE USUNIĘCIE TURNIEJU.
 *
 * Wszystko na jednorazowych fixture'ach `Vitest …`. Żaden test nie dotyka
 * realnych turniejów — kasowanie jest operacją nieodwracalną i nie ma tu
 * miejsca na pomyłkę.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabase)("trwałe usunięcie turnieju", () => {
  let originalCurrentId: string | null = null;

  beforeAll(async () => {
    originalCurrentId = await readCurrentTournamentId();
  });

  afterAll(async () => {
    try {
      await deleteOwnFixtures("vitest-", originalCurrentId);
    } finally {
      await restoreCurrentTournament(originalCurrentId);
    }
  });

  it("1/2/3/4 — kasuje turniej razem z jego danymi, bez sierot", async () => {
    const id = await createU8Fixture("Vitest Delete Full");
    await completeGroupStage(id);

    const db = getDb();

    // Turniej ma realny dorobek: mecze, drużyny, snapshot i drabinkę.
    const before = await getPlayoffState(id);
    expect(before.scopes[0].snapshot).toHaveLength(7);

    const snapshotIds = (
      await db
        .select({ id: standingsSnapshots.id })
        .from(standingsSnapshots)
        .where(eq(standingsSnapshots.tournamentId, id))
    ).map((row) => row.id);

    expect(snapshotIds.length).toBeGreaterThan(0);

    await postgresRepository.deleteTournamentPermanently(id);

    // 2 — znika z listy turniejów.
    const summaries = await postgresRepository.listTournaments();
    expect(summaries.find((item) => item.id === id)).toBeUndefined();

    // 3 — dane należące do turnieju znikają razem z nim.
    expect(
      await db.select().from(tournaments).where(eq(tournaments.id, id))
    ).toEqual([]);
    expect(
      await db.select().from(matches).where(eq(matches.tournamentId, id))
    ).toEqual([]);
    expect(await db.select().from(teams).where(eq(teams.tournamentId, id))).toEqual(
      []
    );
    expect(
      await db
        .select()
        .from(tournamentAssets)
        .where(eq(tournamentAssets.tournamentId, id))
    ).toEqual([]);

    // 4 — zero osieroconych wierszy snapshotu.
    expect(
      await db
        .select()
        .from(standingsSnapshots)
        .where(eq(standingsSnapshots.tournamentId, id))
    ).toEqual([]);
    expect(
      await db
        .select()
        .from(standingsSnapshotRows)
        .where(inArray(standingsSnapshotRows.snapshotId, snapshotIds))
    ).toEqual([]);
  });

  it("5 — biblioteka herbów przeżywa usunięcie turnieju", async () => {
    const db = getDb();

    const logosBefore = await db
      .select({ id: teamLogoAssets.id })
      .from(teamLogoAssets);

    const id = await createU8Fixture("Vitest Delete Logos");
    await postgresRepository.deleteTournamentPermanently(id);

    const logosAfter = await db
      .select({ id: teamLogoAssets.id })
      .from(teamLogoAssets);

    // Biblioteka jest GLOBALNA — kasowanie turnieju jej nie dotyka.
    expect(logosAfter.length).toBe(logosBefore.length);
  });

  it("6 — grafika używana przez inny turniej zostaje", async () => {
    const db = getDb();

    const keep = await createU8Fixture("Vitest Delete Keep");
    const drop = await createU8Fixture("Vitest Delete Drop");

    const shared = {
      url: "https://res.cloudinary.com/demo/image/upload/vitest-shared.jpg",
      publicId: "tournaments/vitest-shared",
    };

    // Ta sama grafika przypisana do DWÓCH turniejów.
    for (const tournamentId of [keep, drop]) {
      await db.insert(tournamentAssets).values({
        tournamentId,
        kind: "camp_banner",
        url: shared.url,
        publicId: shared.publicId,
        fileName: "shared.jpg",
        mimeType: "image/jpeg",
      });
    }

    await postgresRepository.deleteTournamentPermanently(drop);

    const remaining = await db
      .select({ url: tournamentAssets.url })
      .from(tournamentAssets)
      .where(eq(tournamentAssets.tournamentId, keep));

    // Referencja skasowanego turnieju znika, referencja drugiego zostaje.
    expect(remaining.map((row) => row.url)).toContain(shared.url);
  });

  it("7 — przynależność do kategorii jest czyszczona, reszta zostaje", async () => {
    const keep = await createU8Fixture("Vitest Delete Cat Keep");
    const drop = await createU8Fixture("Vitest Delete Cat Drop");

    await connectTournaments({
      members: [
        { tournamentId: keep, label: "U8", bubbleColor: "#1E3A5F" },
        { tournamentId: drop, label: "U10", bubbleColor: "#D6A52A" },
      ],
    });

    const db = getDb();

    expect(
      await db
        .select()
        .from(tournamentCollectionMembers)
        .where(eq(tournamentCollectionMembers.tournamentId, drop))
    ).toHaveLength(1);

    await postgresRepository.deleteTournamentPermanently(drop);

    // Członkostwo znika...
    expect(
      await db
        .select()
        .from(tournamentCollectionMembers)
        .where(eq(tournamentCollectionMembers.tournamentId, drop))
    ).toEqual([]);

    // ...a drugi turniej zostaje nietknięty.
    expect(
      await db.select().from(tournaments).where(eq(tournaments.id, keep))
    ).toHaveLength(1);

    /*
      Publiczny przełącznik nie może wskazywać nieistniejącego turnieju.
      `getPublicCategories` zwraca null dla turnieju spoza strony głównej,
      więc niezmiennika pilnujemy na samych powiązaniach.
    */
    const categories = await getPublicCategories(keep);
    expect(
      (categories ?? []).map((item) => item.tournamentId)
    ).not.toContain(drop);

    // Powiązanie zachowanego turnieju nie zostało przy okazji skasowane.
    expect(
      await db
        .select()
        .from(tournamentCollectionMembers)
        .where(eq(tournamentCollectionMembers.tournamentId, keep))
    ).toHaveLength(1);
  });

  it("8 — turniej wyświetlany publicznie jest chroniony", async () => {
    const id = await createU8Fixture("Vitest Delete Current");

    await postgresRepository.setCurrentTournament(id);

    await expect(
      postgresRepository.deleteTournamentPermanently(id)
    ).rejects.toBeInstanceOf(TournamentOperationError);

    // Turniej nadal istnieje — odmowa nie może niczego skasować po drodze.
    const summaries = await postgresRepository.listTournaments();
    expect(summaries.find((item) => item.id === id)).toBeDefined();

    // Sprzątamy po sobie: zdejmujemy flagę, żeby fixture dał się usunąć.
    if (originalCurrentId) {
      await postgresRepository.setCurrentTournament(originalCurrentId);
    }
  });

  it("9/10 — archiwizacja nie kasuje, a zarchiwizowany da się usunąć", async () => {
    const id = await createU8Fixture("Vitest Delete Archived");

    await postgresRepository.setTournamentArchived(id, true);

    const archived = await postgresRepository.listTournaments();
    const row = archived.find((item) => item.id === id);

    // 9 — archiwizacja zostawia turniej na liście, tylko go oznacza.
    expect(row).toBeDefined();
    expect(row?.archivedAt).not.toBeNull();

    // 10 — naturalny workflow: archiwum, a później trwałe usunięcie.
    await postgresRepository.deleteTournamentPermanently(id);

    const after = await postgresRepository.listTournaments();
    expect(after.find((item) => item.id === id)).toBeUndefined();
  });

  it("nieistniejący turniej zgłasza czytelny błąd", async () => {
    await expect(
      postgresRepository.deleteTournamentPermanently(
        "00000000-0000-0000-0000-000000000000"
      )
    ).rejects.toBeInstanceOf(TournamentOperationError);
  });
});
