"use client";

import { useEffect, useId, useRef, useState } from "react";

type CellPopoverProps = {
  /** Treść widoczna w komórce — skrót albo ucięta nazwa. */
  children: React.ReactNode;
  /** Pełna treść pokazywana po kliknięciu / najechaniu. */
  content: React.ReactNode;
  /** Etykieta dla czytnika ekranu; zwykle pełna treść jako tekst. */
  label: string;
  className?: string;
  testId?: string;
};

/**
 * KOMÓRKA Z ROZWIJANYM WYJAŚNIENIEM.
 *
 * Wspólny prymityw dla skrótów kolumn i uciętych nazw drużyn — jedno
 * zachowanie w całej tabeli, zamiast dwóch podobnych implementacji.
 *
 * DOSTĘPNOŚĆ:
 * - to prawdziwy <button>, więc działa z klawiatury,
 * - focus otwiera tak samo jak najechanie myszą — treść NIGDY nie jest
 *   dostępna wyłącznie przez hover,
 * - pełna treść siedzi też w aria-label, więc czytnik ekranu zna ją bez
 *   otwierania czegokolwiek,
 * - Escape i klik poza zamykają.
 *
 * Hover otwiera WYŁĄCZNIE dla myszy: na dotyku zdarzenie wskaźnika
 * poprzedza kliknięcie i okienko zamykałoby się natychmiast po otwarciu.
 */
export function CellPopover({
  children,
  content,
  label,
  className,
  testId,
}: CellPopoverProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement | null>(null);
  const popoverId = useId();

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

  return (
    <span ref={wrapperRef} className="relative inline-flex min-w-0 max-w-full">
      <button
        type="button"
        data-testid={testId}
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? popoverId : undefined}
        className={className}
        onClick={() => setOpen((value) => !value)}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") setOpen(true);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") setOpen(false);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {children}
      </button>

      {open ? (
        <span role="tooltip" id={popoverId} className="column-help-popover">
          {content}
        </span>
      ) : null}
    </span>
  );
}
