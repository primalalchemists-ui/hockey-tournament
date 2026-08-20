import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { BrandLoader } from "@/components/brand-loader";

/**
 * STAN LADOWANIA PUBLICZNEJ APLIKACJI.
 *
 * Do tej pory istnialy DWA jezyki: dopracowane intro z logo oraz szary
 * skeleton z trzema kropkami i napisem "Ladowanie turnieju...". Ten drugi
 * pokazywal sie przy powrocie ze strony archiwalnej na strone glowna.
 * Zostal jeden.
 */

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const rootLoading = source("app/loading.tsx");
const historyLoading = source("app/turnieje/[slug]/loading.tsx");
const brand = source("components/brand-loader.tsx");
const intro = source("components/logo-intro.tsx");

describe("A/E/F: koniec starego skeletonu", () => {
  it("A: napis Ladowanie turnieju... zniknal z calego repozytorium", () => {
    for (const file of [
      "app/loading.tsx",
      "app/turnieje/[slug]/loading.tsx",
      "components/logo-intro.tsx",
      "components/brand-loader.tsx",
      "components/tournament-shell.tsx",
      "app/page.tsx",
    ]) {
      const code = source(file);

      expect(code).not.toContain("Ładowanie turnieju");
      expect(code).not.toContain("Loading tournament");
    }
  });

  it("A: znikly rowniez szare paski skeletonu i skaczace kropki", () => {
    expect(rootLoading).not.toContain("animate-pulse");
    expect(rootLoading).not.toContain("bg-slate-200");
    expect(rootLoading).not.toContain("repeat: Infinity");
  });

  it("F: obie granice ladowania korzystaja z JEDNEGO komponentu", () => {
    expect(rootLoading).toContain("BrandLoader");
    expect(historyLoading).toContain("BrandLoader");
    // Intro tez - zeby nie istnialy dwie kopie tego samego wizualu.
    expect(intro).toContain("BrandLoader");
  });

  it("E: nie ma sekwencji dwoch roznych loaderow", () => {
    // Kazdy plik ladowania renderuje dokladnie jeden wizual.
    expect(rootLoading.split("BrandLoader").length - 1).toBe(2);
    expect(historyLoading.split("BrandLoader").length - 1).toBe(2);
  });
});

describe("B/C/G: wspolny loader z logo", () => {
  const html = renderToStaticMarkup(<BrandLoader />);

  it("B: trasa publiczna ma granice ladowania z logo", () => {
    expect(existsSync(new URL("../app/loading.tsx", import.meta.url))).toBe(
      true
    );
    expect(html).toContain("/icons/festiwal-logo.png");
  });

  it("C: strona historii ma tę samą granicę", () => {
    expect(
      existsSync(new URL("../app/turnieje/[slug]/loading.tsx", import.meta.url))
    ).toBe(true);
  });

  it("G: tlo i uklad sa stabilne, bez bialego blysku", () => {
    // Token lodu zamiast bieli i zero wplywu na przewijanie dokumentu.
    expect(html).toContain("bg-[var(--ice-base)]");
    expect(html).toContain("fixed inset-0");
    expect(html).toContain("pointer-events-none");
    expect(brand).not.toMatch(/document\.(body|documentElement)/);
    expect(brand).not.toContain("overflow");
  });

  it("puls jest jedna, wspolna definicja w arkuszu", () => {
    const css = source("app/globals.css");

    expect(css).toContain("@keyframes intro-pulse");
    // Komponent nie wozi juz wlasnego <style> z keyframe'ami.
    expect(brand).not.toContain("@keyframes");
    expect(intro).not.toContain("@keyframes");
  });

  it("granica ladowania pulsuje do konca, intro odlicza trzy cykle", () => {
    expect(rootLoading).not.toContain("cycles=");
    expect(intro).toContain("cycles={PULSE_CYCLES}");
  });

  it("bez ruchu logo nie pulsuje", () => {
    const css = source("app/globals.css");

    expect(css).toContain('[data-testid="brand-loader"] img');
    expect(css).toContain("animation: none !important");
  });
});
