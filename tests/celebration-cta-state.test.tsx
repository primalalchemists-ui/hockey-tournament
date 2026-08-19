import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { CelebrationButton } from "@/components/celebration-cta";
import { describeCelebrationCta } from "@/lib/public/celebration";
import { buildPodiumStorageKey } from "@/lib/public/podium-reveal";

/**
 * PRZYCISK CELEBRACJI - stan i wyglad.
 *
 * Realny bug z recznej proby: po obejrzeniu ceremonii desktop zmienial
 * napis, a mobile dalej zapraszal na celebracje. Przyczyna nie byla
 * w logice przycisku, tylko w zapamietanym poddrzewie - patrz test M.
 */

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const BASE = {
  isCompleted: true,
  classificationComplete: true,
  scopeKey: "A",
};

describe("G-J: napis przycisku", () => {
  it("G/I: przed obejrzeniem zaprasza na celebracje", () => {
    const cta = describeCelebrationCta({ ...BASE, seen: false });

    expect(cta.label).toBe("Zobacz celebrację");
    expect(cta.kind).toBe("celebration");
    expect(cta.shine).toBe(true);
  });

  it("H/J: po obejrzeniu prowadzi do klasyfikacji", () => {
    const cta = describeCelebrationCta({ ...BASE, seen: true });

    expect(cta.label).toBe("Zobacz klasyfikację");
    expect(cta.shine).toBe(false);
  });

  it("przed zakonczeniem turnieju to zwykly przycisk wynikow", () => {
    const cta = describeCelebrationCta({
      ...BASE,
      isCompleted: false,
      seen: false,
    });

    expect(cta.label).toBe("Sprawdź wyniki");
    expect(cta.kind).toBe("results");
    expect(cta.shine).toBe(false);
  });
});

describe("K-P: wspolny stan obejrzenia", () => {
  it("M: desktop i mobile licza ten sam klucz pamieci", () => {
    const key = buildPodiumStorageKey({
      tournamentId: "t1",
      scopeKey: "A",
      completionToken: "2026-01-01T00:00:00.000Z",
    });

    expect(
      buildPodiumStorageKey({
        tournamentId: "t1",
        scopeKey: "A",
        completionToken: "2026-01-01T00:00:00.000Z",
      })
    ).toBe(key);

    // Jedno zrodlo prawdy: oba przyciski dostaja TEN SAM obiekt CTA.
    const shell = source("components/tournament-shell.tsx");
    expect(shell.split("useCelebration(").length - 1).toBe(1);
    expect(source("components/standings-table.tsx")).not.toContain(
      "useCelebration"
    );
    expect(source("components/tournament-header.tsx")).not.toContain(
      "useCelebration"
    );
  });

  it("K/L: zapamietane poddrzewo odswieza sie razem z przyciskiem", () => {
    /*
      TU BYL BUG. Lista zaleznosci `content` nie zawierala `celebration`,
      wiec po ceremonii hero (poza memo) zmienial napis, a Ranking - czyli
      przycisk mobilny wewnatrz memo - zostawal ze starym obiektem.
    */
    const shell = source("components/tournament-shell.tsx");
    const memoStart = shell.indexOf("const content = useMemo(");
    const deps = shell.slice(shell.indexOf("}, [", memoStart));

    expect(deps.slice(0, deps.indexOf("]"))).toContain("celebration");
    expect(deps.slice(0, deps.indexOf("]"))).toContain("tournamentId");
  });

  it("N: grupy maja niezalezna pamiec ceremonii", () => {
    const a = buildPodiumStorageKey({
      tournamentId: "t1",
      scopeKey: "A",
      completionToken: "tok",
    });
    const b = buildPodiumStorageKey({
      tournamentId: "t1",
      scopeKey: "B",
      completionToken: "tok",
    });

    expect(a).not.toBe(b);
  });

  it("O: nowa finalizacja kasuje pamiec obu przyciskow", () => {
    const first = buildPodiumStorageKey({
      tournamentId: "t1",
      scopeKey: "A",
      completionToken: "2026-01-01T00:00:00.000Z",
    });
    const second = buildPodiumStorageKey({
      tournamentId: "t1",
      scopeKey: "A",
      completionToken: "2026-02-02T00:00:00.000Z",
    });

    expect(second).not.toBe(first);
  });

  it("P: pamiec zyje w localStorage, wiec przezywa odswiezenie", () => {
    const reveal = source("lib/public/podium-reveal.ts");

    expect(reveal).toContain("window.localStorage.getItem");
    expect(reveal).toContain("window.localStorage.setItem");
  });
});

