"use client";

import { useEffect, useId, useRef, useState } from "react";

import { COLUMN_HELP, type ColumnCode } from "@/lib/public/column-help";

type ColumnHelpProps = {
  code: ColumnCode;
};

/**
 * Nagłówek kolumny z objaśnieniem skrótu.
 *
 * DOSTĘPNOŚĆ:
 * - to prawdziwy <button>, więc działa z klawiatury (Tab + Enter/Spacja),
 * - focus otwiera podpowiedź tak samo jak najechanie myszą — informacja
 *   NIGDY nie jest dostępna wyłącznie przez hover,
 * - opis jest też w aria-label, więc czytnik ekranu poznaje znaczenie
 *   skrótu bez otwierania czegokolwiek,
 * - Escape i klik poza zamykają.
 *
 * Bez żadnej biblioteki — to kilkadziesiąt linii, nie zależność.
 */
export function ColumnHelp({ code }: ColumnHelpProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement | null>(null);
  const tooltipId = useId();

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      const node = wrapperRef.current;
      if (node && !node.contains(event.target as Node)) setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const description = COLUMN_HELP[code];

  return (
    <span ref={wrapperRef} className="relative inline-flex justify-center">
      <button
        type="button"
        data-testid="column-help"
        aria-label={`${code} — ${description}`}
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        className="column-help-trigger"
        onClick={() => setOpen((value) => !value)}
        // Hover TYLKO dla myszy — na dotyku otwiera dopiero tap,
        // inaczej tapnięcie otwierałoby i natychmiast zamykało.
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") setOpen(true);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") setOpen(false);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {code}
      </button>

      {open ? (
        <span role="tooltip" id={tooltipId} className="column-help-popover">
          <span className="column-help-code">{code}</span>
          {description}
        </span>
      ) : null}
    </span>
  );
}
