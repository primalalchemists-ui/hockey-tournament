import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, like, sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import {
  groups,
  matches,
  scorers,
  teams,
  tournamentAssets,
  tournaments,
} from "@/lib/db/schema";
import { postgresRepository } from "@/lib/data/postgres/repository";
import type { Tournament } from "@/types/tournament";

/**
 * Testy ścieżki ZAPISU do Postgresa.
 *
 * Operują na własnym turnieju testowym (slug zaczyna się od "vitest-").
 * afterAll usuwa dane testowe i przywraca pierwotnie aktywny turniej,
 * żeby nie naruszyć zaimportowanego Rabbit Cupa.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);

const TEST_TITLE = "Vitest Identity Cup";
const RENAMED_TITLE = "Vitest Identity Cup 2026";
const TEST_SLUG = "vitest-identity-cup";
const RENAMED_SLUG = "vitest-identity-cup-2026";

function buildTestTournament(title: string, overrides?: Partial<Tournament>): Tournament {
  return {
    id: "ignored-by-repository",
    title,
    scorers: [
      { id: "vs-1", playerName: "Tester Jeden", jerseyNumber: 7, goals: 4, teamId: "vt-1" },
    ],
    assets: {
      scheduleImage: "https://cdn.test/schedule.pdf",
      scheduleImageType: "application/pdf",
      scheduleImageName: "schedule.pdf",
      scheduleImagePublicId: "tournaments/schedule",
      regulationImage: "",
      regulationImageType: "",
      regulationImageName: "",
    },
    groups: [
      {
        key: "A",
        name: "Grupa A",
        teams: [
          { id: "vt-1", name: "Testowi A", shortName: "TA", logoText: "TA", sourceOrder: 1 },
          { id: "vt-2", name: "Testowi B", shortName: "TB", logoText: "TB", sourceOrder: 2 },
          { id: "vt-3", name: "Testowi C", shortName: "TC", logoText: "TC", sourceOrder: 3 },
        ],
        matches: [
          { id: "A-vt-1-vt-2", group: "A", homeTeamId: "vt-1", awayTeamId: "vt-2", homeScore: 3, awayScore: 1 },
          { id: "A-vt-1-vt-3", group: "A", homeTeamId: "vt-1", awayTeamId: "vt-3", homeScore: 0, awayScore: 0 },
        ],
      },
    ],
    ...overrides,
  };
}

async function countsFor(tournamentId: string) {
  const db = getDb();

  const [groupRows, teamRows, matchRows, scorerRows, assetRows] = await db.batch([
    db.select({ n: sql<number>`count(*)::int` }).from(groups).where(eq(groups.tournamentId, tournamentId)),
    db.select({ n: sql<number>`count(*)::int` }).from(teams).where(eq(teams.tournamentId, tournamentId)),
    db.select({ n: sql<number>`count(*)::int` }).from(matches).where(eq(matches.tournamentId, tournamentId)),
    db.select({ n: sql<number>`count(*)::int` }).from(scorers).where(eq(scorers.tournamentId, tournamentId)),
    db.select({ n: sql<number>`count(*)::int` }).from(tournamentAssets).where(eq(tournamentAssets.tournamentId, tournamentId)),
  ]);

  return {
    groups: groupRows[0].n,
    teams: teamRows[0].n,
    matches: matchRows[0].n,
    scorers: scorerRows[0].n,
    assets: assetRows[0].n,
  };
}

async function findTournamentBySlug(slug: string) {
  const rows = await getDb()
    .select()
    .from(tournaments)
    .where(eq(tournaments.slug, slug))
    .limit(1);

  return rows[0] ?? null;
}

describe.skipIf(!hasDatabase)("Postgres — zapis turnieju", () => {
  let originalActiveId: string | null = null;
  let testTournamentId = "";

  beforeAll(async () => {
    const db = getDb();

    const active = await db
      .select({ id: tournaments.id })
      .from(tournaments)
      .where(eq(tournaments.isCurrent, true))
      .limit(1);

    originalActiveId = active[0]?.id ?? null;

    // Testy pracują na WŁASNYM turnieju o własnym UUID. Nie trzeba już
    // niczego dezaktywować — zapis nie wybiera turnieju samodzielnie.
    const created = await postgresRepository.createTournament({
      title: TEST_TITLE,
      settings: {
        structure: "groups",
        format: "league",
        playoffConfig: null,
        scorersEnabled: true,
      },
    });
    testTournamentId = created.id;
  });

  afterAll(async () => {
    const db = getDb();

    // Nigdy nie kasujemy oryginalnego turnieju, nawet gdyby slug pasował.
    await db
      .delete(tournaments)
      .where(
        originalActiveId
          ? and(
              like(tournaments.slug, "vitest-%"),
              sql`${tournaments.id} <> ${originalActiveId}`
            )
          : like(tournaments.slug, "vitest-%")
      );

    if (originalActiveId) {
      await db
        .update(tournaments)
        .set({ isCurrent: true })
        .where(eq(tournaments.id, originalActiveId));

      const restored = await db
        .select({ id: tournaments.id })
        .from(tournaments)
        .where(eq(tournaments.isCurrent, true));

      if (restored.length !== 1 || restored[0].id !== originalActiveId) {
        throw new Error(
          "Nie udało się przywrócić pierwotnie aktywnego turnieju po testach zapisu!"
        );
      }
    }
  });

  it("zapisuje pełny turniej i odczytuje go bez zmian", async () => {
    const payload = buildTestTournament(TEST_TITLE);
    const { slug } = await postgresRepository.saveTournament(testTournamentId, payload);

    expect(slug).toBe(TEST_SLUG);

    const result = await postgresRepository.getTournamentById(testTournamentId);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    const saved = result.tournament;

    expect(saved.id).toBe(TEST_SLUG);
    expect(saved.title).toBe(TEST_TITLE);
    expect(saved.groups?.[0].teams.map((team) => team.id)).toEqual([
      "vt-1",
      "vt-2",
      "vt-3",
    ]);
    expect(saved.groups?.[0].matches).toEqual(payload.groups[0].matches);
    expect(saved.scorers).toEqual(payload.scorers);
    expect(saved.assets?.scheduleImage).toBe("https://cdn.test/schedule.pdf");
  });

  it("ponowny zapis tego samego payloadu nie tworzy duplikatów", async () => {
    const tournament = await findTournamentBySlug(TEST_SLUG);
    expect(tournament).not.toBeNull();

    const before = await countsFor(tournament!.id);

    await postgresRepository.saveTournament(testTournamentId, buildTestTournament(TEST_TITLE));
    await postgresRepository.saveTournament(testTournamentId, buildTestTournament(TEST_TITLE));

    const after = await countsFor(tournament!.id);

    expect(after).toEqual(before);
    expect(after).toEqual({ groups: 1, teams: 3, matches: 2, scorers: 1, assets: 1 });
  });

  it("ZMIANA NAZWY nie zmienia tożsamości turnieju ani nie osierocą danych", async () => {
    const before = await findTournamentBySlug(TEST_SLUG);
    expect(before).not.toBeNull();

    const countsBefore = await countsFor(before!.id);

    await postgresRepository.saveTournament(testTournamentId, buildTestTournament(RENAMED_TITLE));

    const renamed = await findTournamentBySlug(RENAMED_SLUG);

    expect(renamed).not.toBeNull();
    // Kluczowa asercja tego etapu: ten sam wiersz, ten sam UUID.
    expect(renamed!.id).toBe(before!.id);
    expect(renamed!.title).toBe(RENAMED_TITLE);

    // Stary slug nie istnieje jako osobny turniej — nic się nie rozdwoiło.
    expect(await findTournamentBySlug(TEST_SLUG)).toBeNull();

    // Drużyny i mecze nadal wiszą pod tym samym turniejem.
    expect(await countsFor(renamed!.id)).toEqual(countsBefore);

    const result = await postgresRepository.getTournamentById(testTournamentId);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    expect(result.tournament.groups?.[0].teams).toHaveLength(3);
    expect(result.tournament.groups?.[0].matches).toHaveLength(2);
  });

  it("usunięcie drużyny z payloadu kasuje ją razem z jej meczami", async () => {
    const payload = buildTestTournament(RENAMED_TITLE);
    payload.groups[0].teams = payload.groups[0].teams.filter(
      (team) => team.id !== "vt-3"
    );
    payload.groups[0].matches = payload.groups[0].matches.filter(
      (match) => match.homeTeamId !== "vt-3" && match.awayTeamId !== "vt-3"
    );

    await postgresRepository.saveTournament(testTournamentId, payload);

    const tournament = await findTournamentBySlug(RENAMED_SLUG);
    const counts = await countsFor(tournament!.id);

    expect(counts.teams).toBe(2);
    expect(counts.matches).toBe(1);
  });

  it("każdy mecz wskazuje na istniejące drużyny (integralność FK)", async () => {
    const tournament = await findTournamentBySlug(RENAMED_SLUG);

    const orphans = await getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(matches)
      .leftJoin(teams, eq(matches.homeTeamId, teams.id))
      .where(and(eq(matches.tournamentId, tournament!.id), sql`${teams.id} is null`));

    expect(orphans[0].n).toBe(0);
  });

  it("mecze zapisane z wynikiem dostają status 'finished' jawnie", async () => {
    const tournament = await findTournamentBySlug(RENAMED_SLUG);

    const rows = await getDb()
      .select({ status: matches.status, stage: matches.stage })
      .from(matches)
      .where(eq(matches.tournamentId, tournament!.id));

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.status === "finished")).toBe(true);
    expect(rows.every((row) => row.stage === "group")).toBe(true);
  });

  it("ZACHOWUJE public_id, gdy payload go nie niesie", async () => {
    // Odczyt domenowy celowo nie zwraca public_id, więc panel po przeładowaniu
    // wysyła payload bez tego pola. Zapis nie może wtedy wyzerować
    // identyfikatorów Cloudinary — inaczej rehost byłby jednorazowy.
    const withLogo = buildTestTournament(RENAMED_TITLE);
    withLogo.groups[0].teams[0].logoUrl = "https://res.cloudinary.com/x/a.png";
    withLogo.groups[0].teams[0].logoPublicId = "tournaments/vitest/teams/vt-1";
    withLogo.assets.scheduleImagePublicId = "tournaments/vitest/assets/schedule";

    await postgresRepository.saveTournament(testTournamentId, withLogo);

    const tournament = await findTournamentBySlug(RENAMED_SLUG);
    const db = getDb();

    const before = await db
      .select({ publicId: teams.logoPublicId })
      .from(teams)
      .where(and(eq(teams.tournamentId, tournament!.id), eq(teams.externalId, "vt-1")));

    expect(before[0].publicId).toBe("tournaments/vitest/teams/vt-1");

    // Kolejny zapis — payload jak z panelu po przeładowaniu: URL-e są,
    // ale żadnego public_id (odczyt domenowy ich nie zwraca).
    const withoutPublicId = buildTestTournament(RENAMED_TITLE);
    withoutPublicId.groups[0].teams[0].logoUrl = "https://res.cloudinary.com/x/a.png";
    delete withoutPublicId.groups[0].teams[0].logoPublicId;
    delete withoutPublicId.assets.scheduleImagePublicId;

    await postgresRepository.saveTournament(testTournamentId, withoutPublicId);

    const after = await db
      .select({ publicId: teams.logoPublicId, logoUrl: teams.logoUrl })
      .from(teams)
      .where(and(eq(teams.tournamentId, tournament!.id), eq(teams.externalId, "vt-1")));

    expect(after[0].publicId).toBe("tournaments/vitest/teams/vt-1");
    expect(after[0].logoUrl).toBe("https://res.cloudinary.com/x/a.png");

    const assetAfter = await db
      .select({ publicId: tournamentAssets.publicId })
      .from(tournamentAssets)
      .where(eq(tournamentAssets.tournamentId, tournament!.id));

    expect(assetAfter[0].publicId).toBe("tournaments/vitest/assets/schedule");
  });

  it("NADPISUJE public_id, gdy payload niesie nowy (nowy upload)", async () => {
    const payload = buildTestTournament(RENAMED_TITLE);
    payload.groups[0].teams[0].logoUrl = "https://res.cloudinary.com/x/nowe.png";
    payload.groups[0].teams[0].logoPublicId = "tournaments/vitest/teams/vt-1-nowe";

    await postgresRepository.saveTournament(testTournamentId, payload);

    const tournament = await findTournamentBySlug(RENAMED_SLUG);

    const rows = await getDb()
      .select({ publicId: teams.logoPublicId })
      .from(teams)
      .where(and(eq(teams.tournamentId, tournament!.id), eq(teams.externalId, "vt-1")));

    expect(rows[0].publicId).toBe("tournaments/vitest/teams/vt-1-nowe");
  });

  it("CZYŚCI public_id, gdy logo zostało usunięte", async () => {
    const payload = buildTestTournament(RENAMED_TITLE);
    payload.groups[0].teams[0].logoUrl = "";

    await postgresRepository.saveTournament(testTournamentId, payload);

    const tournament = await findTournamentBySlug(RENAMED_SLUG);

    const rows = await getDb()
      .select({ publicId: teams.logoPublicId, logoUrl: teams.logoUrl })
      .from(teams)
      .where(and(eq(teams.tournamentId, tournament!.id), eq(teams.externalId, "vt-1")));

    expect(rows[0].logoUrl).toBeNull();
    expect(rows[0].publicId).toBeNull();
  });

  it("aktywny jest dokładnie jeden turniej", async () => {
    const active = await getDb()
      .select({ id: tournaments.id })
      .from(tournaments)
      .where(eq(tournaments.isCurrent, true));

    expect(active).toHaveLength(1);
  });
});