describe("Q-V: wyglad przycisku", () => {
  const unseen = renderToStaticMarkup(
    <CelebrationButton cta={describeCelebrationCta({ ...BASE, seen: false })} />
  );
  const seen = renderToStaticMarkup(
    <CelebrationButton cta={describeCelebrationCta({ ...BASE, seen: true })} />
  );

  const css = source("app/globals.css");
  const celebrationCss = css.slice(
    css.indexOf(".btn-celebration {"),
    css.indexOf(".btn-danger {")
  );

  it("Q: nieobejrzana ceremonia dostaje jednorazowy refleks", () => {
    expect(unseen).toContain('data-shine="true"');
    expect(unseen).toContain("cta-shine");
  });

  it("R: po obejrzeniu refleksu nie ma", () => {
    expect(seen).toContain('data-shine="false"');
    expect(seen).not.toContain("cta-shine");
  });

  it("S: przy ograniczonym ruchu refleks jest wylaczony", () => {
    const shine = css.slice(css.indexOf(".cta-shine {"));

    expect(shine).toContain("prefers-reduced-motion: reduce");
  });

  it("T: zadna animacja przycisku sie nie zapetla", () => {
    const shine = css.slice(css.indexOf("@keyframes cta-shine"));

    expect(shine.slice(0, shine.indexOf("/* ==="))).not.toContain("infinite");
    expect(celebrationCss).not.toContain("animation");
  });

  it("U: hover nie przesuwa ani nie skaluje przycisku", () => {
    expect(celebrationCss).not.toContain("translateY");
    expect(celebrationCss).not.toContain("scale(");
  });

  it("V: focus-visible jest wyrazny", () => {
    expect(celebrationCss).toContain(".btn-celebration:focus-visible");
    expect(celebrationCss).toContain("outline");
  });

  it("kierunek premium: ciemne tlo, cienka zlota krawedz", () => {
    // Zero pastelowego wypelnienia i zero neonu - tylko granat i zloto.
    expect(celebrationCss).toContain("#0b1220");
    expect(celebrationCss).toContain("border: 1px solid rgba(214, 175, 108");
    expect(celebrationCss).not.toContain("#fdf3d8");
  });

  it("AQ: klik nie wywoluje zadnego rozblysku", () => {
    const active = celebrationCss.slice(
      celebrationCss.indexOf(".btn-celebration:active")
    );

    /*
      Wcisniecie tylko poglebia granat i wciska cien do srodka. Wczesniej
      tlo szlo w gore i czytalo sie to jak mignieicie bialym.
    */
    expect(active).toContain("#0c1524");
    expect(active).toContain("inset");
    expect(active).not.toContain("rgba(255, 255, 255");
  });

  it("AR: hover na desktopie odpala jeden przejazd swiatla", () => {
    expect(unseen).toContain("cta-sheen");

    const sheen = css.slice(css.indexOf(".cta-sheen {"));

    expect(sheen).toContain("hover: hover");
    expect(sheen).toContain("pointer: fine");
    expect(sheen).toContain("cta-sheen 680ms");
    // Jeden przejazd, bez petli.
    expect(sheen.slice(0, sheen.indexOf("prefers-reduced-motion"))).not.toContain(
      "infinite"
    );
  });

  it("AT: powitalny refleks i hover to DWIE osobne warstwy", () => {
    // ::after nalezy do zaproszenia, ::before do najechania - klik nie
    // restartuje ani jednego, ani drugiego.
    expect(css).toContain(".cta-shine::after");
    expect(css).toContain(".cta-sheen::before");

    expect(seen).toContain("cta-sheen");
    expect(seen).not.toContain("cta-shine");
  });

  it("AV: samo kliniecie nie oznacza ceremonii jako obejrzanej", () => {
    const button = source("components/celebration-cta.tsx");

    // Klik wylacznie przewija - zapis "obejrzane" nalezy do podium.
    expect(button).toContain("scrollIntoView");
    expect(button).not.toContain("markRevealSeen");
    expect(button).not.toContain("CELEBRATION_SEEN_EVENT");
  });

  it("przycisk niesie ikone pucharu", () => {
    expect(unseen).toContain("svg");
    expect(unseen).toContain('data-kind="celebration"');
  });
});
