import { describe, expect, it } from "vitest";

import { calculateStandings } from "@/lib/standings";
import { buildGroup, match, orderOf } from "./helpers/build-group";

/**
 * Testy utrwalają OBECNE zachowanie lib/standings.ts.
 *
 * To jest siatka bezpieczeństwa przed V2 i przed migracją bazy — jeśli
 * którykolwiek z tych testów zacznie padać, oznacza to zmianę regulaminu
 * klasyfikacji, a nie "drobny refaktor".
 */

describe("punktacja", () => {
  it("przyznaje 3 pkt za wygraną, 1 za remis, 0 za porażkę", () => {
    const group = buildGroup(
      ["a", "b", "c"],
      [match("a", "b", 2, 0), match("b", "c", 1, 1)]
    );

    const rows = calculateStandings(group);
    const byId = new Map(rows.map((row) => [row.teamId, row]));

    expect(byId.get("a")).toMatchObject({
      played: 1,
      wins: 1,
      draws: 0,
      losses: 0,
      points: 3,
      goalsFor: 2,
      goalsAgainst: 0,
      goalDifference: 2,
    });

    expect(byId.get("b")).toMatchObject({
      played: 2,
      wins: 0,
      draws: 1,
      losses: 1,
      points: 1,
      goalsFor: 1,
      goalsAgainst: 3,
      goalDifference: -2,
    });

    expect(byId.get("c")).toMatchObject({
      played: 1,
      wins: 0,
      draws: 1,
      losses: 0,
      points: 1,
      goalsFor: 1,
      goalsAgainst: 1,
      goalDifference: 0,
    });
  });

  it("sortuje malejąco po punktach i nadaje pozycje 1..n", () => {
    const group = buildGroup(
      ["a", "b", "c"],
      [match("a", "b", 5, 0), match("a", "c", 5, 0), match("b", "c", 1, 0)]
    );

    const rows = calculateStandings(group);

    expect(orderOf(rows)).toEqual(["a", "b", "c"]);
    expect(rows.map((row) => row.position)).toEqual([1, 2, 3]);
  });
});

describe("tie-breaker: bezpośredni mecz (dokładnie 2 drużyny)", () => {
  it("bezpośredni mecz ma pierwszeństwo przed różnicą bramek", () => {
    // a: +2 bilansu, b: +1 bilansu, ale b wygrało bezpośredni mecz.
    const group = buildGroup(
      ["a", "b", "c"],
      [match("a", "c", 3, 0), match("b", "a", 1, 0)]
    );

    const rows = calculateStandings(group);
    const byId = new Map(rows.map((row) => [row.teamId, row]));

    expect(byId.get("a")?.points).toBe(3);
    expect(byId.get("b")?.points).toBe(3);
    expect(byId.get("a")?.goalDifference).toBe(2);
    expect(byId.get("b")?.goalDifference).toBe(1);

    // Mimo gorszego bilansu "b" jest wyżej — decyduje bezpośredni mecz.
    expect(orderOf(rows)).toEqual(["b", "a", "c"]);
  });

  it("gdy bezpośredni mecz był remisowy, decyduje różnica bramek", () => {
    const group = buildGroup(
      ["a", "b", "c"],
      [match("a", "b", 1, 1), match("a", "c", 3, 0), match("b", "c", 1, 0)]
    );

    const rows = calculateStandings(group);
    const byId = new Map(rows.map((row) => [row.teamId, row]));

    expect(byId.get("a")?.points).toBe(4);
    expect(byId.get("b")?.points).toBe(4);
    expect(orderOf(rows).slice(0, 2)).toEqual(["a", "b"]);
  });
});

describe("tie-breaker: bramki", () => {
  it("przy równym bilansie decydują bramki strzelone", () => {
    const group = buildGroup(
      ["a", "b", "c", "d"],
      [
        match("a", "b", 2, 2),
        match("a", "c", 3, 1),
        match("b", "d", 2, 0),
      ]
    );

    const rows = calculateStandings(group);
    const byId = new Map(rows.map((row) => [row.teamId, row]));

    expect(byId.get("a")?.points).toBe(4);
    expect(byId.get("b")?.points).toBe(4);
    expect(byId.get("a")?.goalDifference).toBe(2);
    expect(byId.get("b")?.goalDifference).toBe(2);
    expect(byId.get("a")?.goalsFor).toBe(5);
    expect(byId.get("b")?.goalsFor).toBe(4);

    expect(orderOf(rows).slice(0, 2)).toEqual(["a", "b"]);
  });

  it("kryterium 'bramki stracone' jest matematycznie nieosiągalne", () => {
    // goalDifference jest liczone jako goalsFor - goalsAgainst, więc równy
    // bilans i równe bramki strzelone WYMUSZAJĄ równe bramki stracone.
    // Test utrwala ten fakt: piąte kryterium regulaminu nigdy nie decyduje,
    // a o kolejności rozstrzyga fallback techniczny (sourceOrder).
    const group = buildGroup(
      ["a", "b", "c", "d"],
      [match("a", "c", 2, 1), match("b", "d", 2, 1)]
    );

    const rows = calculateStandings(group);
    const byId = new Map(rows.map((row) => [row.teamId, row]));

    const a = byId.get("a")!;
    const b = byId.get("b")!;

    expect(a.points).toBe(b.points);
    expect(a.goalDifference).toBe(b.goalDifference);
    expect(a.goalsFor).toBe(b.goalsFor);
    expect(a.goalsAgainst).toBe(b.goalsAgainst);

    // brak bezpośredniego meczu => remis nierozstrzygnięty
    expect(a.isTieUnresolved).toBe(true);
    expect(b.isTieUnresolved).toBe(true);
    expect(orderOf(rows).slice(0, 2)).toEqual(["a", "b"]);
  });
});

