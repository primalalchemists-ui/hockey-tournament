import { describe, expect, it } from "vitest";

import { calculateStandings } from "@/lib/standings";
import { validateGroupScore } from "@/lib/playoff/rules";
import { plannedMatchesForScope, roundRobinMatchCount } from "@/lib/playoff/planned-matches";
import {
  assertRowArithmetic,
  buildGroup,
  deterministicRoundRobin,
  expectedPairCount,
  idsOf,
  match,
  orderOf,
  totalGoalsAgainst,
  totalGoalsFor,
  totalPlayed,
} from "../helpers/scenario";

/**
 * U10-A / U10-B / U10-C — postęp, klasy wyników, zwykłe porządkowanie.
 *
 * Warstwa UNIT: czysta funkcja `calculateStandings`, zero bazy.
 * Identyfikatory scenariuszy pochodzą z
 * `docs/sun-cup-u8-u10-final-torture-test-matrix.md`.
 */

const TEN = idsOf(10);

describe("U10-A — postęp i stan początkowy", () => {
  it("U10-A01 — grupa bez ani jednego wyniku", () => {
    const rows = calculateStandings(buildGroup(TEN, []));

    expect(rows).toHaveLength(10);
    expect(orderOf(rows)).toEqual(TEN);
    expect(rows.map((row) => row.position)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);

    for (const row of rows) {
      expect(row.played).toBe(0);
      expect(row.points).toBe(0);
      expect(row.goalsFor).toBe(0);
      expect(row.goalsAgainst).toBe(0);
      expect(row.goalDifference).toBe(0);
      expect(row.tieNote).toBeUndefined();
      assertRowArithmetic(row, expect);
    }
  });

  it("U10-A02 — jeden wynik z 45 rusza dokładnie dwie drużyny", () => {
    const rows = calculateStandings(
      buildGroup(TEN, [match("t1", "t2", 3, 1)])
    );

    const played = rows.filter((row) => row.played === 1);
    expect(played).toHaveLength(2);
    expect(totalPlayed(rows)).toBe(2);

    expect(rows.find((row) => row.teamId === "t1")!.points).toBe(3);
    expect(rows.find((row) => row.teamId === "t2")!.points).toBe(0);
    expect(totalGoalsFor(rows)).toBe(totalGoalsAgainst(rows));
  });

  it("U10-A03 — postęp częściowy jest deterministyczny", () => {
    const partial = deterministicRoundRobin(TEN).slice(0, 23);
    const group = buildGroup(TEN, partial);

    const first = calculateStandings(group);
    const second = calculateStandings(group);

    expect(orderOf(first)).toEqual(orderOf(second));
    expect(totalPlayed(first)).toBe(46);
    for (const row of first) expect(row.tieNote).toBeUndefined();
  });

  it("U10-A04 — 44/45 to nadal grupa niekompletna", () => {
    const all = deterministicRoundRobin(TEN);
    expect(all).toHaveLength(45);

    const rows = calculateStandings(buildGroup(TEN, all.slice(0, 44)));

    // Brak komunikatu o karnych, choć tabela jest policzona.
    for (const row of rows) expect(row.tieNote).toBeUndefined();
  });

  it("U10-A05 — 45/45 włącza komunikat o karnych przy pełnym remisie", () => {
    // Trzy drużyny w zamkniętym cyklu, reszta rozstrzygnięta.
    const ids = idsOf(3);
    const rows = calculateStandings(
      buildGroup(ids, [
        match("t1", "t2", 1, 0),
        match("t2", "t3", 1, 0),
        match("t3", "t1", 1, 0),
      ])
    );

    expect(expectedPairCount(3)).toBe(3);
    for (const row of rows) {
      expect(row.isTieUnresolved).toBe(true);
      expect(row.tieNote).toContain("rzuty karne");
    }
  });

  it("U10-A06 — planowana liczba meczów nie zależy od postępu", () => {
    expect(roundRobinMatchCount(10)).toBe(45);

    const planned = plannedMatchesForScope({
      teamCount: 10,
      format: "league",
      playoffConfig: null,
    });

    expect(planned).toBe(45);
    // Dwie grupy => 90 dla całego turnieju.
    expect(planned * 2).toBe(90);
  });
});

