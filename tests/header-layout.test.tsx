import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { CategorySwitcher } from "@/components/public/category-switcher";
import { TournamentHeader } from "@/components/tournament-header";

/**
 * PASEK NARZEDZIOWY — trzy strefy.
 *
 * Kategoria doklejona jako czwarte rodzenstwo do `justify-between`
 * rozpychala pasek i zabierala licznikowi meczow srodek. Od `md` pasek
 * jest siatka `1fr auto 1fr`, wiec srodek jest srodkiem kontenera,
 * a nie srodkiem wolnego miejsca.
 */

const header = readFileSync(
  new URL("../components/tournament-header.tsx", import.meta.url),
  "utf8"
);

function switcher(label: string) {
  return (
    <CategorySwitcher
      variant="inline"
      categories={[
        { tournamentId: "a", label, bubbleColor: "#1E3A5F" },
        { tournamentId: "b", label: "U10", bubbleColor: "#D6A52A" },
      ]}
      selectedTournamentId="a"
      isSwitching={false}
      onSelect={() => {}}
      error={null}
    />
  );
}

function render(label: string | null) {
  return renderToStaticMarkup(
    <TournamentHeader
      title="SUN CUP 2026"
      scorers={[]}
      teams={[]}
      plannedMatchCount={56}
      playedMatchCount={1}
      categorySwitcher={label === null ? undefined : switcher(label)}
      cta={{
        kind: "results",
        label: "Sprawdź wyniki",
        shine: false,
        targetId: "wyniki",
        cinematic: false,
      }}
    />
  );
}

/** Wycina klasy najblizszego `<div>`, w ktorym siedzi dany znacznik. */
function classesOfAncestor(html: string, needle: string) {
  const at = html.indexOf(needle);
  const open = html.lastIndexOf("<div", at);
  const tag = html.slice(open, html.indexOf(">", open));

  return /class="([^"]*)"/.exec(tag)?.[1] ?? "";
}

describe("A-B: lewy klaster", () => {
  it("A: Wyniki Live i kategoria siedza w jednym wrapperze", () => {
    const cluster = header.indexOf(
      'className="flex items-center gap-2 md:justify-self-start"'
    );

    expect(cluster).toBeGreaterThan(-1);
    // Oba dzieci po otwarciu klastra, oba przed licznikiem meczow.
    // `lastIndexOf` — wczesniejsze trafienie to komentarz nad komponentem.
    expect(header.lastIndexOf("Wyniki Live")).toBeGreaterThan(cluster);
    expect(header.indexOf("{categorySwitcher}")).toBeGreaterThan(cluster);
    expect(header.indexOf("{categorySwitcher}")).toBeLessThan(
      header.indexOf('data-testid="match-progress"')
    );
  });

  it("A: klaster ma wlasny, ciasny odstep", () => {
    // 8 px miedzy „Wyniki Live" a kapsulka — ciasniej niz miedzy strefami.
    expect(header).toContain("flex items-center gap-2 md:justify-self-start");
  });

  it("B: kategoria nie jest osobna kolumna siatki", () => {
    // Trzy kolumny, trzy dzieci — kategoria jest wewnatrz pierwszego.
    expect(header).toContain(
      "md:grid md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]"
    );
    expect(header).not.toContain("md:grid-cols-4");
    // Kapsulka nie dostaje wlasnego `justify-self`.
    const slot = header.indexOf("{categorySwitcher}");
    expect(header.slice(slot - 120, slot)).not.toContain("justify-self");
  });
});

describe("C-D: strefy", () => {
  it("C: licznik meczow stoi w srodkowej kolumnie", () => {
    const html = render("U8");

    expect(classesOfAncestor(html, 'data-testid="match-progress"')).toContain(
      "md:justify-self-center"
    );
  });

  it("D: ikony spolecznosciowe wyrownane do prawej krawedzi", () => {
    expect(header).toContain("flex items-center gap-4 md:justify-self-end");
    // Rozmiar, odstep i kolejnosc bez zmian.
    expect(header).toContain("inline-flex h-11 w-11 items-center");
    expect(header.indexOf("instagram.com")).toBeLessThan(
      header.indexOf("facebook.com")
    );
  });
});

