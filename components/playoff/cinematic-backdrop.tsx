"use client";

import { ModalPortal } from "@/components/ui/modal-portal";
import { FOCUS, type FocusPhase } from "@/lib/public/cinematic-focus";

/**
 * TŁO KADRU CEREMONII.
 *
 * To NIE jest okno modalne. Nie ma karty, krzyżyka ani stopki z przyciskami —
 * jest wyłącznie ciemnienie, które odsuwa resztę strony na drugi plan.
 * Pod spodem ma być nadal widać, że strona istnieje: to ma wyglądać jak
 * transmisja sportowa, nie jak popup administracyjny.
 *
 * Warstwa idzie przez portal na koniec <body>, bo `position: fixed` liczy się
 * względem viewportu tylko wtedy, gdy żaden przodek nie tworzy własnego
 * kontenera pozycjonowania — a `.ice-surface` robi to swoim `backdrop-filter`.
 *
 * Tło przechwytuje też wskaźnik: pod spodem nie da się kliknąć zakładek,
 * przełącznika kategorii ani ikon społecznościowych.
 */
export function CinematicBackdrop({ phase }: { phase: FocusPhase }) {
  /*
    Wejście i wyjście to dwie ODDZIELNE animacje z `fill: both`, a nie jedno
    przejście sterowane inline'em. Animacja w trakcie działania nadpisuje
    style inline, więc próba wygaszenia tła atrybutem `style` po prostu nic
    by nie zrobiła.
  */
  const leaving = phase === "exiting";

  return (
    <ModalPortal>
      <div
        aria-hidden="true"
        data-testid="cinematic-backdrop"
        data-phase={phase}
        className={[
          "cinematic-backdrop fixed inset-0",
          leaving ? "cinematic-backdrop-out" : "cinematic-backdrop-in",
        ].join(" ")}
        style={{
          ["--backdrop-in-ms" as string]: `${FOCUS.backdropMs}ms`,
          ["--backdrop-out-ms" as string]: `${FOCUS.exitMs}ms`,
        }}
      />
    </ModalPortal>
  );
}