describe("U10-B — klasy wyników", () => {
  it("U10-B01 — zwycięstwo i porażka", () => {
    const rows = calculateStandings(
      buildGroup(["a", "b"], [match("a", "b", 4, 2)])
    );

    const a = rows.find((row) => row.teamId === "a")!;
    const b = rows.find((row) => row.teamId === "b")!;

    expect(a.points).toBe(3);
    expect(a.wins).toBe(1);
    expect(b.points).toBe(0);
    expect(b.losses).toBe(1);
  });

  it("U10-B02 — remis niezerowy", () => {
    const rows = calculateStandings(
      buildGroup(["a", "b"], [match("a", "b", 2, 2)])
    );

    for (const row of rows) {
      expect(row.points).toBe(1);
      expect(row.draws).toBe(1);
      expect(row.goalDifference).toBe(0);
    }
  });

  it("U10-B03 — remis bezbramkowy liczy się jak mecz", () => {
    const rows = calculateStandings(
      buildGroup(["a", "b"], [match("a", "b", 0, 0)])
    );

    for (const row of rows) {
      expect(row.played).toBe(1);
      expect(row.points).toBe(1);
      expect(row.goalsFor).toBe(0);
      expect(row.goalsAgainst).toBe(0);
    }
  });

  it("U10-B04 — czyste konto", () => {
    const rows = calculateStandings(
      buildGroup(["a", "b"], [match("a", "b", 3, 0)])
    );

    expect(rows.find((row) => row.teamId === "a")!.goalsAgainst).toBe(0);
  });

  it("U10-B05 — wysoki wynik nie psuje arytmetyki", () => {
    const rows = calculateStandings(
      buildGroup(["a", "b"], [match("a", "b", 20, 0)])
    );

    expect(rows.find((row) => row.teamId === "a")!.goalDifference).toBe(20);
    expect(rows.find((row) => row.teamId === "b")!.goalDifference).toBe(-20);
    expect(totalGoalsFor(rows)).toBe(totalGoalsAgainst(rows));
  });

  it("U10-B06 — wynik połowiczny jest odrzucany", () => {
    const result = validateGroupScore(3, null);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("obu drużyn");
    }

    // Kompletny brak wyniku jest poprawny — mecz po prostu nierozegrany.
    expect(validateGroupScore(null, null).ok).toBe(true);
  });

  it("U10-B07 — wynik ujemny i niecałkowity są odrzucane", () => {
    expect(validateGroupScore(-1, 0).ok).toBe(false);
    expect(validateGroupScore(1.5, 0).ok).toBe(false);
    // Remis jest w fazie grupowej całkowicie legalny.
    expect(validateGroupScore(2, 2).ok).toBe(true);
  });
});

describe("U10-C — zwykłe porządkowanie", () => {
  it("U10-C01 — punkty decydują przed wszystkim innym", () => {
    /*
      a: 3 zwycięstwa = 9 pkt, bilans +3.
      b: 2 zwycięstwa = 6 pkt, bilans +30.
    */
    const rows = calculateStandings(
      buildGroup(
        ["a", "b", "c", "d"],
        [
          match("a", "b", 1, 0),
          match("a", "c", 1, 0),
          match("a", "d", 1, 0),
          match("b", "c", 20, 0),
          match("b", "d", 11, 0),
          match("c", "d", 0, 1),
        ]
      )
    );

    expect(rows[0].teamId).toBe("a");
    expect(rows[0].points).toBe(9);
    expect(rows[1].teamId).toBe("b");
    expect(rows[1].goalDifference).toBeGreaterThan(rows[0].goalDifference);
  });

  it("U10-C02 — pozycje tworzą ciągły ciąg 1..n", () => {
    const rows = calculateStandings(
      buildGroup(TEN, deterministicRoundRobin(TEN))
    );

    expect(rows.map((row) => row.position)).toEqual(
      Array.from({ length: 10 }, (_, index) => index + 1)
    );
    expect(new Set(orderOf(rows)).size).toBe(10);
  });
});
