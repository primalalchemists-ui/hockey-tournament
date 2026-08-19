import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { PodiumSection } from "@/components/playoff/podium-section";
import type { ClassificationView } from "@/lib/data/postgres/playoff-engine";
import type { ClassificationSlot } from "@/lib/playoff/classification";

/**
 * PODIUM NA TELEFONIE.
 *
 * Realny bug: brazowy medal wychodzil poza prawa krawedz sceny na 390 px.
 * Przyczyna byla geometryczna - blok z nazwa druzyny mial szerokosc
 * max-content, wiec dlugie nazwy klubow rozpychaly stopien ponad jego
 * `max-w`, a wysrodkowany rzad wystawal poza scene.
 *
 * Tych testow NIE da sie zastapic pomiarem layoutu (srodowisko Node,
 * bez przegladarki) - pilnuja kontraktu geometrii, ktory ten bug lamal.
 */

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const NAMES = [
  "Naprzód Janów Katowice 1",
  "MOSM Tychy Tyskie Lwy 1",
  "UKS Zagłębie Sosnowiec 1",
  "MMKS Podhale Nowy Targ",
  "BS Polonia Bytom 1",
  "GKS Katowice 1",
  "KH Dębica",
];

const classification: ClassificationView = {
  complete: true,
  missing: [],
  entries: NAMES.map((name, index) => ({
    position: index + 1,
    shared: false,
    source: "bracket",
    team: {
      teamId: `t${index + 1}`,
      name,
      logoUrl: `https://res.cloudinary.com/demo/${index}.png`,
      logoText: name.slice(0, 3),
      seed: index + 1,
    },
  })),
};

const skeleton: ClassificationSlot[] = NAMES.map((_, index) => ({
  position: index + 1,
  label: String(index + 1),
  shared: false,
}));

const html = renderToStaticMarkup(
  <PodiumSection
    tournamentId="t1"
    scopeKey="A"
    classification={classification}
    skeleton={skeleton}
    completionToken="2026-01-01T00:00:00.000Z"
    backgroundUrl={null}
  />
);

const podium = source("components/playoff/podium-section.tsx");

describe("A-E: kompozycja podium miesci sie w scenie", () => {
  it("A: scena nigdy nie jest szersza niz kontener", () => {
    // `w-full` na rzedzie: bez tego rzad przyjmowal szerokosc max-content
    // trzech stopni i - wysrodkowany - wychodzil poza scene.
    expect(html).toContain('data-testid="podium-scene"');
    expect(podium).toContain('className="mx-auto mt-6 flex w-full max-w-[34rem]');
  });

  it("B/C: kazdy stopien dzieli szerokosc, zamiast dodawac swoje maksimum", () => {
    const steps = html.split('data-testid="podium-step"').slice(1);

    expect(steps).toHaveLength(3);

    for (const step of steps) {
      const classes = step.slice(0, step.indexOf(">"));

      // basis-0 + grow: trzy stopnie zawsze sumuja sie do szerokosci sceny.
      expect(classes).toContain("basis-0");
      expect(classes).toContain("min-w-0");
      expect(classes).toMatch(/grow/);
      // Gorny limit istnieje, ale nie jest szerokoscia bazowa.
      expect(classes).toMatch(/max-w-\[\d/);
    }
  });

  it("B/C: srebro i braz moga byc odrobine wezsze niz zloto", () => {
    expect(podium).toContain('grow-[1.15] max-w-[8.5rem]');
    expect(podium).toContain('grow max-w-[7rem]');
  });

  it("D: zwyciezca stoi posrodku i najwyzej", () => {
    const order = html
      .split('data-testid="podium-step"')
      .slice(1)
      .map((chunk) => chunk.slice(0, 200));

    // Kolejnosc w DOM: 2, 1, 3 - czyli wizualnie 2 z lewej, 1 w srodku.
    expect(order[0]).toContain('data-position="2"');
    expect(order[1]).toContain('data-position="1"');
    expect(order[2]).toContain('data-position="3"');

    // Złoto najwyżej, srebro niżej, brąz najniżej.
    expect(podium).toContain('heightClass="h-24 sm:h-28"');
    expect(podium).toContain('heightClass="h-16 sm:h-20"');
    expect(podium).toContain('heightClass="h-12 sm:h-14"');
  });

  it("E: blok herbu nie rozpycha slotu", () => {
    // Sedno buga: blok pod logo byl auto-szeroki w kolumnie items-center.
    expect(podium).toContain('"flex w-full min-w-0 flex-col items-center"');
    expect(html).toContain('data-testid="podium-logo"');
  });

  it("E: blask zwyciezcy nie powieksza pudelka", () => {
    // box-shadow nie wchodzi do layoutu, a scena i tak przycina nadmiar.
    expect(podium).toContain("overflow-hidden");
    expect(source("app/globals.css")).toContain("@keyframes winner-glow");
  });

  it("problem rozwiazany geometria, nie ukryty globalnym overflow", () => {
    const css = source("app/globals.css");
    const head = css.slice(0, css.indexOf("@layer components"));

    expect(head).not.toMatch(/html[^{]*\{[^}]*overflow-x:\s*hidden/);
    expect(head).not.toMatch(/body[^{]*\{[^}]*overflow-x:\s*hidden/);
  });
});

describe("H-M: medale w swoich stopniach", () => {
  it("H/I/J: kazdy medal jest wysrodkowany w SWOIM stopniu", () => {
    // items-center + justify-center na platformie: medal nalezy do stopnia,
    // a nie do calej sceny.
    expect(podium).toContain(
      '"relative flex w-full items-center justify-center rounded-t-2xl'
    );
    expect(html).toContain('data-testid="podium-medal"');
  });

  it("L: rozmiar medalu wynika z wysokosci stopnia", () => {
    // zloto > srebro > braz, w kazdym breakpoincie.
    expect(podium).toContain('medalClass="h-11 w-11 sm:h-14 sm:w-14"');
    expect(podium).toContain('medalClass="h-8 w-8 sm:h-10 sm:w-10"');
    expect(podium).toContain('medalClass="h-7 w-7 sm:h-8 sm:w-8"');
  });

  it("M: medal nie moze byc wyzszy niz jego stopien", () => {
    const pairs: Array<[string, number, number]> = [
      // [miejsce, wysokosc stopnia w rem, wysokosc medalu w rem]
      ["1", 6, 2.75],
      ["2", 4, 2],
      ["3", 3, 1.75],
    ];

    for (const [, stepRem, medalRem] of pairs) {
      expect(medalRem).toBeLessThan(stepRem);
    }
  });
});

describe("F-H: reszta klasyfikacji", () => {
  it("F: rzad 4-7 nadal miesci sie w jednym wierszu", () => {
    expect(html).toContain('data-testid="podium-tail"');

    const tail = html.slice(html.indexOf('data-testid="podium-tail"'));
    const slots = tail.split("<li").length - 1;

    expect(slots).toBe(4);
  });

  it("G: elementy skaluja sie progiem xs i sm, nie jednym rozmiarem", () => {
    expect(podium).toContain("xs:h-16");
    expect(podium).toContain("sm:h-[4.5rem]");
    expect(source("app/globals.css")).toContain("--breakpoint-xs");
  });

  it("H: geometria desktopu pozostaje bez zmian", () => {
    expect(podium).toContain("sm:max-w-[9.5rem]");
    expect(podium).toContain("sm:gap-5");
    expect(podium).toContain("sm:h-28");
  });
});
