"use client";

import { useEffect, useId, useRef } from "react";

import { ModalPortal } from "@/components/ui/modal-portal";

/**
 * OKNO POTWIERDZENIA — jedno dla całego panelu.
 *
 * Zastępuje natywne `window.confirm`, które wyglądało jak alert systemowy,
 * nie dawało się opisać ani ostylować i pokazywało techniczny tekst
 * w oknie przeglądarki zamiast w produkcie.
 *
 * DOSTĘPNOŚĆ:
 * - `role="dialog"` + `aria-modal` + powiązany tytuł,
 * - focus ląduje na akcji bezpiecznej (Anuluj), więc samo wciśnięcie
 *   Enter nigdy nie wykona operacji nieodwracalnej,
 * - Tab krąży wewnątrz okna,
 * - Escape zamyka bez wykonania akcji,
 * - po zamknięciu focus wraca na przycisk, który okno otworzył.
 */

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  /** Opis konsekwencji — pełne zdania, bez języka technicznego. */
  children: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** "danger" dla operacji kasujących wyniki. */
  tone?: "default" | "danger";
  /** Etykieta na czas trwania operacji; przycisk zachowuje wymiary. */
  busyLabel?: string;
  isBusy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

const FOCUSABLE =
  'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = "Anuluj",
  tone = "default",
  busyLabel,
  isBusy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    restoreRef.current = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();

    /*
      BLOKADA PRZEWIJANIA BEZ SKOKU.

      Samo `overflow: hidden` na <body> zabiera pasek przewijania i cała
      strona przeskakuje w bok o jego szerokość. Rekompensujemy tę
      szerokość paddingiem, więc tło pod rozmyciem stoi nieruchomo.
    */
    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousPadding = body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;

    body.style.overflow = "hidden";
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }

      if (event.key !== "Tab") return;

      const nodes = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!nodes || nodes.length === 0) return;

      const first = nodes[0];
      const last = nodes[nodes.length - 1];

      // Pętla focusu: Tab nie ma prawa wyjść poza okno.
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPadding;
      restoreRef.current?.focus();
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <ModalPortal>
      <div
        data-testid="confirm-backdrop"
        // Tło pozostaje widoczne, ale przygaszone i rozmyte — panel nie
        // znika, tylko schodzi na drugi plan.
        className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/55 p-4 backdrop-blur-sm sm:items-center"
        onClick={(event) => {
          if (event.target === event.currentTarget && !isBusy) onCancel();
        }}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          data-testid="confirm-dialog"
          className="ice-surface w-full max-w-md rounded-3xl p-5 shadow-2xl sm:p-6"
        >
          <h2 id={titleId} className="text-lg font-bold text-slate-900">
            {title}
          </h2>

          <div className="mt-3 space-y-3 text-sm text-slate-600">{children}</div>

          {/* Na telefonie akcje układają się w pionie i mają pełny cel dotyku. */}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              ref={cancelRef}
              type="button"
              onClick={onCancel}
              disabled={isBusy}
              data-testid="confirm-cancel"
              className="btn btn-quiet h-11 justify-center"
            >
              {cancelLabel}
            </button>

            <button
              type="button"
              onClick={onConfirm}
              disabled={isBusy}
              data-testid="confirm-accept"
              className={[
                "btn h-11 min-w-[12rem] justify-center",
                tone === "danger" ? "btn-danger" : "btn-primary",
              ].join(" ")}
            >
              {isBusy && busyLabel ? busyLabel : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
