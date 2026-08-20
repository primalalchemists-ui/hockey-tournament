import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  GROUP_FADE_IN_MS,
  GROUP_FADE_OUT_MS,
  GROUP_RISE_PX,
  GroupTransition,
} from "@/components/public/group-transition";

/**
 * ZMIANA GRUPY A/B.
 *
 * Wiersze przeskakiwaly, bo dwie tabele maja rozne skladow i rozna
 * kolejnosc. Zamiast animowac pojedyncze druzyny traktujemy caly blok
 * wynikow jak JEDNA tresc: gasnie, podmienia sie i wraca.
 */

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const transition = source("components/public/group-transition.tsx");
const groupTabs = source("components/group-tabs.tsx");
const history = source("components/history/archived-tournament-view.tsx");
const css = source("app/globals.css");

describe("H-J: co sie animuje", () => {
  it("H: pierwszy render nie wymaga przejscia", () => {
    const idle = renderToStaticMarkup(
      <GroupTransition phase="idle">
        <p>tabela</p>
      </GroupTransition>
    );

    expect(idle).toContain('data-phase="idle"');
    // Zadnej klasy wejscia i zadnego wygaszenia na starcie.
    expect(idle).not.toContain("group-enter");
    expect(idle).not.toContain("opacity:0");
  });

  it("I: przejscie obejmuje CALY blok, nie pojedyncze wiersze", () => {
    const out = renderToStaticMarkup(
      <GroupTransition phase="out">
        <p>tabela</p>
      </GroupTransition>
    );

    expect(out).toContain('data-testid="group-transition"');
    expect(out).toContain("opacity:0");
  });

  it("J: zero animacji per wiersz", () => {
    for (const file of [transition, groupTabs, history]) {
      // Zero FLIP-a, zero layout animations, zero opoznien per element.
      expect(file).not.toContain("layoutId");
      expect(file).not.toContain("AnimatePresence");
      expect(file).not.toMatch(/staggerChildren|delay:\s*index/);
    }

    // Ranking i matryca sa w jednym wrapperze, wiec nic nie skacze osobno.
    const wrapper = groupTabs.indexOf("<GroupTransition");
    expect(groupTabs.indexOf("<StandingsTable", wrapper)).toBeGreaterThan(
      wrapper
    );
    expect(groupTabs.indexOf("<MatchMatrix", wrapper)).toBeGreaterThan(wrapper);
  });
});

describe("timing i charakter ruchu", () => {
  it("wygaszenie jest krotkie, wejscie nieco dluzsze", () => {
    expect(GROUP_FADE_OUT_MS).toBeGreaterThanOrEqual(100);
    expect(GROUP_FADE_OUT_MS).toBeLessThanOrEqual(140);

    // Wejscie jest CELOWO dluzsze: to ono ma byc widoczne.
    expect(GROUP_FADE_IN_MS).toBeGreaterThanOrEqual(220);
    expect(GROUP_FADE_IN_MS).toBeLessThanOrEqual(280);
    expect(GROUP_FADE_IN_MS).toBeGreaterThan(GROUP_FADE_OUT_MS);

    // Calosc miesci sie w budzecie ~330-410 ms.
    const total = GROUP_FADE_OUT_MS + GROUP_FADE_IN_MS;
    expect(total).toBeGreaterThanOrEqual(330);
    expect(total).toBeLessThanOrEqual(410);
  });

  it("wejscie to delikatne uniesienie, bez skali i sprezyn", () => {
    // Sam blok keyframes; regula .group-enter zaczyna sie od @layer.
    const start = css.indexOf("@keyframes group-enter");
    const block = css.slice(start, css.indexOf("@layer", start));

    expect(GROUP_RISE_PX).toBeGreaterThanOrEqual(5);
    expect(GROUP_RISE_PX).toBeLessThanOrEqual(8);

    expect(block).toContain(`translateY(${GROUP_RISE_PX}px)`);
    expect(block).toContain("translateY(0)");

    // Ruch to WYLACZNIE przesuniecie w pionie - zero skali i rotacji.
    const transforms = block.match(/transform:[^;]+/g) ?? [];

    expect(transforms).toHaveLength(2);
    for (const rule of transforms) {
      expect(rule).toContain("translateY");
      expect(rule).not.toContain("scale");
      expect(rule).not.toContain("rotate");
    }
  });
});

