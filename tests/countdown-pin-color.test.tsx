import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { CampBanner } from "@/components/camp-banner";
import {
  DEFAULT_PIN_COLOR,
  describeCountdownPin,
  hexToRgb,
  hsvToRgb,
  normalizeColorToHex,
  relativeLuminance,
  rgbToHex,
  rgbToHsv,
} from "@/lib/public/color";

/**
 * KOLOR PINEZEK ODLICZANIA.
 *
 * Administrator podaje JEDEN kolor; podswietlenie, krawedz i cien sa z niego
 * wyliczane. Pinezka ma pozostac czytelna zarowno dla bardzo jasnych,
 * jak i bardzo ciemnych wyborow.
 */

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const banner = source("components/camp-banner.tsx");
const picker = source("components/admin/color-picker.tsx");
const css = source("app/globals.css");

describe("A-I: rozpoznawanie i normalizacja", () => {
  it("A/B/C: hex krotki, dlugi i pisany malymi literami", () => {
    expect(normalizeColorToHex("#fff")).toBe("#FFFFFF");
    expect(normalizeColorToHex("#FFFFFF")).toBe("#FFFFFF");
    expect(normalizeColorToHex("#ff3b30")).toBe("#FF3B30");
  });

  it("D/E: rgb() razem z nadmiarowymi spacjami", () => {
    expect(normalizeColorToHex("rgb(255, 59, 48)")).toBe("#FF3B30");
    expect(normalizeColorToHex("  rgb( 255 ,59,  48 )  ")).toBe("#FF3B30");
  });

  it("F/G/H: bledne wartosci sa odrzucane", () => {
    for (const bad of [
      "#GG0000",
      "#ff37",
      "rgb(999,0,0)",
      "rgb(1,2)",
      "hello",
      "javascript:alert(1)",
      "",
      "   ",
      "rgba(1,2,3,0.5)",
    ]) {
      expect(normalizeColorToHex(bad)).toBeNull();
    }
  });

  it("I: postac kanoniczna to zawsze #RRGGBB", () => {
    expect(normalizeColorToHex("#abc")).toMatch(/^#[0-9A-F]{6}$/);
    expect(rgbToHex({ r: 0, g: 0, b: 0 })).toBe("#000000");
  });

  it("konwersje HSV sa odwracalne", () => {
    for (const hex of ["#FF3B30", "#C59634", "#23395D", "#38BDF8", "#111827"]) {
      const rgb = hexToRgb(hex)!;
      const back = hsvToRgb(rgbToHsv(rgb));

      expect(rgbToHex(back)).toBe(hex);
    }
  });
});

describe("X/AA: warianty pinezki", () => {
  it("X: z jednego koloru powstaja baza, swiatlo, krawedz i cien", () => {
    const palette = describeCountdownPin("#FF3B30");

    expect(palette.base).toBe("#FF3B30");
    expect(palette.highlight).not.toBe(palette.base);
    expect(palette.border).not.toBe(palette.base);
    expect(palette.shadow).not.toBe(palette.base);
  });

  it("AA: jasny kolor zachowuje widoczna krawedz", () => {
    const light = describeCountdownPin("#F1F5F9");

    const base = relativeLuminance(hexToRgb(light.base)!);
    const border = relativeLuminance(hexToRgb(light.border)!);

    expect(base - border).toBeGreaterThan(0.25);
  });

  it("AA: ciemny kolor zachowuje widoczne swiatlo", () => {
    const dark = describeCountdownPin("#111827");

    const base = relativeLuminance(hexToRgb(dark.base)!);
    const highlight = relativeLuminance(hexToRgb(dark.highlight)!);

    expect(highlight - base).toBeGreaterThan(0.25);
  });

  it("AA: kazdy z przykladowych kolorow daje sensowna palete", () => {
    for (const hex of [
      "#FF3B30",
      "#C59634",
      "#23395D",
      "#7C3AED",
      "#38BDF8",
      "#111827",
      "#F1F5F9",
    ]) {
      const palette = describeCountdownPin(hex);

      const base = relativeLuminance(hexToRgb(palette.base)!);
      const highlight = relativeLuminance(hexToRgb(palette.highlight)!);
      const border = relativeLuminance(hexToRgb(palette.border)!);

      expect(highlight).toBeGreaterThan(base);
      expect(border).toBeLessThan(base);
    }
  });

  it("K: brak koloru = dokladnie dotychczasowy czerwony", () => {
    expect(DEFAULT_PIN_COLOR).toBe("#EF4444");
    expect(describeCountdownPin(null).base).toBe("#EF4444");
    expect(describeCountdownPin("").base).toBe("#EF4444");
    expect(describeCountdownPin("nonsens").base).toBe("#EF4444");
  });
});

describe("S-U/Y/Z: render publiczny", () => {
  const html = renderToStaticMarkup(
    <CampBanner date="2027-01-01T10:00" countdownPinColor="#C59634" />
  );

  it("S/T: wszystkie pinezki korzystaja z tych samych zmiennych", () => {
    expect(html).toContain("--pin-base:#C59634");
    expect(html).toContain("--pin-highlight");
    expect(html).toContain("--pin-border");

    const pins = html.split('data-testid="countdown-pin"').length - 1;
    expect(pins).toBeGreaterThanOrEqual(8);

    // Zmienne ustawiane RAZ na sekcji, nie przy kazdej pinezce.
    expect(html.split("--pin-base").length - 1).toBe(1);
  });

  it("U: w kodzie nie zostal zaden zaszyty czerwony", () => {
    expect(banner).not.toContain("bg-red-500");
    expect(banner).not.toContain("border-red-700");
    expect(source("lib/public/color.ts")).toContain(
      'DEFAULT_PIN_COLOR = "#EF4444"'
    );
  });

  it("X: styl pinezki niesie swiatlo, obrys i cien", () => {
    const start = css.indexOf(".countdown-pin {");
    const block = css.slice(start, css.indexOf("}", start));

    expect(block).toContain("radial-gradient");
    expect(block).toContain("var(--pin-highlight");
    expect(block).toContain("var(--pin-border");
    expect(block).toContain("var(--pin-shadow-soft");
    expect(block).toContain("inset");
  });

  it("Y: pinezka jest statyczna", () => {
    const start = css.indexOf(".countdown-pin {");
    const block = css.slice(start, css.indexOf("}", start));

    expect(block).not.toContain("animation");
    expect(block).not.toContain("transition");
  });

  it("Z: geometria kart odliczania bez zmian", () => {
    expect(banner).toContain("absolute left-2 top-2 z-20 h-3 w-3 rounded-full");
    expect(banner).toContain("absolute right-2 top-2 z-20 h-3 w-3 rounded-full");
    expect(banner).toContain("w-[72px] sm:w-[82px] lg:w-[88px] xl:w-[94px]");
  });

  it("licznik nie rozjezdza sie miedzy serwerem a hydracja", () => {
    /*
      Render serwerowy i hydracja dziela ulamek sekundy, wiec liczba sekund
      potrafi sie roznic. Cyfry maja jawnie oznaczona te rozbieznosc,
      a klient poprawia wartosc natychmiast po zamontowaniu.
    */
    expect(banner).toContain("suppressHydrationWarning");
    expect(banner).toContain("LICZNIK A HYDRACJA");
  });

  it("kazdy Image z fill ma podane sizes", () => {
    // Kazdy <Image fill> w tym pliku musi deklarowac sizes.
    const fills = (banner.match(/^\s*fill$/gm) ?? []).length;
    const sizes = (banner.match(/^\s*sizes=/gm) ?? []).length;

    expect(fills).toBeGreaterThan(0);
    expect(sizes).toBe(fills);
  });

  it("V/W: zachowanie campu bez zmian", () => {
    const closed = renderToStaticMarkup(
      <CampBanner
        date="2027-01-01T10:00"
        campTitle="Zapisy od 31.08"
        registrationEnabled={false}
        signupLink="https://example.com"
      />
    );

    expect(closed).toContain("Zapisy od 31.08");
    expect(closed).toContain('data-enabled="false"');
    expect(closed).not.toContain('href="https://example.com"');
  });
});

describe("N-R: picker w panelu", () => {
  it("N/O: kwadrat i pole tekstowe sa zsynchronizowane", () => {
    expect(picker).toContain("setText(hex);");
    expect(picker).toContain("setHsv(rgbToHsv(parseCssColor(hex)!));");
  });

  it("P: pisanie nie resetuje pola do starej wartosci", () => {
    expect(picker).toContain("setText(next);");
    expect(picker).toContain("if (!hex) return;");
  });

  it("Q: przywrocenie domyslnego ustawia pierwotny czerwony", () => {
    expect(picker).toContain('data-testid="pin-color-reset"');
    expect(picker).toContain("handleText(DEFAULT_PIN_COLOR)");
  });

  it("R: podglad korzysta z niezapisanego koloru z draftu", () => {
    /*
      Podglad NALEZY DO KONTEKSTU: picker dostaje go w propsie, a kartke
      odliczania rysuje komponent ustawien campu. Patrz color-previews.tsx.
    */
    expect(picker).toContain("renderPreview?:");
    expect(picker).toContain("renderPreview(effective)");

    const previews = source("components/admin/color-previews.tsx");
    expect(previews).toContain('data-testid="pin-color-preview"');
    expect(previews).toContain("countdown-pin");
  });

  it("picker dziala myszka i dotykiem przez jedno API", () => {
    expect(picker).toContain("onPointerDown");
    expect(picker).toContain("setPointerCapture");
    expect(picker).toContain("touch-none");

    expect(picker).not.toContain("onMouseDown");
    expect(picker).not.toContain("react-colorful");
  });

  it("kolor da sie ustawic bez myszy", () => {
    expect(picker).toContain('htmlFor="pin-color-text"');
    expect(picker).toContain("Odcień koloru pinezek");
    expect(picker).toContain('type="range"');
  });

  it("J/M: kolor zapisuje sie tym samym flow co reszta ustawien campu", () => {
    const repository = source("lib/data/postgres/repository.ts");

    // Kanoniczny zapis + ten sam bump publicznej rewizji.
    expect(repository).toContain("normalizeColorToHex(tournament.countdownPinColor)");
    expect(repository).toContain("bumpPublicRevisionStatement");
  });
});
