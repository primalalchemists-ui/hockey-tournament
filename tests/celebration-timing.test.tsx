import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { CelebrationButton } from "@/components/celebration-cta";
import { describeCelebrationCta } from "@/lib/public/celebration";
import {
  REVEAL_PODIUM_PAUSE_MS,
  REVEAL_TAIL_STEP_MS,
  REVEAL_PODIUM_STEP_MS,
  REVEAL_WINNER_DURATION_MS,
  REVEAL_WINNER_EXTRA_MS,
  WINNER_GLOW_MS,
  buildPodiumStorageKey,
  buildRevealOrder,
  getRevealDurationMs,
  getRevealTotalMs,
} from "@/lib/public/podium-reveal";

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
  it("A: siedem druzyn to 5,8-6,5 s", () => {
    const total = getRevealTotalMs(buildRevealOrder(entries(7)));

    expect(total).toBeGreaterThanOrEqual(5800);
    expect(total).toBeLessThanOrEqual(6500);
  });

  it("B: ogon idzie szybciej niz podium", () => {
    const delay = delayMap(7);

    const tailStep = delay.get("t6")! - delay.get("t7")!;
    const podiumStep = delay.get("t2")! - delay.get("t3")!;

    expect(tailStep).toBe(REVEAL_TAIL_STEP_MS);
    expect(podiumStep).toBe(REVEAL_PODIUM_STEP_MS);
    expect(tailStep).toBeLessThan(podiumStep);
  });

  it("C: przed pierwszym medalem jest oddech", () => {
    const delay = delayMap(7);

    const intoPodium = delay.get("t3")! - delay.get("t4")!;

    expect(intoPodium).toBe(REVEAL_PODIUM_STEP_MS + REVEAL_PODIUM_PAUSE_MS);
    expect(intoPodium).toBeGreaterThan(delay.get("t2")! - delay.get("t3")!);
  });

  it("D: przed zwyciezca jest druga pauza", () => {
    const delay = delayMap(7);

    expect(delay.get("t1")! - delay.get("t2")!).toBe(
      REVEAL_PODIUM_STEP_MS + REVEAL_WINNER_EXTRA_MS
    );
  });

  it("E: zwyciezca wchodzi ostatni i wchodzi najdluzej", () => {
    const order = buildRevealOrder(entries(7));

    expect(order[order.length - 1].key).toBe("t1");
    expect(getRevealDurationMs(1)).toBe(REVEAL_WINNER_DURATION_MS);
    expect(getRevealDurationMs(2)).toBeLessThan(REVEAL_WINNER_DURATION_MS);
  });

  it("rytm nie jest zaszyty pod siedem druzyn", () => {
    // Dla trzech medalistow zostaje sama czesc uroczysta.
    const three = buildRevealOrder(entries(3));

    expect(three.map((item) => item.key)).toEqual(["t3", "t2", "t1"]);
    expect(getRevealTotalMs(three)).toBeLessThan(
      getRevealTotalMs(buildRevealOrder(entries(7)))
    );

    // Dziesiec druzyn: dluzszy ogon, ale ta sama kulminacja.
    const ten = delayMap(10);
    expect(ten.get("t9")! - ten.get("t10")!).toBe(REVEAL_TAIL_STEP_MS);
    expect(ten.get("t1")! - ten.get("t2")!).toBe(
      REVEAL_PODIUM_STEP_MS + REVEAL_WINNER_EXTRA_MS
    );
  });

  it("F: bez ruchu ceremonia nie trwa pieciu sekund", () => {
    const podium = source("components/playoff/podium-section.tsx");

    // Reduced motion: krotkie przejscie zamiast pelnej sekwencji.
    expect(podium).toContain('"opacity 160ms ease-out"');
    // Seen zapisujemy natychmiast, wiec stan „obejrzane" nie ginie.
    expect(podium).toContain("if (reducedMotion) {");
    expect(podium).toContain("markSeen(storageKey);");
  });

  it("winner moment jest jednorazowy", () => {
    const css = source("app/globals.css");
    const start = css.indexOf("@keyframes winner-glow");
    const block = css.slice(start, css.indexOf("/* ===", start));

    expect(WINNER_GLOW_MS).toBeGreaterThanOrEqual(700);
    expect(WINNER_GLOW_MS).toBeLessThanOrEqual(1000);

    expect(block).toContain("animation: winner-glow 900ms ease-out 1 both");
    expect(block).not.toContain("infinite");
    expect(block).not.toContain("alternate");
  });
});
