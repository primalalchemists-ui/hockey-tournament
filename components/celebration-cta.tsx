"use client";

import { Trophy } from "lucide-react";

import type { CelebrationCta } from "@/lib/public/celebration";
import {
  CELEBRATION_REQUEST_EVENT,
  type CelebrationRequestDetail,
} from "@/lib/public/cinematic-focus";

type CelebrationButtonProps = {
  cta: CelebrationCta;
  className?: string;
};

/**
 * Przycisk prowadzący do sekcji wyników albo do klasyfikacji końcowej.
 *
 * TRZY ZACHOWANIA, JEDEN PRZYCISK:
 *
 *   1. zwykłe wyniki i obejrzana już ceremonia → spokojne przewinięcie,
 *   2. nieobejrzana ceremonia → prośba o kadr kinowy; to podium wyjeżdża
 *      do kibica, a nie kibic do podium, więc nie przewijamy,
 *   3. nieobejrzana ceremonia przy ograniczonym ruchu → przewinięcie plus
 *      natychmiastowy stan końcowy, bez ośmiu sekund czekania.
 *
 * Przycisk NIE zna choreografii i niczego nie oznacza jako obejrzane —
 * jedno i drugie należy do podium, które jest jedynym źródłem prawdy.
 */
export function CelebrationButton({ cta, className }: CelebrationButtonProps) {
  const isCelebration = cta.kind === "celebration";

  function scrollToTarget() {
    const target = document.getElementById(cta.targetId);
    if (!target) return;

    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function requestCinematic(): boolean {
    const scopeKey = cta.targetId.replace(/^celebration-/, "");
    if (!scopeKey) return false;

    const event = new CustomEvent<CelebrationRequestDetail>(
      CELEBRATION_REQUEST_EVENT,
      { detail: { scopeKey } }
    );

    window.dispatchEvent(event);
    return true;
  }

  function handleClick() {
    if (!cta.cinematic) {
      scrollToTarget();
      return;
    }

    const reducedMotion = Boolean(
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
    );

    /*
      Przy ograniczonym ruchu nie ma czego oglądać w kadrze, więc kibic idzie
      do sekcji normalnie — podium samo domknie się do stanu końcowego.
    */
    if (reducedMotion) scrollToTarget();

    requestCinematic();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      data-testid="celebration-cta"
      data-kind={cta.kind}
      data-shine={cta.shine ? "true" : "false"}
      className={[
        "btn",
        isCelebration ? "btn-celebration" : "btn-quiet",
        /*
          Dwie ODDZIELNE warstwy światła:

          - `cta-shine` (::after) to jednorazowe zaproszenie dla ceremonii,
            której kibic jeszcze nie widział — odpala się raz, po pojawieniu
            się przycisku, i nigdy przy kliknięciu,
          - `cta-sheen` (::before) to reakcja na najechanie kursorem,
            wyłącznie na desktopie.

          Rozdzielenie ich jest istotne: wcześniej klik potrafił wywołać
          ponowne mignięcie tej samej warstwy.
        */
        isCelebration ? "cta-sheen" : "",
        cta.shine ? "cta-shine" : "",
        className ?? "",
      ].join(" ")}
    >
      {isCelebration ? <Trophy size={16} aria-hidden="true" /> : null}
      {cta.label}
    </button>
  );
}
