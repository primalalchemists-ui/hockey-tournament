import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { tournaments } from "@/lib/db/schema";
import { postgresRepository } from "@/lib/data/postgres/repository";
import { mergeTournamentData } from "@/lib/merge-data";
import { isCloudinaryUrl } from "@/lib/assets/naming";

/**
 * Produkcyjny Rabbit Cup po migracji multi-tournament.
 *
 * Migracja przemianowała is_active -> is_current i dołożyła archived_at.
 * Ten test pilnuje, że nie zgubiła turnieju ani jego statusu publicznego.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabase)("Rabbit Cup po migracji", () => {
  it("istnieje, nie jest zarchiwizowany i jest wyświetlany publicznie", async () => {
    const rows = await getDb()
      .select({
        id: tournaments.id,
        title: tournaments.title,
        isCurrent: tournaments.isCurrent,
        archivedAt: tournaments.archivedAt,
        format: tournaments.format,
      })
      .from(tournaments)
      .where(eq(tournaments.slug, "rabbit-cup"))
      .limit(1);

    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Rabbit Cup");
    expect(rows[0].isCurrent).toBe(true);
    expect(rows[0].archivedAt).toBeNull();
    // Format pozostaje ligowy — formaty turniejowe to kolejny etap.
    expect(rows[0].format).toBe("league");

    // UUID musi być stabilnym identyfikatorem, nie derywatem nazwy.
    expect(rows[0].id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it("publiczny odczyt zwraca komplet danych Rabbit Cupa", async () => {
    const result = await postgresRepository.getCurrentTournament();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    const tournament = mergeTournamentData(result.tournament);

    expect(tournament.title).toBe("Rabbit Cup");
    expect(tournament.groups.map((group) => group.key)).toEqual(["A", "B"]);
    expect(tournament.groups.map((group) => group.teams.length)).toEqual([9, 9]);
    expect(tournament.groups.map((group) => group.matches.length)).toEqual([
      36, 36,
    ]);
  });

  it("assety nadal wskazują na Cloudinary", async () => {
    const result = await postgresRepository.getCurrentTournament();
    if (result.status !== "ok") throw new Error("brak turnieju");

    const tournament = mergeTournamentData(result.tournament);
    const logos = tournament.groups
      .flatMap((group) => group.teams)
      .map((team) => team.logoUrl)
      .filter(Boolean) as string[];

    expect(logos).toHaveLength(18);
    expect(logos.every((url) => isCloudinaryUrl(url))).toBe(true);
    expect(JSON.stringify(tournament)).not.toContain("airtableusercontent.com");
  });

  it("jest widoczny na liście turniejów jako wyświetlany", async () => {
    const list = await postgresRepository.listTournaments();
    const rabbit = list.find((item) => item.slug === "rabbit-cup");

    expect(rabbit).toBeDefined();
    expect(rabbit?.isCurrent).toBe(true);
    expect(rabbit?.archivedAt).toBeNull();
  });
});