describe("N-Q: stan przejscia", () => {
  it("N: szybkie klikanie konczy sie na ostatnim wyborze", () => {
    // Przy kazdej zmianie kasujemy poprzednie liczniki i planujemy nowe.
    expect(transition).toContain("for (const timer of timers.current)");
    expect(transition).toContain("timers.current = [];");
    expect(transition).toContain("setDisplayedKey(requestedKey)");
  });

  it("O: liczniki sa sprzatane przy odmontowaniu", () => {
    expect(transition).toContain("return () => {");
    expect(transition).toContain("window.clearTimeout(timer)");
  });

  it("P: bez ruchu podmiana jest natychmiastowa", () => {
    // Bez ruchu obie fazy trwaja zero milisekund - podmiana jest natychmiastowa.
    expect(transition).toContain("reducedRef.current ? 0 : GROUP_FADE_OUT_MS");
    expect(transition).toContain("reducedRef.current ? 0 : GROUP_FADE_IN_MS");
    expect(transition).toContain('setPhase(reducedRef.current ? "idle" : "in")');

    const reduced = css.slice(css.indexOf(".group-enter {"));
    expect(reduced).toContain("prefers-reduced-motion");
    expect(reduced).toContain("animation: none");
  });

  it("Q: auto-odswiezanie NIE uruchamia przejscia", () => {
    // Przejscie zalezy WYLACZNIE od klucza grupy, nie od tresci.
    expect(transition).toContain("if (requestedKey === displayedKey) return;");
    expect(transition).toContain("}, [requestedKey, displayedKey]);");
  });
});

describe("S-U: rozne liczby druzyn", () => {
  it("S: podloga wysokosci chroni przed zapadnieciem sie strony", () => {
    expect(transition).toContain("getBoundingClientRect().height");
    expect(transition).toContain('if (phase === "out")');
  });

  it("T: po przejsciu wysokosc wraca do naturalnej", () => {
    expect(transition).toContain('if (phase === "idle") setMinHeight(null);');
    expect(transition).toContain("minHeight: minHeight ?? undefined");
    // Nigdy sztywna wysokosc.
    expect(transition).not.toContain("height:");
  });
});

describe("R/13: zakres i brak falszywych loaderow", () => {
  it("R: strona historii dostaje to samo przejscie", () => {
    expect(history).toContain("useGroupTransition");
    expect(history).toContain("<GroupTransition");
  });

  it("13: zmiana grupy nie pokazuje zadnego loadera", () => {
    for (const file of [transition, groupTabs, history]) {
      expect(file).not.toContain("BrandLoader");
      expect(file).not.toContain("Spinner");
    }
  });

  it("przycisk reaguje natychmiast, tresc po wygaszeniu", () => {
    // Aktywna zakladka idzie za WYBOREM, nie za pokazywana grupa.
    expect(history).toContain("item.key === activeKey");
    expect(groupTabs).toContain("useGroupTransition(activeGroup)");
  });
});

describe("AO-AP/AT: wejscie naprawde animuje", () => {
  it("AO/AP: nowa tresc startuje od zera, nie od stanu koncowego", () => {
    const css = source("app/globals.css");
    const start = css.indexOf("@keyframes group-enter");
    const block = css.slice(start, css.indexOf("@layer", start));

    // Klatka `from` istnieje niezaleznie od poprzedniego stanu DOM-u.
    expect(block).toContain("opacity: 0");
    expect(transition).toContain('className={phase === "in" ? "group-enter"');
  });

  it("AO: klucz tresci wymusza swiezy wezel przy zmianie grupy", () => {
    expect(transition).toContain("key={contentKey}");
    expect(groupTabs).toContain("contentKey={displayedKey}");
    expect(history).toContain("contentKey={displayedKey}");
  });

  it("AT: pierwszy render nie odtwarza animacji przelaczenia", () => {
    // Faza startowa to "idle", wiec klasa wejscia w ogole sie nie pojawia.
    expect(transition).toContain('useState<GroupTransitionPhase>("idle")');
  });
});
