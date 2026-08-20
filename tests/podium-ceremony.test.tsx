import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { PodiumSection } from "@/components/playoff/podium-section";
import {
  PODIUM_DROP_MS,
  PODIUM_HAPTIC_MS,
  PODIUM_SHAKE_PX,
  buildRevealOrder,
  getImpactMs,
  getRevealTotalMs,
} from "@/lib/public/podium-reveal";
import { shouldVibrate, supportsHaptics } from "@/lib/public/haptics";
import { CEREMONY, beamAtMs, glowAtMs } from "@/lib/public/ceremony-timing";
import type { ClassificationView } from "@/lib/data/postgres/playoff-engine";
import type { ClassificationSlot } from "@/lib/playoff/classification";

/**
 * CEREMONIA MEDALOWA.
 *
 * Herb opada nad swoj stopien, laduje, stopien drga, z gory schodzi snop
 * swiatla i dopiero wtedy zapala sie blask danego medalu. Kazde miejsce
 * ma wlasny mini-moment - nic nie zapala sie jednoczesnie.
 */

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const NAMES = [
  "UKS Zagłębie Sosnowiec 1",
  "MOSM Tychy Tyskie Lwy 1",
  "BS Polonia Bytom 1",
  "GKS Katowice 1",
  "Naprzód Janów Katowice 1",
  "KH Dębica",
  "MMKS Podhale Nowy Targ",
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
const css = source("app/globals.css");

const order = buildRevealOrder(classification.entries);
const delay = new Map(order.map((item) => [item.key, item.delayMs]));

describe("N-R: scena bez nazw", () => {
  it("N: podium 1-3 nie wypisuje nazw druzyn", () => {
    const scene = html.slice(
      html.indexOf('data-testid="podium-scene"'),
      html.indexOf('data-testid="podium-tail"')
    );

    for (const name of NAMES.slice(0, 3)) {
      // Nazwa istnieje wylacznie jako etykieta dostepnosci, nie jako tekst.
      expect(scene).not.toContain(`>${name}<`);
    }
  });

  it("O: rzad 4-7 tez pokazuje wylacznie numer i herb", () => {
    const tail = html.slice(html.indexOf('data-testid="podium-tail"'));

    for (const name of NAMES.slice(3)) {
      expect(tail).not.toContain(`>${name}<`);
    }

    expect(tail.split('data-testid="podium-tail-slot"').length - 1).toBe(4);
  });

  it("P/Q: pelna nazwa jest w dymku i w etykiecie dostepnosci", () => {
    expect(html).toContain('data-testid="podium-team"');
    expect(html).toContain('aria-label="1. miejsce — UKS Zagłębie Sosnowiec 1"');
    expect(html).toContain('aria-label="7. miejsce — MMKS Podhale Nowy Targ"');
  });

  it("R: dymek to prawdziwy przycisk, wiec dziala dotyk i klawiatura", () => {
    const trigger = html.slice(html.indexOf('data-testid="podium-team"'));

    expect(trigger).toContain('aria-expanded="false"');
    expect(html).toContain('type="button"');
  });

  it("dymek spi do konca ceremonii", () => {
    expect(podium).toContain("disabled={!interactive}");
    expect(podium).toContain("const interactive = ceremonyDone || reducedMotion");
  });
});

describe("wykonczenie medalu w renderze", () => {
  it("kazdy medal dostaje wykonczenie odpowiadajace miejscu", () => {
    const medals = html.split('data-testid="podium-medal"');

    expect(medals).toHaveLength(4);
    expect(html).toContain("medal-gold");
    expect(html).toContain("medal-silver");
    expect(html).toContain("medal-bronze");
  });

  it("rozmiar krazka pozostaje bez zmian", () => {
    // Podbita jest wylacznie obwodka, nie geometria medalu.
    expect(html).toContain("h-11 w-11 sm:h-14 sm:w-14");
    expect(html).toContain("h-8 w-8 sm:h-10 sm:w-10");
    expect(html).toContain("h-7 w-7 sm:h-8 sm:w-8");
  });
});

describe("S-AD: przebieg ceremonii", () => {
  it("S: siedem druzyn miesci sie w 7,2-8,2 s", () => {
    const total = getRevealTotalMs(order);

    expect(total).toBeGreaterThanOrEqual(7200);
    expect(total).toBeLessThanOrEqual(8200);
  });

  it("T/U: najpierw ogon od konca, potem 3, 2, 1", () => {
    expect(order.map((item) => item.key)).toEqual([
      "t7",
      "t6",
      "t5",
      "t4",
      "t3",
      "t2",
      "t1",
    ]);
  });

  it("V: herb startuje NAD swoim miejscem i opada", () => {
    const drop = css.slice(css.indexOf("@keyframes podium-drop"));

    expect(drop).toContain("translateY(-2.5rem)");
    expect(drop).toContain("translateY(0)");

    /*
      Render serwerowy pokazuje stan SPRZED ceremonii (obserwator jeszcze
      nie zadziałał), więc klasy animacji sprawdzamy w komponencie.
    */
    expect(podium).toContain('animate ? "podium-drop" : ""');
    expect(podium).toContain("animationDelay: `${delayMs}ms`");
  });

  it("W: uderzenie nastepuje PO wyladowaniu", () => {
    const impact = getImpactMs(delay.get("t1")!);

    expect(impact).toBe(delay.get("t1")! + PODIUM_DROP_MS);

    // Uderzenie jest opóźnione dokładnie o czas opadania.
    expect(podium).toContain('animate ? "podium-impact" : ""');
    expect(podium).toContain("animationDelay: `${impactMs}ms`");

    const shake = css.slice(css.indexOf("@keyframes podium-impact"));
    expect(shake).toContain("var(--shake");
    // Drga sam stopien, nigdy strona.
    expect(podium).not.toContain("document.body");
  });

  it("X: snop swiatla schodzi w okolicy uderzenia", () => {
    expect(podium).toContain('data-testid="podium-beam"');
    // Snop wyprzedza lądowanie, żeby zdążył oświetlić stopień.
    expect(podium).toContain("animationDelay: `${beamAtMs(delayMs)}ms`");
    expect(beamAtMs(2000)).toBeLessThan(getImpactMs(2000));

    const beam = css.slice(css.indexOf(".podium-beam {"));
    expect(beam).toContain("bottom: 100%");
    expect(beam).toContain("mask-image");
  });

  it("Y/Z/AA: braz, srebro i zloto maja wlasny ton swiatla", () => {
    expect(html).toContain("podium-tone-bronze");
    expect(html).toContain("podium-tone-silver");
    expect(html).toContain("podium-tone-gold");

    expect(css).toContain("--glow-peak: rgba(214, 154, 100");
    expect(css).toContain("--glow-peak: rgba(226, 232, 240");
    expect(css).toContain("--glow-peak: rgba(255, 214, 124");
  });

  it("AB: kulminacja nalezy do zwyciezcy", () => {
    expect(delay.get("t1")).toBeGreaterThan(delay.get("t2")!);
    expect(PODIUM_SHAKE_PX[1]).toBeGreaterThan(PODIUM_SHAKE_PX[2]);
    expect(PODIUM_SHAKE_PX[2]).toBeGreaterThan(PODIUM_SHAKE_PX[3]);
  });

  it("AB: kazdy medal zapala sie po SWOIM uderzeniu, nie razem", () => {
    // Opóźnienia blasku liczone z realnej kolejności ceremonii.
    const impacts = [3, 2, 1].map((position) =>
      getImpactMs(delay.get(`t${position}`)!)
    );

    expect(new Set(impacts).size).toBe(3);
    expect(impacts[0]).toBeLessThan(impacts[1]);
    expect(impacts[1]).toBeLessThan(impacts[2]);

    expect(podium).toContain('data-testid="podium-glow"');
    expect(podium).toContain("animationDelay: `${impactMs}ms`");
  });

  it("AC: zadna animacja ceremonii sie nie zapetla", () => {
    const block = css.slice(
      css.indexOf("@keyframes podium-drop"),
      css.indexOf("OBJASNIENIA SKROTOW")
    );

    expect(block).not.toContain("infinite");
    expect(block).not.toContain("alternate");
  });

  it("AD: obejrzana ceremonia pomija cala sekwencje", () => {
    expect(podium).toContain("if (!hasSeenReveal(storageKey)) return;");
    // Maszyna stanow wchodzi wprost w stan koncowy — bez ceremonii.
    expect(podium).toContain('dispatch({ type: "ALREADY_SEEN" })');

    const reduced = css.slice(
      css.indexOf("prefers-reduced-motion", css.indexOf(".podium-glow"))
    );
    expect(reduced).toContain("animation: none");
  });
});

describe("AE-AI: haptyka jako dodatek", () => {
  const live = {
    isLiveReveal: true,
    reducedMotion: false,
    documentVisible: true,
  };

  it("AE: brak wsparcia nie powoduje bledu", () => {
    expect(supportsHaptics()).toBe(false);
    expect(() => shouldVibrate(live)).not.toThrow();
  });

  it("AF: ograniczony ruch wycisza wibracje", () => {
    expect(shouldVibrate({ ...live, reducedMotion: true })).toBe(false);
  });

  it("AG: odtworzona, obejrzana ceremonia nie wibruje", () => {
    expect(shouldVibrate({ ...live, isLiveReveal: false })).toBe(false);
  });

  it("AH: ukryta karta nie wibruje", () => {
    expect(shouldVibrate({ ...live, documentVisible: false })).toBe(false);
    expect(shouldVibrate(live)).toBe(true);
  });

  it("AI: impuls rosnie z ranga i nigdy nie jest wzorcem", () => {
    expect(PODIUM_HAPTIC_MS[1]).toBeGreaterThan(PODIUM_HAPTIC_MS[2]);
    expect(PODIUM_HAPTIC_MS[2]).toBeGreaterThan(PODIUM_HAPTIC_MS[3]);
    expect(PODIUM_HAPTIC_MS[1]).toBeLessThanOrEqual(40);

    const haptics = source("lib/public/haptics.ts");
    expect(haptics).toContain("navigator.vibrate(durationMs)");
  });
});
