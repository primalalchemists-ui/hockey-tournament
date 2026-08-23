import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { StandingsTable } from "@/components/standings-table";
import type { StandingRow } from "@/types/tournament";

/**
 * NIEROZSTRZYGNIETA POZYCJA W RANKINGU.
 *
 * Przed pierwszym gwizdkiem miejsca nie istnieja. Zamiast szarego
 * placeholdera pokazujemy stonowany, ciemnozloty stan: kazda druzyna moze
 * jeszcze siegnac po zloto. To NIE jest medal.
 */

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function row(position: number, played: number): StandingRow {
  return {
    position,
    teamId: `t${position}`,
    teamName: `Druzyna ${position}`,
    played,
    wins: played,
    draws: 0,
    losses: 0,
    points: played * 3,
    goalsFor: played,
    goalsAgainst: 0,
    goalDifference: played,
    sourceOrder: position,
  };
}

function render(rows: StandingRow[]) {
  return renderToStaticMarkup(
    <StandingsTable
      groupKey="A"
      groupName="Grupa A"
      rows={rows}
      stage={null}
      celebration={null}
    />
  );
}

const beforeStart = render([1, 2, 3, 4, 5, 6, 7].map((p) => row(p, 0)));
const afterResults = render([1, 2, 3, 4, 5, 6, 7].map((p) => row(p, 3)));
const css = source("app/globals.css");

describe("AM-AR: zloty znak zapytania", () => {
  it("AM/AN: przed wynikami kazda pozycja to zlocisty znak zapytania", () => {
    expect(beforeStart.split('data-testid="rank-unresolved"').length - 1).toBe(7);
    expect(beforeStart).toContain("unresolved-rank");
    expect(beforeStart).toContain(">?<");
  });

  it("AO: to nie jest medal pierwszego miejsca", () => {
    // Zero grafiki medalu w stanie nierozstrzygnietym.
    expect(beforeStart).not.toContain("/images/medals/gold.png");
    expect(beforeStart).not.toContain("/images/medals/silver.png");
    expect(beforeStart).not.toContain("/images/medals/bronze.png");
  });

  it("AO: jest wyraznie stonowany wzgledem prawdziwego zlota", () => {
    const start = css.indexOf(".unresolved-rank {");
    const block = css.slice(start, css.indexOf("}", start));

    // Ciemna powierzchnia i zloty obrys, a nie zlote wypelnienie.
    expect(block).toContain("border: 1px solid rgba(196, 154, 78");
    expect(block).toContain("rgba(63, 52, 32");
    expect(block).not.toContain("#ffd700");
    expect(block).not.toContain("yellow");
  });

  it("AP/AQ: po wynikach wracaja normalne miejsca i medale", () => {
    expect(afterResults).not.toContain('data-testid="rank-unresolved"');
    expect(afterResults).toContain("/images/medals/gold.png");
    expect(afterResults).toContain("/images/medals/silver.png");
    expect(afterResults).toContain("/images/medals/bronze.png");
    expect(afterResults).toContain(">4<");
  });

  it("AR: stan jest statyczny - zero animacji i pulsowania", () => {
    const start = css.indexOf(".unresolved-rank {");
    const block = css.slice(start, css.indexOf("}", start));

    expect(block).not.toContain("animation");
    expect(block).not.toContain("transition");
  });

  it("nierozstrzygniety remis korzysta z tego samego jezyka", () => {
    const tie = render([
      { ...row(1, 3), isTieUnresolved: true, tieNote: "Rzuty karne" },
      row(2, 3),
    ]);

    expect(tie).toContain('data-testid="rank-unresolved"');
    expect(tie).toContain("unresolved-rank");
  });

  it("wyjasnienie remisu nie zmienia wysokosci karty", () => {
    /*
      Nierozstrzygnieta pozycja pojawia sie i znika przy KAZDYM wpisanym
      wyniku. Kafel rosnacy i znikajacy w tym rytmie podrzucal macierz pod
      spodem dokladnie wtedy, gdy ktos w nia celowal palcem.
    */
    const withNote = render([
      { ...row(1, 3), isTieUnresolved: true, tieNote: "Rzuty karne" },
      row(2, 3),
    ]);
    const withoutNote = render([row(1, 3), row(2, 3)]);

    // Slot istnieje w obu przypadkach i ma te sama, stala wysokosc.
    expect(withNote).toContain('data-testid="tie-notes"');
    expect(withoutNote).toContain('data-testid="tie-notes"');

    const source = readFileSync(
      new URL("../components/standings-table.tsx", import.meta.url),
      "utf8"
    );
    expect(source).toContain('className="mt-2 h-5 truncate');
    // Zadnego kafla, ktory raz jest, a raz go nie ma.
    expect(source).not.toContain("bg-amber-50");
  });
});
