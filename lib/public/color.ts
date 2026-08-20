/**
 * KOLOR PINEZEK ODLICZANIA — czysta matematyka, zero Reacta i zero DOM.
 *
 * Administrator podaje JEDEN kolor bazowy. Wszystkie warianty pinezki
 * (podświetlenie, krawędź, cień) są z niego WYLICZANE — w bazie nie
 * trzymamy pięciu kolorów, tylko jeden.
 */

/** Dokładnie ten czerwony, który pinezki miały do tej pory (Tailwind red-500). */
export const DEFAULT_PIN_COLOR = "#EF4444";

export type Rgb = { r: number; g: number; b: number };
export type Hsv = { h: number; s: number; v: number };

const HEX_SHORT = /^#([0-9a-f]{3})$/i;
const HEX_LONG = /^#([0-9a-f]{6})$/i;
const RGB = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i;

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const hex = [r, g, b]
    .map((channel) => clampChannel(channel).toString(16).padStart(2, "0"))
    .join("");

  return `#${hex.toUpperCase()}`;
}

export function hexToRgb(hex: string): Rgb | null {
  const value = hex.trim();

  const short = HEX_SHORT.exec(value);
  if (short) {
    const [r, g, b] = short[1].split("");
    return {
      r: parseInt(r + r, 16),
      g: parseInt(g + g, 16),
      b: parseInt(b + b, 16),
    };
  }

  const long = HEX_LONG.exec(value);
  if (!long) return null;

  return {
    r: parseInt(long[1].slice(0, 2), 16),
    g: parseInt(long[1].slice(2, 4), 16),
    b: parseInt(long[1].slice(4, 6), 16),
  };
}

/**
 * Rozpoznaje `#RGB`, `#RRGGBB` oraz `rgb(r, g, b)`.
 *
 * Świadomie NIE obsługuje rgba, hsl ani nazw CSS: kolor pinezki ma być
 * jednoznaczny i w pełni nieprzezroczysty.
 */
export function parseCssColor(input: string | null | undefined): Rgb | null {
  const value = input?.trim();
  if (!value) return null;

  const fromHex = hexToRgb(value);
  if (fromHex) return fromHex;

  const match = RGB.exec(value.replace(/\s+/g, " "));
  if (!match) return null;

  const channels = [match[1], match[2], match[3]].map(Number);

  // Kanał poza zakresem to błąd, a nie wartość do przycięcia.
  if (channels.some((channel) => channel > 255)) return null;

  const [r, g, b] = channels;
  return { r, g, b };
}

/** Jedna, kanoniczna postać zapisywana w bazie: `#RRGGBB`. */
export function normalizeColorToHex(input: string | null | undefined): string | null {
  const rgb = parseCssColor(input);

  return rgb ? rgbToHex(rgb) : null;
}

/* ==========================================================================
 * KONWERSJE DLA PICKERA
 * ======================================================================== */

export function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;

  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;

  let h = 0;

  if (delta !== 0) {
    if (max === red) h = ((green - blue) / delta) % 6;
    else if (max === green) h = (blue - red) / delta + 2;
    else h = (red - green) / delta + 4;

    h *= 60;
    if (h < 0) h += 360;
  }

  return {
    h,
    s: max === 0 ? 0 : delta / max,
    v: max,
  };
}

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const hue = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = v - c;

  const [r, g, b] =
    hue < 60
      ? [c, x, 0]
      : hue < 120
        ? [x, c, 0]
        : hue < 180
          ? [0, c, x]
          : hue < 240
            ? [0, x, c]
            : hue < 300
              ? [x, 0, c]
              : [c, 0, x];

  return {
    r: clampChannel((r + m) * 255),
    g: clampChannel((g + m) * 255),
    b: clampChannel((b + m) * 255),
  };
}

/* ==========================================================================
 * WARIANTY PINEZKI
 * ======================================================================== */

/** Liniowe mieszanie w sRGB — wystarczające i przewidywalne. */
function mix(color: Rgb, target: Rgb, amount: number): Rgb {
  return {
    r: color.r + (target.r - color.r) * amount,
    g: color.g + (target.g - color.g) * amount,
    b: color.b + (target.b - color.b) * amount,
  };
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const BLACK: Rgb = { r: 0, g: 0, b: 0 };

/** Jasność postrzegana — decyduje o sile podświetlenia i krawędzi. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export type PinPalette = {
  base: string;
  highlight: string;
  border: string;
  shadow: string;
};

/**
 * Cztery warianty z JEDNEGO koloru.
 *
 * Siła domieszki zależy od jasności bazy — inaczej pinezka w kolorze
 * niemal białym gubiłaby krawędź, a niemal czarna traciłaby połysk.
 * Wybrałem policzenie tego tutaj zamiast `color-mix()` w CSS: wynik jest
 * deterministyczny, testowalny i nie zależy od wsparcia przeglądarki.
 */
export function describeCountdownPin(input: string | null | undefined): PinPalette {
  const rgb = parseCssColor(input) ?? hexToRgb(DEFAULT_PIN_COLOR)!;
  const luminance = relativeLuminance(rgb);

  // Ciemna baza potrzebuje mocniejszego światła...
  const highlightAmount = luminance < 0.22 ? 0.62 : luminance > 0.8 ? 0.3 : 0.42;
  // ...a jasna – wyraźniejszego obrysu.
  const borderAmount = luminance > 0.78 ? 0.45 : luminance < 0.15 ? 0.35 : 0.3;

  return {
    base: rgbToHex(rgb),
    highlight: rgbToHex(mix(rgb, WHITE, highlightAmount)),
    border: rgbToHex(mix(rgb, BLACK, borderAmount)),
    shadow: rgbToHex(mix(rgb, BLACK, 0.62)),
  };
}

/** Komunikat walidacji dla panelu — po polsku, bez żargonu. */
export const PIN_COLOR_ERROR = "Podaj poprawny kolor HEX lub RGB.";
