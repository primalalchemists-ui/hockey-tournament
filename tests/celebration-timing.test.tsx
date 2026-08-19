import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { CelebrationButton } from "@/components/celebration-cta";
import { describeCelebrationCta } from "@/lib/public/celebration";
import { buildRevealOrder, getRevealTotalMs } from "@/lib/public/podium-reveal";
import { CEREMONY, tailGapMs } from "@/lib/public/ceremony-timing";

/**
 * CEREMONIA I PRZYCISK - warstwa wizualna po recznej probie generalnej.
 *
 * Poprzednia ceremonia (~2,5 s) czytala sie jak animowany mount, a zloty
 * przycisk wygladal jak promocja. Tu pilnujemy nowego rytmu i nowego,
 * ciemno-zlotego kierunku CTA.
 */

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function entries(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    position: index + 1,
    shared: false,
    team: { teamId: `t${index + 1}` },
  }));
}

function delayMap(count: number) {
  const order = buildRevealOrder(entries(count));
  return new Map(order.map((item) => [item.key, item.delayMs]));
}

describe("A-F: rytm ceremonii", () => {
  it("A: siedem druzyn to 7,2-8,2 s", () => {
    const total = getRevealTotalMs(buildRevealOrder(entries(7)));

    expect(total).toBeGreaterThanOrEqual(7200);
    expect(total).toBeLessThanOrEqual(8200);
  });

  it("B: ogon idzie szybciej niz podium i NARASTA", () => {
    const delay = delayMap(7);

    const firstTail = delay.get("t6")! - delay.get("t7")!;
    const lastTail = delay.get("t4")! - delay.get("t5")!;
    const podiumStep = delay.get("t2")! - delay.get("t3")!;

    expect(firstTail).toBe(CEREMONY.tailBaseMs);
    // Kazde kolejne miejsce kaze czekac dluzej niz poprzednie.
    expect(lastTail).toBeGreaterThan(firstTail);
    expect(lastTail).toBeLessThan(podiumStep);
  });

  it("C: przed pierwszym medalem jest wyrazny oddech", () => {
    const delay = delayMap(7);

    const intoPodium = delay.get("t3")! - delay.get("t4")!;

    expect(intoPodium).toBe(
      CEREMONY.prePodiumPauseMs + CEREMONY.bronzeDelayMs
    );
    expect(CEREMONY.prePodiumPauseMs).toBeGreaterThanOrEqual(800);
    expect(CEREMONY.prePodiumPauseMs).toBeLessThanOrEqual(950);
  });

  it("D: na zloto czeka sie dluzej niz na srebro", () => {
    const delay = delayMap(7);

    const toSilver = delay.get("t2")! - delay.get("t3")!;
    const toGold = delay.get("t1")! - delay.get("t2")!;

    expect(toSilver).toBe(CEREMONY.silverDelayMs);
    expect(toGold).toBe(CEREMONY.winnerDelayMs);
    expect(toGold).toBeGreaterThan(toSilver);
  });

  it("E: zwyciezca wchodzi ostatni", () => {
    const order = buildRevealOrder(entries(7));

    expect(order[order.length - 1].key).toBe("t1");
  });

  it("rytm nie jest zaszyty pod siedem druzyn", () => {
    // Dla trzech medalistow zostaje sama czesc uroczysta.
    const three = buildRevealOrder(entries(3));

    expect(three.map((item) => item.key)).toEqual(["t3", "t2", "t1"]);
    expect(getRevealTotalMs(three)).toBeLessThan(
      getRevealTotalMs(buildRevealOrder(entries(7)))
    );

    // Dziesiec druzyn: dluzszy ogon, ta sama kulminacja.
    const ten = delayMap(10);
    expect(ten.get("t9")! - ten.get("t10")!).toBe(CEREMONY.tailBaseMs);
    expect(ten.get("t1")! - ten.get("t2")!).toBe(CEREMONY.winnerDelayMs);
  });

  it("limit chroni ceremonie przy szesnastu druzynach", () => {
    const sixteen = delayMap(16);
    const delays = Array.from({ length: 16 }, (_, i) => sixteen.get(`t${16 - i}`)!);
    const gaps = delays.slice(1).map((value, index) => value - delays[index]);

    // Zaden odstep w ogonie nie przekracza limitu.
    const tailGaps = gaps.slice(0, 12);
    for (const gap of tailGaps) {
      expect(gap).toBeLessThanOrEqual(CEREMONY.tailCapMs);
    }

    expect(tailGapMs(99)).toBe(CEREMONY.tailCapMs);
  });

  it("F: bez ruchu ceremonia nie trwa pieciu sekund", () => {
    const podium = source("components/playoff/podium-section.tsx");

    // Reduced motion: krotkie przejscie zamiast pelnej sekwencji.
    expect(podium).toContain('"opacity 160ms ease-out"');
    // Seen zapisujemy natychmiast, wiec stan „obejrzane" nie ginie.
    expect(podium).toContain("if (reducedMotion) {");
    expect(podium).toContain("markSeen(storageKey);");
  });

  it("zadna animacja ceremonii sie nie zapetla", () => {
    const css = source("app/globals.css");
    const start = css.indexOf("@keyframes podium-drop");
    const block = css.slice(start, css.indexOf("OBJASNIENIA SKROTOW", start));

    expect(block).not.toContain("infinite");
    expect(block).not.toContain("alternate");

    // Blask konczy sie na stalej wartosci i tam zostaje.
    expect(css).toContain("animation: podium-glow var(--glow-ms");
  });
});
