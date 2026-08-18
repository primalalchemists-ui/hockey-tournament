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
  /**
   * "center" (domyślnie) wyśrodkowuje dymek pod wyzwalaczem.
   * "start" rozwija go wyłącznie w prawo — potrzebne tam, gdzie po lewej
   * stronie leży warstwa, która przykryłaby wyśrodkowany dymek.
   */
  placement?: "center" | "start";
  /**
   * "above" (domyślnie) — dla wierszy tabeli, gdzie pod spodem kończy się
   * karta. "below" — dla nagłówków, nad którymi nie ma już miejsca.
   */
  align?: "above" | "below";
  /**
   * Pokazuj wyjaśnienie WYŁĄCZNIE wtedy, gdy treść faktycznie się nie
   * mieści. Pełna, widoczna nazwa nie potrzebuje dymka — na desktopie
   * hover nad kompletnym tekstem był tylko szumem.
   */
  onlyWhenTruncated?: boolean;
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
  placement = "center",
  align = "above",
  onlyWhenTruncated = false,
}: CellPopoverProps) {
  const [open, setOpen] = useState(false);
  const [isTruncated, setIsTruncated] = useState(!onlyWhenTruncated);
  const wrapperRef = useRef<HTMLSpanElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverId = useId();

  /*
    Pomiar zamiast zgadywania po breakpoincie: ta sama nazwa mieści się
    na desktopie, a na telefonie już nie. Obserwujemy zmianę rozmiaru,
    więc obrót ekranu też jest obsłużony.
  */
  useEffect(() => {
    if (!onlyWhenTruncated) return;

    const node = triggerRef.current;
    if (!node) return;

    function measure() {
      const element = triggerRef.current;
      if (!element) return;

      /*
        Ucinać może sam przycisk (Ranking) albo element w środku
        (tabela wyników: herb + ucięta nazwa). Marker `data-truncate`
        wskazuje, co naprawdę mierzyć.
      */
      const target =
        element.querySelector<HTMLElement>("[data-truncate]") ?? element;

      setIsTruncated(target.scrollWidth > target.clientWidth + 1);
    }

    measure();

    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);

    observer?.observe(node);

    return () => observer?.disconnect();
  }, [onlyWhenTruncated, children]);

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
        ref={triggerRef}
        type="button"
        data-testid={testId}
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? popoverId : undefined}
        className={className}
        onClick={() => isTruncated && setOpen((value) => !value)}
        onPointerEnter={(event) => {
          if (isTruncated && event.pointerType === "mouse") setOpen(true);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") setOpen(false);
        }}
        onFocus={() => isTruncated && setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {children}
      </button>

      {open && isTruncated ? (
        <span
          role="tooltip"
          id={popoverId}
          data-align={align}
          data-placement={placement}
          className="column-help-popover"
          /*
            Pozycja jest stylem inline, nie klasą: kierunek dymka nie może
            zależeć od kolejności reguł w arkuszu ani od tego, czy bundler
            zdążył przebudować CSS.
          */
          style={{
            ...(align === "below"
              ? { top: "calc(100% + 0.375rem)", bottom: "auto" }
              : { bottom: "calc(100% + 0.375rem)", top: "auto" }),
            ...(placement === "start"
              ? { left: 0, transform: "none" }
              : { left: "50%", transform: "translateX(-50%)" }),
          }}
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}
