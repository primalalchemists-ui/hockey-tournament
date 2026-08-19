import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  CEREMONY,
  beamAtMs,
  glowAtMs,
  impactAtMs,
  tailGapMs,
} from "@/lib/public/ceremony-timing";
import { STAGE_SHAKE_PX, PODIUM_SHAKE_PX } from "@/lib/public/podium-reveal";

/**
 * DOSTRAJANIE CEREMONII.
 *
 * Snop swiatla ma otaczac herb, blask ma byc widoczny na realnym, ciemnym
 * telefonie, a cala scena ma delikatnie zareagowac na ladowanie medalisty.
 */

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const css = source("app/globals.css");
const podium = source("components/playoff/podium-section.tsx");

/** Wyciaga wartosc alfa z rgba() dla danej zmiennej w danym tonie. */
function alphaOf(tone: string, variable: string): number {
  const start = css.indexOf(`.podium-tone-${tone} {`);
  const block = css.slice(start, css.indexOf("}", start));
  const line = block.split("\n").find((row) => row.includes(variable))!;
  const match = line.match(/rgba\([^)]*,\s*([\d.]+)\)/)!;

  return Number(match[1]);
}

describe("T-X: snop swiatla", () => {
  it("T: snop jest wyraznie szerszy niz herb", () => {
    expect(podium).toContain('const beamWidth = isWinner ? "6.5rem" : "5rem"');

    const beam = css.slice(css.indexOf(".podium-beam {"));
    expect(beam).toContain("width: var(--beam-w");
    expect(beam).toContain("margin-left: calc(var(--beam-w, 4.5rem) / -2)");
  });

  it("T: krawedzie sa miekkie, a nie prostokatne", () => {
    const beam = css.slice(css.indexOf(".podium-beam {"));

    expect(beam).toContain("to right");
    expect(beam).toContain("mask-image");
    expect(beam).toContain("filter: blur(");
  });

  it("U/V/W: kazdy medal ma wlasny kolor snopu", () => {
    for (const tone of ["bronze", "silver", "gold"]) {
      const start = css.indexOf(`.podium-tone-${tone} {`);
      const block = css.slice(start, css.indexOf("}", start));

      expect(block).toContain("--beam-color");
      expect(block).toContain("--beam-core");
    }
  });

  it("X: snop wyprzedza uderzenie, a blask nastepuje po nim", () => {
    const delay = 2000;

    expect(beamAtMs(delay)).toBeLessThan(impactAtMs(delay));
    expect(glowAtMs(delay)).toBeGreaterThan(impactAtMs(delay));
  });
});

