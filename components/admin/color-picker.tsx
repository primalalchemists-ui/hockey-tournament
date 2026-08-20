"use client";

import { useRef, useState } from "react";

import {
  DEFAULT_PIN_COLOR,
  hsvToRgb,
  normalizeColorToHex,
  parseCssColor,
  PIN_COLOR_ERROR,
  rgbToHex,
  rgbToHsv,
  type Hsv,
} from "@/lib/public/color";

/**
 * WYBOR KOLORU PINEZEK.
 *
 * Swiadomie bez biblioteki: kwadrat nasycenia/jasnosci i suwak odcienia
 * to kilkadziesiat linii, a gotowy picker kosztowalby dziesiatki kilobajtow
 * w bundlu strony, na ktorej jest jedno pole koloru.
 *
 * DOSTEPNOSC: pole tekstowe jest pelnoprawna, rownolegla droga do ustawienia
 * dowolnego koloru bez myszy - kwadrat nigdy nie jest jedynym sposobem.
 * Suwak odcienia to natywny `input[type=range]`, wiec dziala z klawiatura.
 */

type ColorPickerProps = {
  /** Kanoniczny kolor z draftu; puste = domyslny czerwony. */
  value: string;
  onChange: (hex: string) => void;
  /**
   * Podglad NALEZY DO KONTEKSTU, nie do pickera.
   *
   * Kolor pinezek pokazuje kartke odliczania, kolor kategorii — publiczny
   * babelek. Wspolna jest wylacznie matematyka i sama kontrolka.
   */
  renderPreview?: (hex: string) => React.ReactNode;
};

export function ColorPicker({
  value,
  onChange,
  renderPreview,
}: ColorPickerProps) {
  const effective = normalizeColorToHex(value) ?? DEFAULT_PIN_COLOR;

  const [hsv, setHsv] = useState<Hsv>(() =>
    rgbToHsv(parseCssColor(effective)!)
  );
  const [text, setText] = useState(effective);
  const areaRef = useRef<HTMLDivElement | null>(null);

  /*
    Synchronizacja W DRUGA STRONE: gdy kolor przyjdzie z zewnatrz (np.
    „Przywroc domyslny"), picker przesuwa sie na wlasciwa pozycje.
    Porownujemy po kolorze, nie po referencji, zeby nie deptac wlasnego
    przeciagania.
  */
  const [seen, setSeen] = useState(effective);

  if (effective !== seen) {
    setSeen(effective);
    setHsv(rgbToHsv(parseCssColor(effective)!));
    setText(effective);
  }

  function commit(next: Hsv) {
    setHsv(next);

    const hex = rgbToHex(hsvToRgb(next));
    setText(hex);
    setSeen(hex);
    onChange(hex);
  }

  function updateFromPointer(event: React.PointerEvent<HTMLDivElement>) {
    const node = areaRef.current;
    if (!node) return;

    const rect = node.getBoundingClientRect();
    const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
    const y = Math.min(Math.max(event.clientY - rect.top, 0), rect.height);

    commit({
      h: hsv.h,
      s: rect.width === 0 ? 0 : x / rect.width,
      v: rect.height === 0 ? 0 : 1 - y / rect.height,
    });
  }

  /*
    Jedno API dla myszy i dotyku: `setPointerCapture` sprawia, ze
    przeciaganie dziala rowniez poza kwadratem, bez osobnych obslug.
  */
  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    updateFromPointer(event);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (event.buttons === 0) return;
    updateFromPointer(event);
  }

  function handleText(next: string) {
    // Podczas pisania NIE nadpisujemy pola - "#FF3B30" powstaje po znaku.
    setText(next);

    const hex = normalizeColorToHex(next);
    if (!hex) return;

    setSeen(hex);
    setHsv(rgbToHsv(parseCssColor(hex)!));
    onChange(hex);
  }

  const isInvalid = text.trim().length > 0 && !normalizeColorToHex(text);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="w-full max-w-[16rem] space-y-2">
          {/* KWADRAT: poziomo nasycenie, pionowo jasnosc. */}
          <div
            ref={areaRef}
            data-testid="pin-color-area"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            className="relative h-36 w-full cursor-crosshair touch-none rounded-2xl border border-slate-300"
            style={{
              background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))`,
            }}
          >
            <span
              aria-hidden="true"
              data-testid="pin-color-handle"
              className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(15,23,42,0.6)]"
              style={{
                left: `${hsv.s * 100}%`,
                top: `${(1 - hsv.v) * 100}%`,
                background: effective,
              }}
            />
          </div>

          <input
            type="range"
            min={0}
            max={359}
            value={Math.round(hsv.h)}
            aria-label="Odcień koloru pinezek"
            data-testid="pin-color-hue"
            onChange={(event) =>
              commit({ ...hsv, h: Number(event.target.value) })
            }
            className="h-3 w-full cursor-pointer appearance-none rounded-full"
            style={{
              background:
                "linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)",
            }}
          />
        </div>

        <div className="flex-1 space-y-2">
          <label
            htmlFor="pin-color-text"
            className="text-sm font-semibold text-slate-700"
          >
            Kolor
          </label>

          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              data-testid="pin-color-swatch"
              className="h-8 w-8 shrink-0 rounded-full border border-slate-300"
              style={{ background: effective }}
            />

            <input
              id="pin-color-text"
              type="text"
              value={text}
              onChange={(event) => handleText(event.target.value)}
              placeholder="#FF3B30 lub rgb(255, 59, 48)"
              aria-invalid={isInvalid ? "true" : undefined}
              data-testid="pin-color-text"
              className={[
                "w-full rounded-2xl border px-4 py-3 text-sm outline-none",
                isInvalid
                  ? "border-rose-300 focus:border-rose-500"
                  : "border-slate-300 focus:border-slate-900",
              ].join(" ")}
            />
          </div>

          {isInvalid ? (
            <p
              data-testid="pin-color-error"
              className="text-xs font-medium text-rose-700"
            >
              {PIN_COLOR_ERROR}
            </p>
          ) : null}

          <button
            type="button"
            data-testid="pin-color-reset"
            onClick={() => handleText(DEFAULT_PIN_COLOR)}
            className="btn btn-quiet h-9 text-xs"
          >
            Przywróć domyślny
          </button>
        </div>
      </div>

      {renderPreview ? (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-700">Podgląd</p>
          {renderPreview(effective)}
        </div>
      ) : null}
    </div>
  );
}