describe("remis nierozstrzygnięty", () => {
  it("oznacza dwie drużyny o identycznych statystykach i remisowym meczu", () => {
    const group = buildGroup(
      ["a", "b", "c", "d"],
      [match("a", "b", 1, 1), match("a", "c", 2, 0), match("b", "d", 2, 0)]
    );

    const rows = calculateStandings(group);
    const byId = new Map(rows.map((row) => [row.teamId, row]));

    expect(byId.get("a")?.isTieUnresolved).toBe(true);
    expect(byId.get("b")?.isTieUnresolved).toBe(true);
    expect(byId.get("a")?.tieWithTeamIds).toEqual(["b"]);
    expect(byId.get("b")?.tieWithTeamIds).toEqual(["a"]);
  });

  it("NIE oznacza dwóch drużyn, jeśli bezpośredni mecz rozstrzyga", () => {
    const group = buildGroup(
      ["a", "b", "c"],
      [match("a", "c", 3, 0), match("b", "a", 1, 0)]
    );

    const rows = calculateStandings(group);

    for (const row of rows) {
      expect(row.isTieUnresolved).toBe(false);
    }
  });
});

describe("remis 3+ drużyn — regulaminowa mała tabela", () => {
  it("o kolejności decyduje bilans meczów między zainteresowanymi", () => {
    /*
      a wygrało bezpośredni mecz z b, ale w małej tabeli (a, b, c) to b ma
      bilans +4 wobec +1 u a. Mecz c-d jest poza koszykiem punktowym, więc
      do małej tabeli w ogóle nie wchodzi.
    */
    const group = buildGroup(
      ["a", "b", "c", "d"],
      [match("a", "b", 1, 0), match("b", "c", 5, 0), match("c", "d", 1, 0)]
    );

    const rows = calculateStandings(group);
    const byId = new Map(rows.map((row) => [row.teamId, row]));

    expect(byId.get("a")?.points).toBe(3);
    expect(byId.get("b")?.points).toBe(3);
    expect(byId.get("c")?.points).toBe(3);

    expect(orderOf(rows)).toEqual(["b", "a", "c", "d"]);
  });

  it("trzy identyczne drużyny w cyklu są oznaczone jako nierozstrzygnięte", () => {
    const group = buildGroup(
      ["a", "b", "c"],
      [match("a", "b", 1, 0), match("b", "c", 1, 0), match("c", "a", 1, 0)]
    );

    const rows = calculateStandings(group);

    for (const row of rows) {
      expect(row.points).toBe(3);
      expect(row.goalDifference).toBe(0);
      expect(row.isTieUnresolved).toBe(true);
      expect(row.tieWithTeamIds).toHaveLength(2);
    }

    expect(orderOf(rows)).toEqual(["a", "b", "c"]);
  });
});

describe("kompletność grupy a komunikat o karnych", () => {
  it("grupa kompletna: tieNote jest ustawiony", () => {
    // 3 drużyny => 3 mecze => grupa kompletna
    const group = buildGroup(
      ["a", "b", "c"],
      [match("a", "b", 1, 0), match("b", "c", 1, 0), match("c", "a", 1, 0)]
    );

    const rows = calculateStandings(group);

    for (const row of rows) {
      expect(row.tieNote).toBe(
        "Remis nierozstrzygnięty według kryteriów tabeli — o kolejności decydują rzuty karne."
      );
    }
  });

  it("grupa niekompletna: tieNote pozostaje pusty mimo remisu", () => {
    // 4 drużyny => oczekiwane 6 meczów, mamy 3 => grupa niekompletna
    const group = buildGroup(
      ["a", "b", "c", "d"],
      [match("a", "b", 1, 1), match("a", "c", 2, 0), match("b", "d", 2, 0)]
    );

    const rows = calculateStandings(group);
    const tied = rows.filter((row) => row.isTieUnresolved);

    expect(tied.length).toBeGreaterThan(0);

    for (const row of tied) {
      expect(row.tieNote).toBeUndefined();
    }
  });
});

describe("przypadki brzegowe", () => {
  it("pusta grupa nie rzuca wyjątku", () => {
    expect(calculateStandings(buildGroup([], []))).toEqual([]);
  });

  it("grupa bez meczów zwraca wyzerowane wiersze w kolejności sourceOrder", () => {
    const rows = calculateStandings(buildGroup(["a", "b", "c"], []));

    expect(orderOf(rows)).toEqual(["a", "b", "c"]);
    expect(rows.every((row) => row.played === 0 && row.points === 0)).toBe(true);
  });

  it("mecz wskazujący na nieistniejącą drużynę jest pomijany", () => {
    const group = buildGroup(
      ["a", "b"],
      [match("a", "b", 1, 0), match("a", "ghost", 9, 0)]
    );

    const rows = calculateStandings(group);
    const byId = new Map(rows.map((row) => [row.teamId, row]));

    expect(rows).toHaveLength(2);
    expect(byId.get("a")?.played).toBe(1);
    expect(byId.get("a")?.goalsFor).toBe(1);
  });

  it("nie mutuje danych wejściowych", () => {
    const group = buildGroup(["a", "b"], [match("a", "b", 3, 1)]);
    const snapshot = JSON.parse(JSON.stringify(group));

    calculateStandings(group);

    expect(group).toEqual(snapshot);
  });
});
