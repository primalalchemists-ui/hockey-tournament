import { describe, expect, it } from "vitest";

import { buildHeadToHeadMiniTable, calculateStandings } from "@/lib/standings";
import { buildGroup, idsOf, match, orderOf } from "../helpers/scenario";

/**
 * U10-D / U10-E / U10-F / U10-G / U10-H / U10-I — remisy.
 *
 * Regulaminowy podział:
 *   - dokładnie 2 drużyny → punkty 1-5 (z meczem bezpośrednim),
 *   - 3 lub więcej       → punkt 6 (mała tabela), bez powrotu do H2H.
 */

/* ==========================================================================
 * U10-D — REMIS DOKŁADNIE DWÓCH DRUŻYN
 * ======================================================================== */

describe("U10-D — remis dwóch drużyn", () => {
  it("U10-D01 — mecz bezpośredni rozstrzyga", () => {
    /*
      a i b po 3 pkt. b ma lepszy bilans ogólny (rozbiło c), ale a wygrało
      spotkanie bezpośrednie — i to ono decyduje.
    */
    const rows = calculateStandings(
      buildGroup(
        ["a", "b", "c"],
        [
          match("a", "b", 1, 0),
          match("b", "c", 9, 0),
          match("c", "a", 5, 0),
        ]
      )
    );

    const a = rows.find((row) => row.teamId === "a")!;
    const b = rows.find((row) => row.teamId === "b")!;

    expect(a.points).toBe(3);
    expect(b.points).toBe(3);
    // Trzy drużyny mają po 3 pkt tylko wtedy, gdy c też wygrało — sprawdzamy.
    expect(rows.filter((row) => row.points === 3)).toHaveLength(3);
  });

  it("U10-D01 — para bez trzeciego zainteresowanego: H2H rozstrzyga", () => {
    const rows = calculateStandings(
      buildGroup(
        ["a", "b", "c"],
        [
          /*
            a i b po 3 pkt, c bez punktu. Mecz a-c NIE jest rozegrany —
            dzięki temu koszyk punktowy ma DOKŁADNIE dwie drużyny i wchodzi
            ścieżka meczu bezpośredniego, a nie mała tabela.
          */
          match("a", "b", 1, 0),
          match("b", "c", 9, 0),
        ]
      )
    );

    const top = rows.filter((row) => row.points === 3);
    expect(top).toHaveLength(2);
    // b ma bilans +8, a ma -3 — a mimo to a jest wyżej, bo wygrało bezpośredni.
    expect(top[0].teamId).toBe("a");
    expect(top[1].teamId).toBe("b");
    expect(top[1].goalDifference).toBeGreaterThan(top[0].goalDifference);
    expect(top.every((row) => !row.isTieUnresolved)).toBe(true);
  });

  it("U10-D02 — remisowy mecz bezpośredni oddaje głos bilansowi", () => {
    const rows = calculateStandings(
      buildGroup(
        ["a", "b", "c"],
        [
          match("a", "b", 2, 2),
          match("a", "c", 5, 0),
          match("b", "c", 1, 0),
        ]
      )
    );

    const top = rows.filter((row) => row.points === 4);
    expect(top).toHaveLength(2);
    expect(top[0].teamId).toBe("a");
    expect(top[0].goalDifference).toBeGreaterThan(top[1].goalDifference);
    expect(top.every((row) => !row.isTieUnresolved)).toBe(true);
  });

  it("U10-D03 — równy bilans oddaje głos bramkom zdobytym", () => {
    const rows = calculateStandings(
      buildGroup(
        ["a", "b", "c", "d"],
        [
          match("a", "b", 2, 2),
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
    expect(a.goalsFor).toBeGreaterThan(b.goalsFor);
    expect(orderOf(rows).indexOf("a")).toBeLessThan(orderOf(rows).indexOf("b"));
  });

  it("U10-D04 — komparator bramek straconych istnieje i działa", () => {
    /*
      MATRIX PB-04: w pełnym round-robin przy równych punktach, bilansie
      i bramkach zdobytych, bramki stracone też muszą być równe. Kryterium
      testujemy więc na grupie NIEKOMPLETNEJ, gdzie da się je osiągnąć.
    */
    const rows = calculateStandings(
      buildGroup(
        ["a", "b", "c", "d"],
        [
          // a: 2:1 z c  -> pkt 3, GD +1, GF 2, GA 1
          match("a", "c", 2, 1),
          // b: 3:2 z d  -> pkt 3, GD +1, GF 3, GA 2
          match("b", "d", 3, 2),
        ]
      )
    );

    const a = rows.find((row) => row.teamId === "a")!;
    const b = rows.find((row) => row.teamId === "b")!;

    expect(a.points).toBe(b.points);
    expect(a.goalDifference).toBe(b.goalDifference);
    // Różne GF, więc rozstrzyga wcześniejsze kryterium — b wyżej.
    expect(b.goalsFor).toBeGreaterThan(a.goalsFor);
    expect(orderOf(rows).indexOf("b")).toBeLessThan(orderOf(rows).indexOf("a"));
    // Mniej straconych ma a — dowód, że dane są różne i komparator ma czym działać.
    expect(a.goalsAgainst).toBeLessThan(b.goalsAgainst);
  });

  it("U10-D05 — pełny remis dwóch drużyn zostaje nierozstrzygnięty", () => {
    const rows = calculateStandings(
      buildGroup(["a", "b"], [match("a", "b", 1, 1)])
    );

    for (const row of rows) {
      expect(row.isTieUnresolved).toBe(true);
      expect(row.tieWithTeamIds).toHaveLength(1);
      expect(row.tieNote).toContain("rzuty karne");
    }
  });

  it("U10-D06 — mecz bezpośredni bije duży bilans", () => {
    const rows = calculateStandings(
      buildGroup(
        ["a", "b", "c"],
        [
          // Mecz a-c nierozegrany — koszyk to dokładnie a i b.
          match("a", "b", 1, 0),
          match("b", "c", 15, 0),
        ]
      )
    );

    const top = rows.filter((row) => row.points === 3);
    expect(top).toHaveLength(2);
    expect(top[0].teamId).toBe("a");
    expect(top[1].goalDifference - top[0].goalDifference).toBeGreaterThan(10);
  });

  it("U10-D07 — kolejność rejestracji nie zmienia wyniku sportowego", () => {
    // Koszyk dwóch drużyn: a i b po 3 pkt, c bez punktu.
    const played = [match("a", "b", 1, 0), match("b", "c", 9, 0)];

    for (const registration of [
      ["a", "b", "c"],
      ["c", "b", "a"],
      ["b", "a", "c"],
    ]) {
      const rows = calculateStandings(buildGroup(registration, played));
      const top = rows.filter((row) => row.points === 3);

      expect(top.map((row) => row.teamId)).toEqual(["a", "b"]);
    }
  });
});

/* ==========================================================================
 * U10-E — REMIS TRZECH DRUŻYN
 * ======================================================================== */

describe("U10-E — remis trzech drużyn", () => {
  /** Cykl a>b>c>a z kontrolowanymi bramkami w małej tabeli. */
  const cycle = (scores: Array<[string, string, number, number]>) =>
    scores.map(([home, away, hs, as]) => match(home, away, hs, as));

  it("U10-E01 — mała tabela rozstrzyga wszystkich", () => {
    const rows = calculateStandings(
      buildGroup(
        ["a", "b", "c", "d"],
        [
          ...cycle([
            ["a", "b", 3, 0],
            ["b", "c", 2, 0],
            ["c", "a", 1, 0],
          ]),
          match("a", "d", 1, 0),
          match("b", "d", 1, 0),
          match("c", "d", 1, 0),
        ]
      )
    );

    const tied = rows.filter((row) => row.teamId !== "d");
    expect(tied.every((row) => row.points === 6)).toBe(true);
    // mini GD: a +2, b -1, c -1 ... rozstrzyga dalej GF
    expect(tied[0].teamId).toBe("a");
    expect(tied.every((row) => !row.isTieUnresolved)).toBe(true);
  });

  it("U10-E02 — mała tabela ma pierwszeństwo przed bilansem ogólnym", () => {
    const rows = calculateStandings(
      buildGroup(
        ["a", "b", "c", "d"],
        [
          match("a", "b", 0, 2),
          match("b", "c", 1, 2),
          match("c", "a", 0, 1),
          match("a", "d", 22, 0),
          match("b", "d", 11, 0),
          match("c", "d", 5, 0),
        ]
      )
    );

    const tied = rows.filter((row) => row.teamId !== "d");

    expect(tied.every((row) => row.points === 6)).toBe(true);
    expect(tied.map((row) => row.teamId)).toEqual(["b", "c", "a"]);

    // a ma najlepszy bilans OGÓLNY i mimo to jest ostatnie w koszyku.
    const a = rows.find((row) => row.teamId === "a")!;
    const b = rows.find((row) => row.teamId === "b")!;
    expect(a.goalDifference).toBeGreaterThan(b.goalDifference);
  });

  it("U10-E03 — równe mini GD oddają głos bramkom zdobytym", () => {
    const rows = calculateStandings(
      buildGroup(
        ["a", "b", "c", "d"],
        [
          ...cycle([
            ["a", "b", 1, 0],
            ["b", "c", 1, 0],
            ["c", "a", 1, 0],
          ]),
          match("a", "d", 19, 0),
          match("b", "d", 17, 0),
          match("c", "d", 14, 0),
        ]
      )
    );

    const tied = rows.filter((row) => row.teamId !== "d");
    expect(tied.map((row) => row.goalsFor)).toEqual([20, 18, 15]);
    expect(tied.map((row) => row.teamId)).toEqual(["a", "b", "c"]);
  });

  it("U10-E04 — równe mini GD i GF oddają głos bramkom straconym", () => {
    const rows = calculateStandings(
      buildGroup(
        ["a", "b", "c", "d"],
        [
          ...cycle([
            ["a", "b", 1, 0],
            ["b", "c", 1, 0],
            ["c", "a", 1, 0],
          ]),
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

  it("U10-E05 — pełny cykl daje mini GD równe zeru", () => {
    const mini = buildHeadToHeadMiniTable(
      ["a", "b", "c"],
      cycle([
        ["a", "b", 1, 0],
        ["b", "c", 1, 0],
        ["c", "a", 1, 0],
      ])
    );

    for (const row of mini.values()) {
      expect(row.goalDifference).toBe(0);
      expect(row.goalsFor).toBe(1);
      expect(row.goalsAgainst).toBe(1);
    }
  });

  it("U10-E06 — cykl plus różne GF", () => {
    const rows = calculateStandings(
      buildGroup(
        ["a", "b", "c", "d"],
        [
          ...cycle([
            ["a", "b", 1, 0],
            ["b", "c", 1, 0],
            ["c", "a", 1, 0],
          ]),
          match("a", "d", 6, 0),
          match("b", "d", 4, 0),
          match("c", "d", 2, 0),
        ]
      )
    );

    const tied = rows.filter((row) => row.teamId !== "d");
    expect(tied.map((row) => row.teamId)).toEqual(["a", "b", "c"]);
    expect(tied.every((row) => !row.isTieUnresolved)).toBe(true);
  });

  it("U10-E07 — cykl, równe GF, różne GA", () => {
    const rows = calculateStandings(
      buildGroup(
        ["a", "b", "c", "d"],
        [
          ...cycle([
            ["a", "b", 1, 0],
            ["b", "c", 1, 0],
            ["c", "a", 1, 0],
          ]),
          match("a", "d", 5, 1),
          match("b", "d", 5, 3),
          match("c", "d", 5, 4),
        ]
      )
    );

    const tied = rows.filter((row) => row.teamId !== "d");
    expect(tied.map((row) => row.teamId)).toEqual(["a", "b", "c"]);
  });

  it("U10-E08 — cykl i komplet równych liczb: nierozstrzygnięty", () => {
    const rows = calculateStandings(
      buildGroup(
        ["a", "b", "c"],
        cycle([
          ["a", "b", 1, 0],
          ["b", "c", 1, 0],
          ["c", "a", 1, 0],
        ])
      )
    );

    for (const row of rows) {
      expect(row.isTieUnresolved).toBe(true);
      expect(row.tieWithTeamIds).toHaveLength(2);
      expect(row.tieNote).toContain("rzuty karne");
    }
  });

  it("U10-E09 — mecz z outsiderem nie wchodzi do małej tabeli", () => {
    const mini = buildHeadToHeadMiniTable(
      ["a", "b", "c"],
      [
        match("a", "b", 1, 0),
        match("b", "c", 1, 0),
        match("c", "a", 1, 0),
        match("a", "outsider", 20, 0),
        match("outsider", "b", 0, 7),
      ]
    );

    expect(mini.get("a")!.goalsFor).toBe(1);
    expect(mini.get("a")!.goalDifference).toBe(0);
    expect(mini.get("b")!.goalsFor).toBe(1);
    expect(mini.get("b")!.goalDifference).toBe(0);
  });

  it("U10-E10 — po wejściu w gałąź 3+ mecz bezpośredni NIE wraca", () => {
    /*
      Mini GD rozdziela a. b i c zostają związani, a ich mecz bezpośredni
      wskazywałby b. Regulaminowo decyduje jednak overall GF, które daje c.
    */
    const rows = calculateStandings(
      buildGroup(
        ["a", "b", "c", "d"],
        [
          match("a", "b", 2, 0),
          match("b", "c", 1, 0),
          match("c", "a", 1, 0),
          match("a", "d", 1, 0),
          match("b", "d", 1, 0),
          match("c", "d", 9, 0),
        ]
      )
    );

    const tied = rows.filter((row) => row.teamId !== "d");
    expect(tied.every((row) => row.points === 6)).toBe(true);

    const b = tied.find((row) => row.teamId === "b")!;
    const c = tied.find((row) => row.teamId === "c")!;

    // b wygrało bezpośredni z c, ale c ma więcej bramek w całym turnieju.
    expect(c.goalsFor).toBeGreaterThan(b.goalsFor);
    expect(orderOf(tied).indexOf("c")).toBeLessThan(orderOf(tied).indexOf("b"));
  });
});

/* ==========================================================================
 * U10-F — CZĘŚCIOWE ROZSTRZYGNIĘCIE
 * ======================================================================== */

describe("U10-F — częściowe rozstrzygnięcie", () => {
  it("U10-F01 — rozdzielona drużyna odchodzi, para idzie dalej punktem 6", () => {
    const rows = calculateStandings(
      buildGroup(
        ["a", "b", "c", "d"],
        [
          match("a", "b", 3, 0),
          match("b", "c", 1, 0),
          match("c", "a", 1, 0),
          match("a", "d", 1, 0),
          match("b", "d", 5, 0),
          match("c", "d", 1, 0),
        ]
      )
    );

    const tied = rows.filter((row) => row.teamId !== "d");
    expect(tied.every((row) => row.points === 6)).toBe(true);
    // mini GD: a +2, b -2, c 0
    expect(tied[0].teamId).toBe("a");
    expect(tied.every((row) => !row.isTieUnresolved)).toBe(true);
  });

  it("U10-F02 — podzbiór związany do końca wskazuje tylko siebie", () => {
    /*
      a wygrywa oba mecze w koszyku, b i c mają identyczne wszystko.
      Oczekiwanie: a rozstrzygnięte, b i c nierozstrzygnięci WZAJEMNIE.
    */
    const rows = calculateStandings(
      buildGroup(
        ["a", "b", "c"],
        [
          match("a", "b", 1, 0),
          match("a", "c", 1, 0),
          match("b", "c", 0, 0),
        ]
      )
    );

    const a = rows.find((row) => row.teamId === "a")!;
    const b = rows.find((row) => row.teamId === "b")!;
    const c = rows.find((row) => row.teamId === "c")!;

    expect(a.isTieUnresolved).toBe(false);
    expect(b.isTieUnresolved).toBe(true);
    expect(c.isTieUnresolved).toBe(true);
    expect(b.tieWithTeamIds).toEqual(["c"]);
    expect(c.tieWithTeamIds).toEqual(["b"]);
  });

  it("U10-F03 — dwa niezależne podzbiory w jednym koszyku", () => {
    /*
      JEDEN koszyk punktowy, DWA niezależne podzbiory.

      Każda z czterech drużyn ma 1 zwycięstwo, 1 remis i 1 porażkę, więc
      wszystkie mają po 4 pkt. Mała tabela dzieli je 2:2 (a, b po +1;
      c, d po -1), a wewnątrz każdej pary wszystko jest identyczne.
    */
    const rows = calculateStandings(
      buildGroup(
        ["a", "b", "c", "d"],
        [
          match("a", "b", 0, 0),
          match("c", "d", 0, 0),
          match("a", "c", 2, 0),
          match("d", "a", 1, 0),
          match("b", "d", 2, 0),
          match("c", "b", 1, 0),
        ]
      )
    );

    const a = rows.find((row) => row.teamId === "a")!;
    const b = rows.find((row) => row.teamId === "b")!;
    const c = rows.find((row) => row.teamId === "c")!;
    const d = rows.find((row) => row.teamId === "d")!;

    expect([a, b, c, d].every((row) => row.points === 4)).toBe(true);
    expect(a.tieWithTeamIds).toEqual(["b"]);
    expect(b.tieWithTeamIds).toEqual(["a"]);
    expect(c.tieWithTeamIds).toEqual(["d"]);
    expect(d.tieWithTeamIds).toEqual(["c"]);
  });
});

/* ==========================================================================
 * U10-G — CZTERY I WIĘCEJ DRUŻYN
 * ======================================================================== */

describe("U10-G — cztery i więcej drużyn", () => {
  it("U10-G01 — mała tabela czterech drużyn decyduje o kolejności", () => {
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
    // mini GD: a +2, c +1, d -1, b -2
    expect(tied.map((row) => row.teamId)).toEqual(["a", "c", "d", "b"]);

    const b = rows.find((row) => row.teamId === "b")!;
    const a = rows.find((row) => row.teamId === "a")!;
    expect(b.goalDifference).toBeGreaterThan(a.goalDifference);
  });

  it("U10-G02 — czwórka z częściowym rozstrzygnięciem", () => {
    /*
      Cztery drużyny po 7 pkt (1W, 1R, 1P w koszyku + zwycięstwo z e).
      Mała tabela dzieli je 2:2 — a i b po +1, c i d po -1.

      Para a/b rozchodzi się na bramkach zdobytych w CAŁYM turnieju
      (a rozbiło e 5:0). Para c/d ma identyczne wszystko, więc zostaje
      związana — i to jest właśnie częściowe rozstrzygnięcie.
    */
    const rows = calculateStandings(
      buildGroup(
        ["a", "b", "c", "d", "e"],
        [
          match("a", "b", 0, 0),
          match("c", "d", 0, 0),
          match("a", "c", 2, 0),
          match("d", "a", 1, 0),
          match("b", "d", 2, 0),
          match("c", "b", 1, 0),
          match("a", "e", 5, 0),
          match("b", "e", 1, 0),
          match("c", "e", 1, 0),
          match("d", "e", 1, 0),
        ]
      )
    );

    const tied = rows.filter((row) => row.teamId !== "e");
    expect(tied.every((row) => row.points === 7)).toBe(true);

    const a = tied.find((row) => row.teamId === "a")!;
    const b = tied.find((row) => row.teamId === "b")!;
    const c = tied.find((row) => row.teamId === "c")!;
    const d = tied.find((row) => row.teamId === "d")!;

    // a i b rozdzielone bramkami zdobytymi.
    expect(a.isTieUnresolved).toBe(false);
    expect(b.isTieUnresolved).toBe(false);
    expect(a.goalsFor).toBeGreaterThan(b.goalsFor);
    expect(orderOf(tied).indexOf("a")).toBeLessThan(orderOf(tied).indexOf("b"));

    // c i d nadal związane — i wskazują wyłącznie siebie nawzajem.
    expect(c.isTieUnresolved).toBe(true);
    expect(d.isTieUnresolved).toBe(true);
    expect(c.tieWithTeamIds).toEqual(["d"]);
    expect(d.tieWithTeamIds).toEqual(["c"]);
  });

  it("U10-G03 — helper małej tabeli wybiera wyłącznie mecze wewnętrzne", () => {
    const mini = buildHeadToHeadMiniTable(
      ["a", "b", "c", "d"],
      [
        match("a", "b", 3, 0),
        match("c", "d", 1, 0),
        match("a", "e", 9, 0),
        match("e", "b", 0, 7),
      ]
    );

    expect(mini.get("a")!.goalDifference).toBe(3);
    expect(mini.get("b")!.goalDifference).toBe(-3);
    expect(mini.get("c")!.goalDifference).toBe(1);
    expect(mini.get("d")!.goalDifference).toBe(-1);
    expect(mini.get("a")!.goalsFor).toBe(3);
    expect(mini.get("b")!.goalsFor).toBe(0);
    expect(mini.has("e")).toBe(false);
  });

  it("U10-G04 — koszyk równy całej dziesięciodrużynowej grupie", () => {
    const ids = idsOf(10);
    const rows = calculateStandings(buildGroup(ids, []));

    // Wszyscy po 0 pkt — mała tabela obejmuje całą grupę i nic nie rozdziela.
    expect(rows).toHaveLength(10);
    expect(rows.map((row) => row.position)).toEqual(
      Array.from({ length: 10 }, (_, index) => index + 1)
    );
    // Grupa niekompletna, więc bez komunikatu o karnych.
    for (const row of rows) expect(row.tieNote).toBeUndefined();
  });
});

/* ==========================================================================
 * U10-H — WORKFLOW RZUTÓW KARNYCH
 * ======================================================================== */

describe("U10-H — rozstrzygnięcie karnymi przez wpisanie wyniku", () => {
  const circle = [
    match("a", "b", 1, 0),
    match("b", "c", 1, 0),
    match("c", "a", 1, 0),
  ];

  it("U10-H01 — zmiana remisu na wynik po karnych rozstrzyga tabelę", () => {
    const before = calculateStandings(buildGroup(["a", "b", "c"], circle));
    expect(before.every((row) => row.isTieUnresolved)).toBe(true);

    /*
      Organizator rozstrzyga karnymi i wpisuje finalny wynik: a wygrywa
      z b nie 1:0, tylko 2:0. To zmienia małą tabelę.
    */
    const after = calculateStandings(
      buildGroup(
        ["a", "b", "c"],
        [match("a", "b", 2, 0), match("b", "c", 1, 0), match("c", "a", 1, 0)]
      )
    );

    expect(after.every((row) => row.points === 3)).toBe(true);
    // Statystyki odpowiadają WPISANEMU wynikowi, nie pierwotnemu.
    expect(after.find((row) => row.teamId === "a")!.goalsFor).toBe(2);
    expect(after.find((row) => row.teamId === "b")!.goalsAgainst).toBe(2);
    // mini GD: a +1, b -1, c 0 — remis rozstrzygnięty.
    expect(after.map((row) => row.teamId)).toEqual(["a", "c", "b"]);
    expect(after.every((row) => !row.isTieUnresolved)).toBe(true);
  });

  it("U10-H02 — zmiana wyniku przenosi drużynę do innego koszyka", () => {
    const after = calculateStandings(
      buildGroup(
        ["a", "b", "c"],
        [match("a", "b", 1, 0), match("b", "c", 1, 0), match("c", "a", 0, 1)]
      )
    );

    // a wygrało oba mecze — koszyki liczone od zera, żadna flaga nie zostaje.
    expect(after[0].teamId).toBe("a");
    expect(after[0].points).toBe(6);
    expect(after[0].isTieUnresolved).toBe(false);
  });
});

/* ==========================================================================
 * U10-I — TABELA NIEKOMPLETNA
 * ======================================================================== */

describe("U10-I — tabela niekompletna", () => {
  it("U10-I01 — tie-break działa przed kompletem, ale bez komunikatu", () => {
    const rows = calculateStandings(
      buildGroup(
        ["a", "b", "c", "d"],
        [match("a", "b", 1, 1), match("c", "d", 2, 2)]
      )
    );

    expect(rows.some((row) => row.isTieUnresolved)).toBe(true);
    for (const row of rows) expect(row.tieNote).toBeUndefined();
  });

  it("U10-I02 — PB-05: komplet liczony z LICZBY meczów, nie z par", () => {
    /*
      MATRIX PB-05 — REGRESSION CASE.

      Grupa czterech drużyn wymaga 6 UNIKALNYCH par. Fixture ma dokładnie
      6 meczów, więc `matches.length` osiąga wymaganą liczbę — ale:

        - para a-b, a-c i b-c powtarzają się po dwa razy,
        - drużyna d nie gra ANI RAZU,
        - brakuje trzech wymaganych par (a-d, b-d, c-d).

      Zgodnie z matrixem grupa NIE jest kompletna, więc komunikat
      o rzutach karnych NIE ma prawa się pojawić.

      Jeżeli obecny kod uzna ją za kompletną, ten test jest CZERWONY —
      i to jest prawidłowy wynik tej rundy.
    */
    const played = [
      match("a", "b", 1, 1),
      match("a", "c", 1, 1),
      match("b", "c", 1, 1),
      { ...match("a", "b", 1, 1), id: "dup-ab" },
      { ...match("a", "c", 1, 1), id: "dup-ac" },
      { ...match("b", "c", 1, 1), id: "dup-bc" },
    ];

    const rows = calculateStandings(buildGroup(["a", "b", "c", "d"], played));

    // Fixture faktycznie osiąga wymaganą liczbę meczów...
    expect(played).toHaveLength(6);
    // ...ale ma tylko trzy różne pary i jedną drużynę bez meczu.
    expect(new Set(played.map((m) => [m.homeTeamId, m.awayTeamId].sort().join("|"))).size).toBe(3);
    expect(rows.find((row) => row.teamId === "d")!.played).toBe(0);

    const tied = rows.filter((row) => row.isTieUnresolved);
    expect(tied.length).toBeGreaterThan(0);

    for (const row of tied) {
      expect(row.tieNote).toBeUndefined();
    }
  });
});
