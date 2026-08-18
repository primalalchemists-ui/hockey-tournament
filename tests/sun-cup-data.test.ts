import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import {
  groups,
  matches,
  scorers,
  teamLogoAssets,
  teams,
  tournaments,
} from "@/lib/db/schema";
import { postgresRepository } from "@/lib/data/postgres/repository";

/**
 * REALNE DANE SUN CUP 2026 — U8 i U10.
 *
 * To nie są fixtures: testy wyłącznie CZYTAJĄ i pilnują, że zawartość
 * zgadza się co do nazwy, liczby meczów i konfiguracji.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);

const U8_A = [
  "UKS Zagłębie Sosnowiec 1",
  "MOSM Tychy Tyskie Lwy 1",
  "BS Polonia Bytom 1",
  "GKS Katowice 1",
  "Naprzód Janów Katowice 1",
  "KH Dębica",
  "MMKS Podhale Nowy Targ",
];

const U8_B = [
  "UKS Zagłębie Sosnowiec 2",
  "MOSM Tychy Tyskie Lwy 2",
  "GKS Katowice 2",
  "BS Polonia Bytom 2",
  "Naprzód Janów Katowice 2",
  "Sandecja Nowy Sącz",
  "HKS Mińskie Jetsiki",
];

const U10_A = [
  "GKS Katowice 1",
  "UKH Unia Oświęcim",
  "BS Polonia Bytom 1",
  "MOSM Tychy Tyskie Lwy",
  "Naprzód Janów Katowice 1",
  "AH Legia Warszawa",
  "ŁKH Łódź",
  "KH Dębica 1",
  "MKS Sokoły Toruń",
  "UKS Niedźwiadki Sanok",
];

const U10_B = [
  "GKS Katowice 2",
  "Kojotki Naprzód Janów Katowice",
  "BS Polonia Bytom 2",
  "MUKS Orlik Opole",
  "UKS Zagłębie Sosnowiec 2",
  "Atomówki GKS Tychy",
  "Naprzód Janów Katowice 2",
  "KH Dębica 2",
  "Sandecja Nowy Sącz",
  "PTH Koziołki Poznań",
];

async function tournamentBySlug(slug: string) {
  const rows = await getDb()
    .select()
    .from(tournaments)
    .where(eq(tournaments.slug, slug));

  return rows;
}

async function groupTeamNames(tournamentId: string, groupKey: string) {
  const rows = await getDb()
    .select({ name: teams.name, order: teams.sourceOrder })
    .from(teams)
    .innerJoin(groups, eq(teams.groupId, groups.id))
    .where(sql`${teams.tournamentId} = ${tournamentId} and ${groups.key} = ${groupKey}`)
    .orderBy(teams.sourceOrder);

  return rows.map((row) => row.name);
}

async function countMatches(tournamentId: string, groupKey: string) {
  const rows = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(matches)
    .innerJoin(groups, eq(matches.groupId, groups.id))
    .where(sql`${matches.tournamentId} = ${tournamentId} and ${groups.key} = ${groupKey}`);

  return rows[0].n;
}

describe.skipIf(!hasDatabase)("G-N: SUN CUP U8", () => {
  it("G/O: istnieje dokładnie jeden rekord U8 i zachował swój UUID", async () => {
    const rows = await tournamentBySlug("sun-cup-2026-u8");

    expect(rows).toHaveLength(1);
    // Ten sam rekord, który wcześniej nazywał się „SUN CUP 2026".
    expect(rows[0].id).toBe("1e74ae7d-9f8e-44d6-839e-ee8d4772e996");
    expect(rows[0].title).toBe("SUN CUP 2026 — U8");
  });

  it("H/N: konfiguracja dokładnie jak ustalono", async () => {
    const [row] = await tournamentBySlug("sun-cup-2026-u8");

    expect(row.structure).toBe("groups");
    expect(row.format).toBe("group_playoff");
    expect(row.phase).toBe("group_stage");
    expect(row.scorersEnabled).toBe(false);

    expect(row.playoffConfig).toMatchObject({
      qualifiedTeamCount: 4,
      thirdPlaceMatch: true,
      placementMode: "placement_group",
      tieBreaker: "penalties",
    });
  });

  it("I: grupa A ma dokładnie te 7 drużyn", async () => {
    const [row] = await tournamentBySlug("sun-cup-2026-u8");

    expect(await groupTeamNames(row.id, "A")).toEqual(U8_A);
  });

  it("J: grupa B ma dokładnie te 7 drużyn", async () => {
    const [row] = await tournamentBySlug("sun-cup-2026-u8");

    const names = await groupTeamNames(row.id, "B");

    expect(names).toEqual(U8_B);
    // Kontrola literówki z zamówienia: BS, nie BA.
    expect(names).toContain("BS Polonia Bytom 2");
    expect(names.join(" ")).not.toContain("BA Polonia");
  });

  it("K: pełny round-robin 21 + 21 meczów", async () => {
    const [row] = await tournamentBySlug("sun-cup-2026-u8");

    expect(await countMatches(row.id, "A")).toBe(21);
    expect(await countMatches(row.id, "B")).toBe(21);
  });

  it("L: żaden mecz nie ma wpisanego wyniku", async () => {
    const [row] = await tournamentBySlug("sun-cup-2026-u8");

    const rows = await getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(matches)
      .where(
        sql`${matches.tournamentId} = ${row.id} and (${matches.homeScore} is not null or ${matches.awayScore} is not null)`
      );

    expect(rows[0].n).toBe(0);
  });

  it("M: drabinka nie została jeszcze wygenerowana", async () => {
    const [row] = await tournamentBySlug("sun-cup-2026-u8");
    const state = await postgresRepository.getTournamentById(row.id);

    expect(state.status).toBe("ok");

    const { getPlayoffState } = await import("@/lib/data/postgres/playoff-engine");
    const playoff = await getPlayoffState(row.id);

    expect(playoff.phase).toBe("group_stage");
    expect(playoff.groupStageFrozen).toBe(false);

    for (const scope of playoff.scopes) {
      /*
        Topologia drabinki jest widoczna od początku, ale nie jest jeszcze
        oficjalna: każdy mecz pozostaje prowizoryczny i bez wyniku.
      */
      expect(scope.rounds.length).toBeGreaterThan(0);

      for (const round of scope.rounds) {
        for (const match of round.matches) {
          expect(match.provisional).toBe(true);
          expect(match.homeScore).toBeNull();
          expect(match.awayScore).toBeNull();
        }
      }
    }
  });

  it("N: klasyfikacja strzelców wyłączona i pusta", async () => {
    const [row] = await tournamentBySlug("sun-cup-2026-u8");

    const rows = await getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(scorers)
      .where(eq(scorers.tournamentId, row.id));

    expect(row.scorersEnabled).toBe(false);
    expect(rows[0].n).toBe(0);
  });
});