describe("E: granice paska", () => {
  it("pasek i hero dziela ten sam kontener", () => {
    // Zaden z nich nie ma wlasnego `max-w` ani `mx-auto` — szerokosc
    // narzuca wspolny kontener strony (`max-w-[1400px]` w app/page.tsx).
    const page = readFileSync(
      new URL("../app/page.tsx", import.meta.url),
      "utf8"
    );

    expect(page).toContain("mx-auto max-w-[1400px]");
    expect(header).not.toContain("max-w-[");
    expect(header).not.toContain("mx-auto");
  });
});

describe("F-H: srodek nie drga", () => {
  const short = render("U8");
  const long = render("OPEN SENIORÓW");

  it("F/G: dluzsza etykieta kategorii nie rusza licznika", () => {
    // Ten sam element w tej samej kolumnie, z tymi samymi klasami.
    expect(classesOfAncestor(short, 'data-testid="match-progress"')).toBe(
      classesOfAncestor(long, 'data-testid="match-progress"')
    );

    // Etykiety naprawde sie roznia — test nie porownuje dwoch identycznych drzew.
    expect(short).toContain(">U8<");
    expect(long).toContain("OPEN SENIORÓW");
  });

  it("G: dluga etykieta nie rozpycha swojej kolumny", () => {
    // `minmax(0, 1fr)` pozwala kolumnie sie skurczyc zamiast pchac srodek.
    expect(header).toContain("minmax(0,1fr)_auto_minmax(0,1fr)");
    expect(header).not.toContain("md:grid-cols-[1fr_auto_1fr]");
  });

  it("H: srodek jest srodkiem kontenera na kazdej szerokosci desktopu", () => {
    /*
      1280 / 1440 / 1920 — skrajne kolumny to zawsze rowne `1fr`, wiec
      geometria srodka nie zalezy od szerokosci ekranu ani od tego, co
      w tych kolumnach stoi. Zaden breakpoint nie nadpisuje siatki.
    */
    expect(header).not.toContain("lg:grid-cols");
    expect(header).not.toContain("xl:grid-cols");
    expect(header).not.toContain("2xl:grid-cols");
  });

  it("brak kategorii nie zmienia stref", () => {
    expect(classesOfAncestor(render(null), 'data-testid="match-progress"')).toBe(
      classesOfAncestor(short, 'data-testid="match-progress"')
    );
  });
});

describe("I-K: telefon i przepelnienie", () => {
  it("I: ponizej `md` zostaje dotychczasowy uklad", () => {
    // Siatka wchodzi dopiero od `md`; nizej dziala stary `justify-between`.
    expect(header).toContain(
      "flex flex-row items-center justify-between gap-3 px-3 sm:gap-4 sm:px-0 md:grid"
    );
  });

  it("J: plywajacy babelek nietkniety", () => {
    const shell = readFileSync(
      new URL("../components/tournament-shell.tsx", import.meta.url),
      "utf8"
    );
    const code = readFileSync(
      new URL("../components/public/category-switcher.tsx", import.meta.url),
      "utf8"
    );

    expect(shell).toContain('variant="floating"');
    expect(code).toContain("fixed right-4 z-30 md:hidden");
    expect(code).toContain("env(safe-area-inset-bottom, 0px)");
    expect(code).toContain("h-11 min-w-[3.75rem] px-4");
  });

  it("K: pasek nie generuje poziomego przewijania", () => {
    // Zadnych sztywnych szerokosci ani ujemnych marginesow w pasku...
    const row = header.slice(
      header.indexOf("PASEK NARZĘDZIOWY"),
      header.indexOf('data-testid="hero"')
    );

    expect(row).not.toMatch(/\bw-\[\d/);
    expect(row).not.toMatch(/\s-m[xlr]?-/);
    // ...a kolumny moga sie skurczyc.
    expect(row).toContain("minmax(0,1fr)");
  });

  it("13: na danej szerokosci istnieje dokladnie jedna kategoria", () => {
    const html = render("U8");

    // W pasku wylacznie wariant `inline`, ukryty ponizej `md`.
    expect(html).toContain('data-variant="inline"');
    expect(html).not.toContain('data-variant="floating"');
    expect(html).toContain("hidden md:inline-flex");
  });
});
