import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { groups, matches, teams, tournaments } from "@/lib/db/schema";
import { getPlayoffState } from "@/lib/data/postgres/playoff-engine";
import { calculatePlannedMatchCount } from "@/lib/playoff/planned-matches";
import {
  buildScoredRoundRobin,
  planRehearsalSetup,
} from "@/scripts/rehearsal-setup";
import type { Team } from "@/types/tournament";

/**
 * RĘCZNA PRÓBA GENERALNA — turniej „PLAYOFF REHEARSAL — MANUAL".
 *
 * To NIE jest fixture: turniej ma przeżyć testy i czekać na człowieka
 * dokładnie w momencie „faza grupowa rozegrana, teraz zamknij grupy".
 * Testy wyłącznie CZYTAJĄ i pilnują tego stanu.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);
const SLUG = "playoff-rehearsal-manual";

async function loadTournament() {
  const rows = await getDb()
    .select()
    .from(tournaments)
    .where(eq(tournaments.slug, SLUG));

  return rows;
}

describe.skipIf(!hasDatabase)("W-Z: turniej do ręcznej próby", () => {
  it("W: istnieje dokładnie jeden taki turniej", async () => {
    const rows = await loadTournament();

    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("PLAYOFF REHEARSAL — MANUAL");
  });

  it("X: nie jest wyświetlany publicznie", async () => {
    const [row] = await loadTournament();

    expect(row.isCurrent).toBe(false);
  });

  it("X: konfiguracja jest lustrem SUN CUP U8", async () => {
    const [row] = await loadTournament();

    expect(row.structure).toBe("groups");
    expect(row.format).toBe("group_playoff");
    expect(row.scorersEnabled).toBe(false);
    expect(row.playoffConfig).toMatchObject({
      qualifiedTeamCount: 4,
      thirdPlaceMatch: true,
      placementMode: "placement_group",
      tieBreaker: "penalties",
    });
  });

  /*
    Ten turniej jest ROZGRYWANY RĘCZNIE, więc jego faza z założenia się
    zmienia — testy nie mogą przypinać go do jednego momentu. Sprawdzamy
    niezmienniki, które muszą trzymać przez cały przebieg próby:
    faza pochodzi z oficjalnej sekwencji i nigdy nie cofa się sama.
  */
  it("Y: faza należy do oficjalnej sekwencji turnieju", async () => {
    const [row] = await loadTournament();

    expect([
      "group_stage",
      "semifinal",
      "final",
      "completed",
    ]).toContain(row.phase);

    const state = await getPlayoffState(row.id);

    // Zamrożenie i faza pucharowa zawsze idą w parze.
    expect(state.groupStageFrozen).toBe(row.phase !== "group_stage");
  });

  it("Z: dwie grupy po 7 drużyn o testowych nazwach", async () => {
    const [row] = await loadTournament();

    const groupRows = await getDb()
      .select()
      .from(groups)
      .where(eq(groups.tournamentId, row.id));

    expect(groupRows.map((group) => group.key).sort()).toEqual(["A", "B"]);

    const teamRows = await getDb()
      .select({ name: teams.name })
      .from(teams)
      .where(eq(teams.tournamentId, row.id));

    expect(teamRows).toHaveLength(14);

    // Nazwy są jawnie testowe — nikt nie pomyli tego z prawdziwym eventem.
    for (const team of teamRows) {
      expect(team.name).toMatch(/^[AB][1-7]$/);
    }
  });

  it("Z: faza grupowa jest rozegrana w całości", async () => {
    const [row] = await loadTournament();

    // Wyłącznie mecze grupowe: drabinka i minigrupa dochodzą później,
    // w tempie ręcznej próby, i nie są tu przedmiotem asercji.
    const [counts] = await getDb()
      .select({
        total: sql<number>`count(*)::int`,
        scored: sql<number>`count(${matches.homeScore})::int`,
      })
      .from(matches)
      .where(
        sql`${matches.tournamentId} = ${row.id} and ${matches.stage} = 'group'`
      );

    expect(counts.total).toBe(42);
    expect(counts.scored).toBe(42);
  });

  it("Z: przy odcięciu 4/5 nie ma nierozstrzygniętego remisu", async () => {
    const [row] = await loadTournament();
    const state = await getPlayoffState(row.id);

    for (const scope of state.scopes) {
      const key = scope.groupKey;

      expect(scope.groupStandings.map((standing) => standing.teamName)).toEqual([
        `${key}1`,
        `${key}2`,
        `${key}3`,
        `${key}4`,
        `${key}5`,
        `${key}6`,
        `${key}7`,
      ]);

      for (const standing of scope.groupStandings) {
        expect(standing.isTieUnresolved ?? false).toBe(false);
      }
    }
  });

  it("Z: rozstawienie półfinałów to 1-4 i 2-3 w obu grupach", async () => {
    const [row] = await loadTournament();
    const state = await getPlayoffState(row.id);

    for (const scope of state.scopes) {
      const key = scope.groupKey.toLowerCase();
      const expected = [
        [`${key}1`, `${key}4`],
        [`${key}2`, `${key}3`],
      ];

      if (state.phase === "group_stage") {
        // Przed zamrożeniem: podgląd z bieżącej tabeli.
        expect(
          scope.preview?.pairs.map((pair) => [pair.homeTeamId, pair.awayTeamId])
        ).toEqual(expected);
        expect(scope.preview?.isReliable).toBe(true);
        continue;
      }

      // Po zamrożeniu: oficjalna drabinka z zamrożonego snapshotu.
      expect(scope.snapshot?.map((entry) => entry.teamId)).toEqual(
        Array.from({ length: 7 }, (_, index) => `${key}${index + 1}`)
      );

      const semifinal = scope.rounds.find(
        (round) => round.kind === "semifinal"
      );

      expect(
        semifinal?.matches.map((match) => [
          match.home?.teamId,
          match.away?.teamId,
        ])
      ).toEqual(expected);
    }
  });

  it("planowana liczba meczów to 56, choć w bazie jest ich 42", async () => {
    const [row] = await loadTournament();

    expect(
      calculatePlannedMatchCount({
        format: "group_playoff",
        playoffConfig: row.playoffConfig as never,
        scopes: [{ teamCount: 7 }, { teamCount: 7 }],
      })
    ).toBe(56);
  });
});

