import { describe, expect, it } from "vitest";

import {
  buildHeadToHeadMiniTable,
  calculateStandings,
} from "@/lib/standings";
import type { Group, Match } from "@/types/tournament";

/**
 * REGULAMIN, PUNKT 6 — MAŁA TABELA.
 *
 * Przy remisie trzech lub więcej drużyn o kolejności decydują mecze
 * ROZEGRANE MIĘDZY NIMI, a nie bilans z całego turnieju. Dopiero gdy mała
 * tabela nie rozdziela, wracamy do liczb ogólnych: bramki zdobyte, potem
 * stracone. Na końcu regulamin przewiduje rzuty karne.
 *
 * Ścieżka dla DOKŁADNIE dwóch drużyn jest osobna i nietknięta — pilnują
 * jej testy 1-4.
 */

function team(id: string, sourceOrder: number) {
  return { id, name: id, logoText: id, sourceOrder };
}

function match(
  home: string,
  away: string,
  homeScore: number,
  awayScore: number
): Match {
  return {
    id: `${home}-${away}`,
    group: "A",
    homeTeamId: home,
    awayTeamId: away,
    homeScore,
    awayScore,
  };
}

/** Grupa z jawną kolejnością rejestracji — do testów `sourceOrder`. */
function buildGroup(teamIds: string[], matches: Match[]): Group {
  return {
    key: "A",
    name: "Grupa A",
    teams: teamIds.map((id, index) => team(id, index + 1)),
    matches,
  };
}

const order = (rows: ReturnType<typeof calculateStandings>) =>
  rows.map((row) => row.teamId);

/* ==========================================================================
 * 1-4: DWIE DRUŻYNY — BEZ ZMIAN
 * ======================================================================== */

describe("1-4: remis dwóch drużyn działa dokładnie jak dotąd", () => {
  it("1: decyduje mecz bezpośredni", () => {
    const rows = calculateStandings(
      buildGroup(
        ["a", "b", "c"],
        [match("a", "b", 1, 0), match("b", "c", 9, 0), match("c", "a", 1, 0)]
      )
    );

    // b ma znacznie lepszy bilans ogólny, ale przegrało z a.
    const tied = rows.filter((row) => row.points === 3);
    expect(tied).toHaveLength(3);

    // Trzy drużyny = punkt 6, nie mecz bezpośredni — patrz testy niżej.
    // Tu sprawdzamy PARĘ: a i b same, bez trzeciej drużyny w koszyku.
    const pair = calculateStandings(
      buildGroup(
        ["a", "b"],
        [match("a", "b", 1, 0), match("b", "a", 0, 5)]
      )
    );

    expect(order(pair)).toEqual(["a", "b"]);
  });

  it("2: remisowy mecz bezpośredni → decyduje bilans ogólny", () => {
    const rows = calculateStandings(
      buildGroup(
        ["a", "b", "c"],
        [
          match("a", "b", 2, 2),
          match("a", "c", 5, 0),
          match("b", "c", 1, 0),
          // c przegrywa oba, więc a i b zostają same na 4 punktach.
        ]
      )
    );

    expect(rows[0].teamId).toBe("a");
    expect(rows[0].points).toBe(4);
    expect(rows[1].points).toBe(4);
  });

  it("3/4: przy równym bilansie decydują bramki zdobyte, potem stracone", () => {
    const rows = calculateStandings(
      buildGroup(
        ["a", "b", "c", "d"],
        [
          match("a", "b", 0, 0),
          match("a", "c", 3, 1),
          match("b", "d", 2, 0),
          match("c", "d", 0, 0),
        ]
      )
    );

    const a = rows.find((row) => row.teamId === "a")!;
    const b = rows.find((row) => row.teamId === "b")!;

    expect(a.points).toBe(b.points);
    expect(a.goalDifference).toBe(b.goalDifference);
    // Ta sama różnica, ale a strzeliło więcej.
    expect(a.goalsFor).toBeGreaterThan(b.goalsFor);
    expect(order(rows).indexOf("a")).toBeLessThan(order(rows).indexOf("b"));
  });
});

/* ==========================================================================
 * 5-10: TRZY DRUŻYNY
 * ======================================================================== */

