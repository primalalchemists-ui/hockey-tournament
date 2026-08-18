import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, like, sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { groups, matches, teams, tournaments } from "@/lib/db/schema";
import { postgresRepository } from "@/lib/data/postgres/repository";
import { TournamentOperationError } from "@/lib/data/types";
import { calculateStandings } from "@/lib/standings";
import { mergeTournamentData } from "@/lib/merge-data";
import type { Tournament } from "@/types/tournament";
import type { TournamentSettings } from "@/types/tournament-config";
import {
  deleteOwnFixtures,
  readCurrentTournamentId,
  restoreCurrentTournament,
} from "./helpers/current-tournament";

/**
 * MULTI-TOURNAMENT — izolacja turniejów i wybór turnieju publicznego.
 *
 * Testy pracują na własnych turniejach (slug "vitest-*") i przywracają
 * pierwotnie wyświetlany turniej w afterAll. Produkcyjny Rabbit Cup nie
 * jest modyfikowany.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);

const LEAGUE_GROUPS: TournamentSettings = {
  structure: "groups",
  format: "league",
  playoffConfig: null,
  scorersEnabled: true,
};

function buildPayload(
  title: string,
  teamPrefix: string,
  score: [number, number] = [3, 1]
): Tournament {
  const a = `${teamPrefix}-1`;
  const b = `${teamPrefix}-2`;

  return {
    id: "ignored",
    title,
    scorers: [
      {
        id: `${teamPrefix}-s1`,
        playerName: "Tester",
        jerseyNumber: 9,
        goals: 2,
        teamId: a,
      },
    ],
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
          { id: a, name: `${teamPrefix} A`, shortName: "TA", logoText: "TA", sourceOrder: 1 },
          { id: b, name: `${teamPrefix} B`, shortName: "TB", logoText: "TB", sourceOrder: 2 },
        ],
        matches: [
          {
            id: `A-${a}-${b}`,
            group: "A",
            homeTeamId: a,
            awayTeamId: b,
            homeScore: score[0],
            awayScore: score[1],
          },
        ],
      },
    ],
  };
}

async function countsFor(tournamentId: string) {
  const db = getDb();

  const [g, t, m] = await db.batch([
    db.select({ n: sql<number>`count(*)::int` }).from(groups).where(eq(groups.tournamentId, tournamentId)),
    db.select({ n: sql<number>`count(*)::int` }).from(teams).where(eq(teams.tournamentId, tournamentId)),
    db.select({ n: sql<number>`count(*)::int` }).from(matches).where(eq(matches.tournamentId, tournamentId)),
  ]);

  return { groups: g[0].n, teams: t[0].n, matches: m[0].n };
}

describe.skipIf(!hasDatabase)("multi-tournament", () => {
  let originalCurrentId: string | null = null;
  let tournamentA = "";
  let tournamentB = "";

  beforeAll(async () => {
    originalCurrentId = await readCurrentTournamentId();

    tournamentA = (await postgresRepository.createTournament({"title":"Vitest Cup A", settings: LEAGUE_GROUPS })).id;
    tournamentB = (await postgresRepository.createTournament({"title":"Vitest Cup B", settings: LEAGUE_GROUPS })).id;

    await postgresRepository.saveTournament(
      tournamentA,
      buildPayload("Vitest Cup A", "va", [3, 1])
    );
    await postgresRepository.saveTournament(
      tournamentB,
      buildPayload("Vitest Cup B", "vb", [0, 5])
    );
  });

  afterAll(async () => {
    try {
      await deleteOwnFixtures("vitest-", originalCurrentId);
    } finally {
      await restoreCurrentTournament(originalCurrentId);
    }

    if (originalCurrentId) {
      const restored = await getDb()
        .select({ id: tournaments.id })
        .from(tournaments)
        .where(eq(tournaments.isCurrent, true));

      if (restored.length !== 1 || restored[0].id !== originalCurrentId) {
        throw new Error(
          "Nie udało się przywrócić pierwotnie wyświetlanego turnieju!"
        );
      }
    }
  });

  /* --- 1, 8: tworzenie ------------------------------------------------- */

  it("utworzenie turnieju nie zmienia istniejących", async () => {
    const before = await countsFor(tournamentA);

    const extra = await postgresRepository.createTournament({"title":"Vitest Cup C", settings: LEAGUE_GROUPS });

    expect(await countsFor(tournamentA)).toEqual(before);
    // Nowy turniej "groups" dostaje automatycznie Grupę A, ale zero drużyn.
    expect(await countsFor(extra.id)).toEqual({ groups: 1, teams: 0, matches: 0 });
  });

  it("nowy turniej NIE staje się automatycznie wyświetlany publicznie", async () => {
    const created = await postgresRepository.createTournament({"title":"Vitest Cup D", settings: LEAGUE_GROUPS });

    const row = await getDb()
      .select({ isCurrent: tournaments.isCurrent })
      .from(tournaments)
      .where(eq(tournaments.id, created.id))
      .limit(1);

    expect(row[0].isCurrent).toBe(false);
  });

  it("nowy turniej startuje pusty — nie kopiuje danych poprzedniego", async () => {
    const created = await postgresRepository.createTournament({"title":"Vitest Cup E", settings: LEAGUE_GROUPS });
    const result = await postgresRepository.getTournamentById(created.id);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    // Startowa Grupa A jest pusta — żadne dane nie są kopiowane.
    expect(result.tournament.groups).toEqual([
      { key: "A", name: "Grupa A", teams: [], matches: [] },
    ]);
    expect(result.tournament.scorers).toEqual([]);
  });

  /* --- 2, 14: izolacja danych ------------------------------------------ */

  it("dwa turnieje mają niezależne grupy, drużyny i mecze", async () => {
    const [a, b] = await Promise.all([
      postgresRepository.getTournamentById(tournamentA),
      postgresRepository.getTournamentById(tournamentB),
    ]);

    if (a.status !== "ok" || b.status !== "ok") throw new Error("brak turnieju");

    expect(a.tournament.groups?.[0].teams.map((t) => t.id)).toEqual(["va-1", "va-2"]);
    expect(b.tournament.groups?.[0].teams.map((t) => t.id)).toEqual(["vb-1", "vb-2"]);

    expect(a.tournament.groups?.[0].matches[0].homeScore).toBe(3);
    expect(b.tournament.groups?.[0].matches[0].homeScore).toBe(0);
  });

  it("zapis wyniku w turnieju B NIE zmienia turnieju A", async () => {
    const before = await postgresRepository.getTournamentById(tournamentA);
    if (before.status !== "ok") throw new Error("brak A");

    const snapshotA = JSON.stringify(before.tournament);

    const changed = buildPayload("Vitest Cup B", "vb", [7, 7]);
    await postgresRepository.saveTournament(tournamentB, changed);

    const after = await postgresRepository.getTournamentById(tournamentA);
    if (after.status !== "ok") throw new Error("brak A");

    expect(JSON.stringify(after.tournament)).toBe(snapshotA);

    const bAfter = await postgresRepository.getTournamentById(tournamentB);
    if (bAfter.status !== "ok") throw new Error("brak B");

    expect(bAfter.tournament.groups?.[0].matches[0].homeScore).toBe(7);
  });

  it("standings liczą się niezależnie dla każdego turnieju", async () => {
    const [a, b] = await Promise.all([
      postgresRepository.getTournamentById(tournamentA),
      postgresRepository.getTournamentById(tournamentB),
    ]);

    if (a.status !== "ok" || b.status !== "ok") throw new Error("brak turnieju");

    const standingsA = calculateStandings(
      mergeTournamentData(a.tournament).groups[0]
    );

    expect(standingsA[0].teamId).toBe("va-1");
    expect(standingsA[0].points).toBe(3);
  });

  /* --- 3: tożsamość ---------------------------------------------------- */

  it("zmiana nazwy zachowuje tożsamość i nie odłącza danych", async () => {
    const before = await countsFor(tournamentA);

    await postgresRepository.saveTournament(
      tournamentA,
      buildPayload("Vitest Cup A 2026", "va", [3, 1])
    );

    const rows = await getDb()
      .select({ id: tournaments.id, slug: tournaments.slug, title: tournaments.title })
      .from(tournaments)
      .where(eq(tournaments.id, tournamentA))
      .limit(1);

    expect(rows[0].id).toBe(tournamentA);
    expect(rows[0].title).toBe("Vitest Cup A 2026");
    expect(rows[0].slug).toBe("vitest-cup-a-2026");
    expect(await countsFor(tournamentA)).toEqual(before);

    // przywracamy nazwę na potrzeby kolejnych testów
    await postgresRepository.saveTournament(
      tournamentA,
      buildPayload("Vitest Cup A", "va", [3, 1])
    );
  });

  it("zapis odmawia działania bez identyfikatora turnieju", async () => {
    await expect(
      postgresRepository.saveTournament("", buildPayload("X", "vx"))
    ).rejects.toBeInstanceOf(TournamentOperationError);
  });

  it("zapis odmawia działania dla nieistniejącego turnieju", async () => {
    await expect(
      postgresRepository.saveTournament(
        "00000000-0000-0000-0000-000000000000",
        buildPayload("X", "vx")
      )
    ).rejects.toBeInstanceOf(TournamentOperationError);
  });

  /* --- 4: lista -------------------------------------------------------- */

  it("listTournaments zwraca wszystkie turnieje z flagami", async () => {
    const list = await postgresRepository.listTournaments();
    const ids = list.map((item) => item.id);

    expect(ids).toContain(tournamentA);
    expect(ids).toContain(tournamentB);
    expect(list.filter((item) => item.isCurrent).length).toBeLessThanOrEqual(1);

    const entry = list.find((item) => item.id === tournamentA)!;
    expect(entry.title).toBe("Vitest Cup A");
    expect(entry.archivedAt).toBeNull();
  });

  /* --- 5, 6, 7: turniej publiczny -------------------------------------- */

  it("setCurrentTournament przełącza turniej wyświetlany publicznie", async () => {
    await postgresRepository.setCurrentTournament(tournamentB);

    const result = await postgresRepository.getCurrentTournament();
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    expect(result.tournament.title).toBe("Vitest Cup B");
  });

  it("po przełączeniu dokładnie jeden turniej jest wyświetlany", async () => {
    await postgresRepository.setCurrentTournament(tournamentA);

    const current = await getDb()
      .select({ id: tournaments.id })
      .from(tournaments)
      .where(eq(tournaments.isCurrent, true));

    expect(current).toHaveLength(1);
    expect(current[0].id).toBe(tournamentA);
  });

  it("BAZA blokuje dwa turnieje wyświetlane jednocześnie", async () => {
    // Gwarancja nie może zależeć od warunku w UI — sprawdzamy constraint.
    await expect(
      getDb()
        .update(tournaments)
        .set({ isCurrent: true })
        .where(eq(tournaments.id, tournamentB))
    ).rejects.toThrow();

    const current = await getDb()
      .select({ id: tournaments.id })
      .from(tournaments)
      .where(eq(tournaments.isCurrent, true));

    expect(current).toHaveLength(1);
  });

  it("edycja danych turnieju NIE przejmuje strony publicznej", async () => {
    // tournamentA jest current; zapisujemy B i sprawdzamy, że nic się nie zmienia
    await postgresRepository.saveTournament(
      tournamentB,
      buildPayload("Vitest Cup B", "vb", [1, 1])
    );

    const result = await postgresRepository.getCurrentTournament();
    if (result.status !== "ok") throw new Error("brak current");

    expect(result.tournament.title).toBe("Vitest Cup A");
  });

  /* --- 9, 10, 11: archiwizacja ----------------------------------------- */

  it("nie można zarchiwizować turnieju wyświetlanego publicznie", async () => {
    await expect(
      postgresRepository.setTournamentArchived(tournamentA, true)
    ).rejects.toBeInstanceOf(TournamentOperationError);

    const rows = await getDb()
      .select({ archivedAt: tournaments.archivedAt })
      .from(tournaments)
      .where(eq(tournaments.id, tournamentA))
      .limit(1);

    expect(rows[0].archivedAt).toBeNull();
  });

  it("archiwizacja zachowuje wszystkie dane i pozwala odczytać turniej", async () => {
    const before = await countsFor(tournamentB);

    await postgresRepository.setTournamentArchived(tournamentB, true);

    expect(await countsFor(tournamentB)).toEqual(before);

    const result = await postgresRepository.getTournamentById(tournamentB);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    expect(result.tournament.groups?.[0].teams).toHaveLength(2);
    expect(result.tournament.groups?.[0].matches).toHaveLength(1);

    const list = await postgresRepository.listTournaments();
    expect(list.find((item) => item.id === tournamentB)?.archivedAt).not.toBeNull();
  });

  it("zarchiwizowanego turnieju nie można ustawić jako wyświetlanego", async () => {
    await expect(
      postgresRepository.setCurrentTournament(tournamentB)
    ).rejects.toBeInstanceOf(TournamentOperationError);
  });

  it("archiwizację można cofnąć", async () => {
    await postgresRepository.setTournamentArchived(tournamentB, false);

    const list = await postgresRepository.listTournaments();
    expect(list.find((item) => item.id === tournamentB)?.archivedAt).toBeNull();
  });
});