describe("ponowny setup nie kasuje ręcznej rozgrywki", () => {
  it("bez turnieju: tworzy", () => {
    expect(planRehearsalSetup(null)).toBe("create");
  });

  it("faza grupowa: odświeża terminarz i wyniki grupowe", () => {
    expect(planRehearsalSetup({ phase: "group_stage" })).toBe("refresh");
  });

  it("po zamknięciu grup: nie rusza niczego", () => {
    // Tu zaczyna się ręczna próba — skrypt nie ma prawa jej cofnąć.
    for (const phase of ["semifinal", "final", "completed"]) {
      expect(planRehearsalSetup({ phase })).toBe("skip");
    }
  });
});

describe("terminarz próby generalnej jest deterministyczny", () => {
  const teamList: Team[] = Array.from({ length: 7 }, (_, index) => ({
    id: `a${index + 1}`,
    name: `A${index + 1}`,
    sourceOrder: index + 1,
  }));

  it("ten sam skład zawsze daje ten sam terminarz", () => {
    expect(buildScoredRoundRobin("A", teamList)).toEqual(
      buildScoredRoundRobin("A", teamList)
    );
  });

  it("każda para gra dokładnie raz i każdy mecz ma wynik", () => {
    const schedule = buildScoredRoundRobin("A", teamList);

    expect(schedule).toHaveLength(21);
    expect(new Set(schedule.map((match) => match.id)).size).toBe(21);

    for (const match of schedule) {
      expect(match.homeScore).not.toBe(match.awayScore);
    }
  });

  it("silniejsza drużyna wygrywa każdy mecz", () => {
    for (const match of buildScoredRoundRobin("A", teamList)) {
      const home = Number(match.homeTeamId.slice(1));
      const away = Number(match.awayTeamId.slice(1));
      const winner = match.homeScore > match.awayScore ? home : away;

      expect(winner).toBe(Math.min(home, away));
    }
  });
});
