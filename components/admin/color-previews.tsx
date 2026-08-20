"use client";

import { describeCountdownPin } from "@/lib/public/color";
import { pickReadableTextColor } from "@/lib/public/tournament-collection";

/**
 * PODGLĄDY KOLORU — każdy w swoim kontekście.
 *
 * Picker jest wspólny (ta sama matematyka, ten sam kwadrat i suwak), ale
 * podgląd musi pokazywać dokładnie to, co administrator zobaczy publicznie.
 * Wcześniej ustawianie koloru kategorii pokazywało kartkę odliczania
 * z pinezkami — element kompletnie niezwiązany z przełącznikiem.
 */

/** Karta odliczania z pinezkami — dla ustawień campu. */
export function CountdownPinPreview({ color }: { color: string }) {
  const pin = describeCountdownPin(color);

  return (
    <div
      data-testid="pin-color-preview"
      className="relative w-[88px]"
      style={
        {
          ["--pin-base"]: pin.base,
          ["--pin-highlight"]: pin.highlight,
          ["--pin-border"]: pin.border,
          ["--pin-shadow-soft"]: `${pin.shadow}59`,
        } as React.CSSProperties
      }
    >
      <span className="countdown-pin absolute left-2 top-2 z-20 h-3 w-3 rounded-full" />
      <span className="countdown-pin absolute right-2 top-2 z-20 h-3 w-3 rounded-full" />

      <div className="rounded-[22px] border border-slate-200 bg-[#fffdf8] px-2 pb-3 pt-5 text-center shadow-[0_14px_34px_-18px_rgba(15,23,42,0.35)]">
        <div className="text-[2rem] font-black leading-none text-slate-950">
          18
        </div>
        <span className="mt-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
          dni
        </span>
      </div>
    </div>
  );
}

/**
 * Publiczny bąbelek kategorii — dokładnie ten sam wygląd co na stronie:
 * kolor tła z ustawień, kolor tekstu dobierany automatycznie.
 */
export function CategoryBubblePreview({
  label,
  color,
}: {
  label: string;
  color: string;
}) {
  const tone = pickReadableTextColor(color);

  return (
    <span
      data-testid="category-preview"
      data-tone={tone}
      className={[
        "category-bubble inline-flex min-w-[3.5rem] items-center justify-center rounded-full px-3.5 py-2 text-sm font-bold",
        tone === "dark" ? "text-slate-900" : "text-white",
      ].join(" ")}
      style={{ background: color }}
    >
      {label.trim() || "?"}
    </span>
  );
}