describe("Y-AF: blask medalu", () => {
  it("Y/Z/AA: kazdy z trzech blaskow istnieje", () => {
    for (const tone of ["bronze", "silver", "gold"]) {
      expect(alphaOf(tone, "--glow-rest")).toBeGreaterThan(0);
      expect(alphaOf(tone, "--glow-peak")).toBeGreaterThan(0);
    }
  });

  it("AB: hierarchia zloto > srebro > braz zostaje zachowana", () => {
    const rest = ["bronze", "silver", "gold"].map((tone) =>
      alphaOf(tone, "--glow-rest")
    );
    const peak = ["bronze", "silver", "gold"].map((tone) =>
      alphaOf(tone, "--glow-peak")
    );

    expect(rest[0]).toBeLessThan(rest[1]);
    expect(rest[1]).toBeLessThan(rest[2]);
    expect(peak[0]).toBeLessThan(peak[1]);
    expect(peak[1]).toBeLessThan(peak[2]);
  });

  it("E: koncowy blask jest mocniejszy niz przed dostrojeniem", () => {
    /*
      Wartosci sprzed tego etapu: braz .22, srebro .27, zloto .37.
      Po realnym sprawdzeniu na telefonie braz ginal najbardziej, wiec
      dostal najwiekszy zysk, a zloto najmniejszy — bylo juz dobre.
    */
    expect(alphaOf("bronze", "--glow-rest")).toBeGreaterThanOrEqual(0.29);
    expect(alphaOf("silver", "--glow-rest")).toBeGreaterThanOrEqual(0.31);
    expect(alphaOf("gold", "--glow-rest")).toBeGreaterThanOrEqual(0.4);

    expect(alphaOf("bronze", "--glow-peak")).toBeGreaterThanOrEqual(0.48);
    expect(alphaOf("silver", "--glow-peak")).toBeGreaterThanOrEqual(0.58);
    expect(alphaOf("gold", "--glow-peak")).toBeGreaterThanOrEqual(0.75);
  });

  it("E: widocznosc bierze sie z rozlewu, nie z jasnego punktu", () => {
    const spread = (tone: string) => {
      const start = css.indexOf(`.podium-tone-${tone} {`);
      const block = css.slice(start, css.indexOf("}", start));
      const line = block
        .split(String.fromCharCode(10))
        .find((row) => row.includes("--glow-rest-blur"))!;

      return Number(line.match(/([0-9.]+)rem/)![1]);
    };

    // Im slabszy medal, tym szerszy i miekszy rozlew.
    expect(spread("bronze")).toBeGreaterThan(spread("silver"));
    expect(spread("silver")).toBeGreaterThan(spread("gold"));
  });

  it("H: blask nie wchodzi do layoutu, wiec nie tworzy przewijania", () => {
    const start = css.indexOf("@keyframes podium-glow");
    const block = css.slice(start, start + 500);

    // Wylacznie box-shadow i opacity - zero szerokosci, marginesow i skali.
    expect(block).toContain("box-shadow");
    expect(block).not.toContain("width");
    expect(block).not.toContain("margin");
    expect(block).not.toContain("scale(");
  });

  it("AC/AD: blask startuje PO uderzeniu i narasta lagodnie", () => {
    expect(CEREMONY.glowDelayMs).toBeGreaterThanOrEqual(100);
    expect(CEREMONY.glowDelayMs).toBeLessThanOrEqual(180);

    expect(CEREMONY.glowFadeMs).toBeGreaterThanOrEqual(450);
    expect(CEREMONY.glowFadeMs).toBeLessThanOrEqual(700);

    expect(podium).toContain("animationDelay: `${glowAtMs(delayMs)}ms`");
  });

  it("AE: blask nie pulsuje", () => {
    const start = css.indexOf("@keyframes podium-glow");
    const block = css.slice(start, start + 400);

    expect(block).not.toContain("infinite");
    expect(block).not.toContain("alternate");
  });

  it("AF: obejrzana ceremonia pokazuje blaski od razu", () => {
    const reduced = css.slice(
      css.indexOf("prefers-reduced-motion", css.indexOf(".podium-glow {"))
    );

    expect(reduced).toContain("opacity: 1");
    expect(reduced).toContain("var(--glow-rest)");
  });
});

describe("AG-AL: reakcja calej sceny", () => {
  it("AG/AH/AI: sila rosnie od brazu do zlota", () => {
    expect(STAGE_SHAKE_PX[3]).toBeLessThan(STAGE_SHAKE_PX[2]);
    expect(STAGE_SHAKE_PX[2]).toBeLessThan(STAGE_SHAKE_PX[1]);

    for (const position of [1, 2, 3]) {
      // Scena reaguje SLABIEJ niz sam stopien - to ma byc drugi plan.
      expect(STAGE_SHAKE_PX[position]).toBeLessThan(PODIUM_SHAKE_PX[position]);
    }
  });

  it("AG: amplitudy mieszcza sie w zakresie premium", () => {
    expect(STAGE_SHAKE_PX[3]).toBeGreaterThanOrEqual(0.5);
    expect(STAGE_SHAKE_PX[1]).toBeLessThanOrEqual(2.5);

    expect(CEREMONY.stageShakeMs).toBeGreaterThanOrEqual(100);
    expect(CEREMONY.stageShakeMs).toBeLessThanOrEqual(180);
  });

  it("AJ: drga wylacznie wnetrze sceny", () => {
    expect(podium).toContain('data-testid="podium-stage-shake"');
    expect(podium).not.toContain("document.body");
    expect(podium).not.toContain("documentElement");
  });

  it("AJ: kazde ladowanie ma wlasna warstwe", () => {
    expect(podium).toContain("impacts.reduce");
    expect(podium).toContain("stage-impact");
  });

  it("AK: bez ruchu scena nie drga wcale", () => {
    const reduced = css.slice(
      css.indexOf("prefers-reduced-motion", css.indexOf(".stage-impact"))
    );

    expect(reduced).toContain("stage-impact");
    expect(reduced).toContain("animation: none");
  });

  it("AL: drgniecie nie tworzy poziomego przewijania", () => {
    const start = css.indexOf("@keyframes stage-impact");
    const block = css.slice(start, start + 600);

    expect(block).toContain("translate3d");
    expect(block).not.toContain("scale(");
    expect(block).not.toContain("rotate(");

    expect(podium).toContain("overflow-hidden");
  });
});

