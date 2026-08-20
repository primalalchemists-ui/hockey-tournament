"use client";

import { useEffect, useId, useRef } from "react";
import { AlertTriangle } from "lucide-react";

import { ModalPortal } from "@/components/ui/modal-portal";
import { lockBodyScroll } from "@/lib/public/scroll-lock";

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
  /** Rozszerza okno dla dłuższych formularzy (np. łączenie kategorii). */
  size?: "compact" | "form";
  /** "warning" dodaje wyraźny znak ostrzegawczy przy tytule. */
  icon?: "none" | "warning";
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
  size = "compact",
  icon = "none",
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
      Blokada przewijania bez skoku strony — ten sam helper, którego używa
      kadr kinowy podium. Jedna implementacja, jedna rekompensata paska.
    */
    const restoreScroll = lockBodyScroll();

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
      restoreScroll();
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
          data-size={size}
          /*
            OKNO NIGDY NIE PRZERASTA EKRANU.

            Formularz łączenia kategorii jest wysoki (dwa pola, dwa pickery),
            więc na telefonie okno potrafiło ciągnąć się przez cały ekran,
            a przyciski uciekały poza zasięg. Nagłówek i stopka są teraz
            przyklejone, a przewija się wyłącznie środek.
          */
          className={[
            "ice-surface flex w-full max-h-[88dvh] flex-col rounded-3xl shadow-2xl",
            size === "form" ? "max-w-lg" : "max-w-md",
          ].join(" ")}
        >
          <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
            <div className="flex min-w-0 items-center gap-3">
              {/* Operacja wysokiego ryzyka dostaje jednoznaczny znak. */}
              {icon === "warning" ? (
                <span
                  aria-hidden="true"
                  data-testid="confirm-warning-icon"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-700"
                >
                  <AlertTriangle size={18} />
                </span>
              ) : null}

              <h2 id={titleId} className="text-lg font-bold text-slate-900">
                {title}
              </h2>
            </div>

            <button
              type="button"
              onClick={onCancel}
              disabled={isBusy}
              aria-label="Zamknij"
              data-testid="confirm-close"
              className="btn btn-quiet h-9 w-9 shrink-0 justify-center p-0 text-sm"
            >
              ✕
            </button>
          </div>

          {/* Przewija się WYŁĄCZNIE treść — nagłówek i akcje zostają w kadrze. */}
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-3 text-sm text-slate-600 sm:px-6">
            {children}
          </div>

          {/* Na telefonie akcje układają się w pionie i mają pełny cel dotyku. */}
          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-[var(--surface-line)] px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
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