describe("5-10: remis trzech drużyn", () => {
  it("5/6: mała tabela ma pierwszeństwo nad bilansem ogólnym", () => {
    /*
      Bilans OGÓLNY sugerowałby a > b > c, bo a rozbiło outsidera 22:0.
      Mecze między zainteresowanymi mówią co innego — i to one decydują.
    */
    const rows = calculateStandings(
      buildGroup(
        ["a", "b", "c", "d"],
        [
          // cykl: b bije a, c bije b, a bije c
          match("a", "b", 0, 2),
          match("b", "c", 1, 2),
          match("c", "a", 0, 1),
          // każdy ogrywa outsidera, ale a robi to najokazalej
          match("a", "d", 22, 0),
          match("b", "d", 11, 0),
          match("c", "d", 5, 0),
        ]
      )
    );

    const tied = rows.filter((row) => row.teamId !== "d");

    expect(tied.every((row) => row.points === 6)).toBe(true);
    // mała tabela: b +1, c 0, a -1
    expect(tied.map((row) => row.teamId)).toEqual(["b", "c", "a"]);

    // a ma NAJLEPSZY bilans ogólny, a mimo to jest ostatnie w koszyku.
    const a = rows.find((row) => row.teamId === "a")!;
    expect(a.goalDifference).toBeGreaterThan(
      rows.find((row) => row.teamId === "b")!.goalDifference
    );
  });

  it("7/9: pełny cykl → decydują bramki zdobyte w całym turnieju", () => {
    const rows = calculateStandings(
      buildGroup(
        ["a", "b", "c", "d"],
        [
          match("a", "b", 1, 0),
          match("b", "c", 1, 0),
          match("c", "a", 1, 0),
          // Outsider dostaje różne wyniki — stąd różne bramki ogólne.
          match("a", "d", 19, 0),
          match("b", "d", 17, 0),
          match("c", "d", 14, 0),
        ]
      )
    );

    const tied = rows.filter((row) => row.teamId !== "d");

    // Mała tabela w cyklu: każdy 1:1, bilans 0 — nie rozdziela.
    const mini = buildHeadToHeadMiniTable(
      ["a", "b", "c"],
      [match("a", "b", 1, 0), match("b", "c", 1, 0), match("c", "a", 1, 0)]
    );
    expect([...mini.values()].every((row) => row.goalDifference === 0)).toBe(
      true
    );

    expect(tied.map((row) => row.teamId)).toEqual(["a", "b", "c"]);
    expect(tied.map((row) => row.goalsFor)).toEqual([20, 18, 15]);
    expect(tied.every((row) => !row.isTieUnresolved)).toBe(true);
  });

  it("8: równe bramki zdobyte → decydują stracone", () => {
    const rows = calculateStandings(
      buildGroup(
        ["a", "b", "c", "d"],
        [
          match("a", "b", 1, 0),
          match("b", "c", 1, 0),
          match("c", "a", 1, 0),
          // Każdy strzela outsiderowi tyle samo, ale traci różnie.
          match("a", "d", 9, 0),
          match("b", "d", 9, 2),
          match("c", "d", 9, 4),
        ]
      )
    );

    const tied = rows.filter((row) => row.teamId !== "d");

    expect(tied.map((row) => row.goalsFor)).toEqual([10, 10, 10]);
    expect(tied.map((row) => row.goalsAgainst)).toEqual([1, 3, 5]);
    expect(tied.map((row) => row.teamId)).toEqual(["a", "b", "c"]);
  });

  it("10: komplet identycznych liczb → remis nierozstrzygnięty i karne", () => {
    const rows = calculateStandings(
      buildGroup(
        ["a", "b", "c"],
        [match("a", "b", 1, 0), match("b", "c", 1, 0), match("c", "a", 1, 0)]
      )
    );

    for (const row of rows) {
      expect(row.isTieUnresolved).toBe(true);
      expect(row.tieWithTeamIds).toHaveLength(2);
      expect(row.tieNote).toContain("rzuty karne");
    }
  });
});

/* ==========================================================================
 * 11, 13: CZĘŚCIOWE ROZSTRZYGNIĘCIE
 * ======================================================================== */

describe("11/13: częściowe rozstrzygnięcie", () => {
  it("11: rozdzielona drużyna odchodzi, reszta idzie dalej punktem 6", () => {
    /*
      a ma najlepszy bilans w małej tabeli i jest rozstrzygnięte. b i c
      zostają związane — i dla nich NIE wraca mecz bezpośredni, tylko
      kolejne kryterium punktu 6: bramki zdobyte w całym turnieju.
    */
    const rows = calculateStandings(
      buildGroup(
        ["a", "b", "c", "d"],
        [
          match("a", "b", 2, 0),
          match("b", "c", 1, 0),
          match("c", "a", 1, 0),
          match("a", "d", 3, 0),
          match("b", "d", 8, 0),
          match("c", "d", 3, 0),
        ]
      )
    );

    const tied = rows.filter((row) => row.teamId !== "d");

    // a: mini +1, b: mini -1... i c: mini 0 — wszyscy rozdzieleni bilansem.
    expect(tied.map((row) => row.teamId)).toEqual(["a", "c", "b"]);
    expect(tied.every((row) => !row.isTieUnresolved)).toBe(true);
  });

  it("11: związana para po małej tabeli używa bramek, nie meczu bezpośredniego", () => {
    const rows = calculateStandings(
      buildGroup(
        ["a", "b", "c"],
        [
          // Cykl: mała tabela daje wszystkim bilans 0.
          match("a", "b", 1, 0),
          match("b", "c", 1, 0),
          match("c", "a", 1, 0),
        ]
      )
    );

    // Nikt nie jest rozdzielony — mecz bezpośredni b-c nie ma tu głosu.
    expect(rows.every((row) => row.isTieUnresolved)).toBe(true);
    expect(rows.map((row) => row.teamId)).toEqual(["a", "b", "c"]);
  });

  it("13: nadal związany podzbiór wskazuje TYLKO swoich", () => {
    const rows = calculateStandings(
      buildGroup(
        ["a", "b", "c", "d"],
        [
          // a wygrywa oba spotkania w koszyku, b i c zostają równe.
          match("a", "b", 1, 0),
          match("a", "c", 1, 0),
          match("b", "c", 0, 0),
          match("b", "d", 0, 1),
          match("c", "d", 0, 1),
          match("a", "d", 0, 1),
        ]
      )
    );

    const b = rows.find((row) => row.teamId === "b")!;
    const c = rows.find((row) => row.teamId === "c")!;

    if (b.isTieUnresolved) {
      // Związani są wyłącznie ze sobą — a jest już rozstrzygnięte.
      expect(b.tieWithTeamIds).toEqual(["c"]);
      expect(c.tieWithTeamIds).toEqual(["b"]);
    }
  });
});