describe("A-I: wykonczenie medalu", () => {
  /** Ile warstw drop-shadow tworzy pierscien danego medalu. */
  function ringLayers(tone: string): number {
    const start = css.indexOf(`.medal-${tone} {`);
    const block = css.slice(start, css.indexOf("}", start));

    return block.split("drop-shadow(").length - 1;
  }

  /** Szerokosc najszerszej warstwy pierscienia w px. */
  function ringWidth(tone: string): number {
    const start = css.indexOf(`.medal-${tone} {`);
    const block = css.slice(start, css.indexOf("}", start));

    const widths = [...block.matchAll(/drop-shadow\(0 0 ([0-9.]+)px/g)].map(
      (match) => Number(match[1])
    );

    return Math.max(...widths);
  }

  it("A/B: zloto i srebro maja czytelny, wielowarstwowy pierscien", () => {
    expect(ringLayers("gold")).toBeGreaterThanOrEqual(4);
    expect(ringLayers("silver")).toBeGreaterThanOrEqual(4);
  });

  it("C: pierscien podaza za ksztaltem krazka, a nie za prostokatem", () => {
    // drop-shadow korzysta z alfy obrazka; box-shadow obrysowalby ramke.
    for (const tone of ["gold", "silver", "bronze"]) {
      const start = css.indexOf(`.medal-${tone} {`);
      const block = css.slice(start, css.indexOf("}", start));

      expect(block).toContain("drop-shadow(");
      expect(block).not.toContain("box-shadow");
      // Kontrast krawedzi zamiast rozjasniania calego krazka.
      expect(block).toContain("contrast(");
    }
  });

  it("D: hierarchia pierscieni zloto > srebro > braz", () => {
    expect(ringWidth("gold")).toBeGreaterThan(ringWidth("silver"));
    expect(ringWidth("silver")).toBeGreaterThan(ringWidth("bronze"));

    expect(ringLayers("gold")).toBeGreaterThanOrEqual(ringLayers("silver"));
    expect(ringLayers("silver")).toBeGreaterThan(ringLayers("bronze"));
  });

  it("D: blask podium nadal trzyma te sama kolejnosc", () => {
    const rest = ["bronze", "silver", "gold"].map((tone) =>
      alphaOf(tone, "--glow-rest")
    );

    expect(rest[0]).toBeLessThan(rest[1]);
    expect(rest[1]).toBeLessThan(rest[2]);
  });

  it("E: pierscien jest podany w pikselach, wiec dziala tez w malej skali", () => {
    // Medal na telefonie ma 2.75rem, na desktopie 3.5rem - staly pierscien
    // w px pozostaje czytelny w obu przypadkach.
    expect(ringWidth("gold")).toBeGreaterThanOrEqual(1.5);
    expect(ringWidth("silver")).toBeGreaterThanOrEqual(1.2);
  });

  it("F/H: wykonczenie to filtr, wiec nie rusza layoutu", () => {
    for (const tone of ["gold", "silver", "bronze"]) {
      const start = css.indexOf(`.medal-${tone} {`);
      const block = css.slice(start, css.indexOf("}", start));

      expect(block).not.toContain("width");
      expect(block).not.toContain("margin");
      expect(block).not.toContain("transform");
      // Zero animacji: wykonczenie jest statyczne.
      expect(block).not.toContain("animation");
    }
  });

  it("I: stan bez ruchu tez pokazuje pelne wykonczenie", () => {
    // Filtr nie jest animowany, wiec prefers-reduced-motion go nie dotyczy.
    const reduced = css.slice(css.indexOf("prefers-reduced-motion", css.indexOf(".podium-glow {")));

    expect(reduced).not.toContain("medal-gold");
    expect(reduced).not.toContain("medal-silver");
  });

  it("G: komponent przypisuje wykonczenie po zajetym miejscu", () => {
    expect(podium).toContain("const MEDAL_FINISH");
    expect(podium).toContain('1: "medal-gold"');
    expect(podium).toContain('2: "medal-silver"');
    expect(podium).toContain('3: "medal-bronze"');
  });
});

describe("timing mieszka w jednym miejscu", () => {
  it("konfiguracja zawiera komplet wartosci semantycznych", () => {
    for (const key of [
      "tailBaseMs",
      "tailIncrementMs",
      "tailCapMs",
      "prePodiumPauseMs",
      "bronzeDelayMs",
      "silverDelayMs",
      "winnerDelayMs",
      "dropDurationMs",
      "beamDurationMs",
      "glowDelayMs",
      "glowFadeMs",
    ]) {
      expect(CEREMONY).toHaveProperty(key);
    }
  });

  it("odstepy w ogonie narastaja az do limitu", () => {
    expect(tailGapMs(0)).toBe(CEREMONY.tailBaseMs);
    expect(tailGapMs(1)).toBeGreaterThan(tailGapMs(0));
    expect(tailGapMs(2)).toBeGreaterThan(tailGapMs(1));
    expect(tailGapMs(50)).toBe(CEREMONY.tailCapMs);
  });
});