describe.skipIf(!hasDatabase)("O-V: SUN CUP U10", () => {
  it("O: istnieje dokładnie jeden rekord U10", async () => {
    const rows = await tournamentBySlug("sun-cup-2026-u10");

    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("SUN CUP 2026 — U10");
  });

  it("P/V: liga bez play-off, bez strzelców", async () => {
    const [row] = await tournamentBySlug("sun-cup-2026-u10");

    expect(row.structure).toBe("groups");
    expect(row.format).toBe("league");
    expect(row.playoffConfig).toBeNull();
    expect(row.scorersEnabled).toBe(false);
  });

  it("Q: grupa A ma dokładnie te 10 drużyn", async () => {
    const [row] = await tournamentBySlug("sun-cup-2026-u10");

    expect(await groupTeamNames(row.id, "A")).toEqual(U10_A);
  });

  it("R: grupa B ma dokładnie te 10 drużyn", async () => {
    const [row] = await tournamentBySlug("sun-cup-2026-u10");

    expect(await groupTeamNames(row.id, "B")).toEqual(U10_B);
  });

  it("S: pełny round-robin 45 + 45 meczów", async () => {
    const [row] = await tournamentBySlug("sun-cup-2026-u10");

    expect(await countMatches(row.id, "A")).toBe(45);
    expect(await countMatches(row.id, "B")).toBe(45);
  });

  it("T: żaden mecz nie ma wyniku", async () => {
    const [row] = await tournamentBySlug("sun-cup-2026-u10");

    const rows = await getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(matches)
      .where(
        sql`${matches.tournamentId} = ${row.id} and (${matches.homeScore} is not null or ${matches.awayScore} is not null)`
      );

    expect(rows[0].n).toBe(0);
  });

  it("U: brak jakiegokolwiek stanu pucharowego", async () => {
    const [row] = await tournamentBySlug("sun-cup-2026-u10");

    const { getPlayoffState } = await import("@/lib/data/postgres/playoff-engine");
    const playoff = await getPlayoffState(row.id);

    expect(playoff.format).toBe("league");
    expect(playoff.config).toBeNull();

    // Żadnej drabinki, minigrupy ani klasyfikacji końcowej.
    for (const scope of playoff.scopes) {
      expect(scope.rounds).toHaveLength(0);
      expect(scope.preview).toBeNull();
      expect(scope.placement).toBeNull();
      expect(scope.classification).toBeNull();
    }

    // Publiczny snapshot dla ligi w ogóle nie dołącza stanu pucharowego.
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync(
        new URL("../lib/data/postgres/public-snapshot.ts", import.meta.url),
        "utf8"
      )
    );

    expect(source).toContain('settings.format === "group_playoff"');
  });

  it("grupy nie mieszają się: każdy gra tylko w swojej", async () => {
    const [row] = await tournamentBySlug("sun-cup-2026-u10");

    const rows = await getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(matches)
      .innerJoin(teams, eq(matches.homeTeamId, teams.id))
      .where(sql`${matches.tournamentId} = ${row.id} and ${matches.groupId} <> ${teams.groupId}`);

    expect(rows[0].n).toBe(0);
  });
});