/* ==========================================================================
 * 12: CZTERY DRUŻYNY
 * ======================================================================== */

describe("12: cztery drużyny w koszyku", () => {
  it("mała tabela liczy WYŁĄCZNIE mecze między tą czwórką", () => {
    const involved = ["a", "b", "c", "d"];

    const mini = buildHeadToHeadMiniTable(involved, [
      match("a", "b", 3, 0),
      match("c", "d", 1, 0),
      // Mecze z drużyną spoza koszyka nie mogą wejść do małej tabeli.
      match("a", "e", 9, 0),
      match("e", "b", 0, 7),
    ]);

    expect(mini.get("a")!.goalDifference).toBe(3);
    expect(mini.get("b")!.goalDifference).toBe(-3);
    expect(mini.get("c")!.goalDifference).toBe(1);
    expect(mini.get("d")!.goalDifference).toBe(-1);

    // Rozbicie outsidera nie podbiło nikomu małej tabeli.
    expect(mini.get("a")!.goalsFor).toBe(3);
    expect(mini.get("b")!.goalsFor).toBe(0);
  });

  it("czwórka na tych samych punktach szereguje się małą tabelą", () => {
    /*
      Każdy z czwórki ma 1 zwycięstwo, 1 remis i 1 porażkę w koszyku, więc
      punkty są równe. b rozbija outsidera 20:0 i ma zdecydowanie najlepszy
      bilans ogólny — a mimo to ląduje ostatnie, bo mała tabela daje mu -2.
    */
    const rows = calculateStandings(
      buildGroup(
        ["a", "b", "c", "d", "e"],
        [
          match("a", "b", 1, 1),
          match("c", "d", 0, 0),
          match("a", "c", 3, 0),
          match("d", "a", 1, 0),
          match("b", "d", 2, 0),
          match("c", "b", 4, 0),
          match("a", "e", 1, 0),
          match("b", "e", 20, 0),
          match("c", "e", 1, 0),
          match("d", "e", 1, 0),
        ]
      )
    );

    const tied = rows.filter((row) => row.teamId !== "e");

    expect(new Set(tied.map((row) => row.points)).size).toBe(1);
    // mała tabela: a +2, c +1, d -1, b -2
    expect(tied.map((row) => row.teamId)).toEqual(["a", "c", "d", "b"]);

    // Bilans ogólny stawiałby b na czele — i nie ma tu nic do powiedzenia.
    const b = rows.find((row) => row.teamId === "b")!;
    expect(b.goalDifference).toBeGreaterThan(
      rows.find((row) => row.teamId === "a")!.goalDifference
    );
  });
});

/* ==========================================================================
 * 14-15: KOLEJNOŚĆ REJESTRACJI
 * ======================================================================== */

describe("14/15: sourceOrder nie rozstrzyga sportowo", () => {
  it("14: odwrotna kolejność rejestracji nie zmienia wyniku", () => {
    const matches = [
      match("a", "b", 1, 0),
      match("b", "c", 1, 0),
      match("c", "a", 1, 0),
      match("a", "d", 19, 0),
      match("b", "d", 17, 0),
      match("c", "d", 14, 0),
    ];

    const natural = calculateStandings(buildGroup(["a", "b", "c", "d"], matches));
    const reversed = calculateStandings(
      buildGroup(["d", "c", "b", "a"], matches)
    );

    expect(order(natural).slice(0, 3)).toEqual(["a", "b", "c"]);
    expect(order(reversed).slice(0, 3)).toEqual(["a", "b", "c"]);
  });

  it("15: przy pełnym remisie flaga zostaje mimo różnej rejestracji", () => {
    const matches = [
      match("a", "b", 1, 0),
      match("b", "c", 1, 0),
      match("c", "a", 1, 0),
    ];

    for (const registration of [
      ["a", "b", "c"],
      ["c", "b", "a"],
      ["b", "c", "a"],
    ]) {
      const rows = calculateStandings(buildGroup(registration, matches));

      // Kolejność renderowania może się różnić — werdykt nie istnieje.
      expect(rows.every((row) => row.isTieUnresolved)).toBe(true);
    }
  });
});