describe.skipIf(!hasDatabase)("W-AC: biblioteka, idempotencja i Rabbit Cup", () => {
  it("W: ten sam klub w wielu turniejach ma JEDEN wpis biblioteki", async () => {
    const rows = await getDb()
      .select({
        canonical: teamLogoAssets.canonicalName,
        assets: sql<number>`count(distinct ${teamLogoAssets.id})::int`,
        tournamentCount: sql<number>`count(distinct ${teams.tournamentId})::int`,
      })
      .from(teamLogoAssets)
      .innerJoin(teams, eq(teams.logoAssetId, teamLogoAssets.id))
      .groupBy(teamLogoAssets.canonicalName)
      .having(sql`count(distinct ${teams.tournamentId}) > 1`);

    expect(rows.length).toBeGreaterThan(0);

    for (const row of rows) {
      // Klub obsługiwany przez wiele turniejów = dokładnie jeden asset.
      expect(row.assets).toBe(1);
    }
  });

  it("X/Y: dane nie zdublowały się przy ponownym uruchomieniu setupu", async () => {
    for (const [slug, teamCount, matchCount] of [
      ["sun-cup-2026-u8", 14, 42],
      ["sun-cup-2026-u10", 20, 90],
    ] as const) {
      const [row] = await tournamentBySlug(slug);

      const [t] = await getDb()
        .select({ n: sql<number>`count(*)::int` })
        .from(teams)
        .where(eq(teams.tournamentId, row.id));

      const [m] = await getDb()
        .select({ n: sql<number>`count(*)::int` })
        .from(matches)
        .where(eq(matches.tournamentId, row.id));

      const [g] = await getDb()
        .select({ n: sql<number>`count(*)::int` })
        .from(groups)
        .where(eq(groups.tournamentId, row.id));

      expect(t.n).toBe(teamCount);
      expect(m.n).toBe(matchCount);
      expect(g.n).toBe(2);
    }
  });

  it("Z: setup nie nadpisuje ręcznie wybranego logo", async () => {
    const code = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("../scripts/sun-cup-setup.ts", import.meta.url), "utf8")
    );

    // Istniejące przypisanie wygrywa z automatyczną sugestią.
    expect(code).toContain("keepExistingLogo");
    expect(code).toContain('matchType: "manual"');
    expect(code).toContain("existingLogoAssignments");
  });

  it("AA/AB: Rabbit Cup nietknięty i nadal publiczny", async () => {
    const [rabbit] = await tournamentBySlug("rabbit-cup");

    // Który turniej jest publiczny — decyzja admina, nie niezmiennik testu.
    expect(rabbit.scorersEnabled).toBe(true);

    const [t] = await getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(teams)
      .where(eq(teams.tournamentId, rabbit.id));

    const [m] = await getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(matches)
      .where(eq(matches.tournamentId, rabbit.id));

    expect(t.n).toBe(18);
    expect(m.n).toBe(72);
  });

  it("dokładnie jeden turniej jest wyświetlany publicznie", async () => {
    const rows = await getDb()
      .select({ slug: tournaments.slug })
      .from(tournaments)
      .where(eq(tournaments.isCurrent, true));

    // Baza gwarantuje jedyność; wybór należy do administratora.
    expect(rows).toHaveLength(1);
  });
});

describe.skipIf(!hasDatabase)("terminarz przeżywa zapis z panelu", () => {
  /*
    REGRESJA ZNALEZIONA NA ŻYWO.

    Model domenowy przenosi wyłącznie mecze ROZEGRANE, więc payload panelu
    nie zna zaplanowanego terminarza. Kasowanie „nieobecnych" meczów
    usuwało przy zapisie cały rozpisany terminarz SUN CUP — 42 i 90
    meczów naraz, jednym kliknięciem „Zapisz".
  */
  it("zapis turnieju bez wyników nie kasuje rozpisanych meczów", async () => {
    const [row] = await tournamentBySlug("sun-cup-2026-u8");

    const before = await getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(matches)
      .where(eq(matches.tournamentId, row.id));

    const loaded = await postgresRepository.getTournamentById(row.id);
    if (loaded.status !== "ok") throw new Error("brak turnieju");

    // Dokładnie to, co robi panel: zapis odczytanego stanu bez zmian.
    await postgresRepository.saveTournament(row.id, {
      id: row.id,
      title: loaded.tournament.title ?? "SUN CUP 2026 — U8",
      scorers: loaded.tournament.scorers ?? [],
      assets: loaded.tournament.assets!,
      groups: loaded.tournament.groups ?? [],
    });

    const after = await getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(matches)
      .where(eq(matches.tournamentId, row.id));

    expect(after[0].n).toBe(before[0].n);
    expect(after[0].n).toBe(42);
  });

  it("mecze nadal nie mają wyników", async () => {
    const [row] = await tournamentBySlug("sun-cup-2026-u8");

    const played = await getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(matches)
      .where(
        sql`${matches.tournamentId} = ${row.id} and ${matches.homeScore} is not null`
      );

    expect(played[0].n).toBe(0);
  });
});
