"use client";

import { Trophy } from "lucide-react";

import type { CelebrationCta } from "@/lib/public/celebration";

type CelebrationButtonProps = {
  cta: CelebrationCta;
  className?: string;
};

/**
 * Przycisk prowadzący do sekcji wyników albo do klasyfikacji końcowej.
 *
 * Świadomie NIE uruchamia animacji: przewija do sekcji, a ceremonia rusza
 * dopiero wtedy, gdy podium naprawdę wejdzie w pole widzenia. Kliknięcie
 * z góry strony nie może „zużyć" celebracji, której kibic nie zobaczył.
 */
export function CelebrationButton({ cta, className }: CelebrationButtonProps) {
  const isCelebration = cta.kind === "celebration";

  function handleClick() {
    const target = document.getElementById(cta.targetId);
    if (!target) return;

    target.scrollIntoView({ behavior: "smooth", block: "start" });
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
        // Jeden przebieg refleksu, wyłącznie dla nieobejrzanej ceremonii.
        cta.shine ? "cta-shine" : "",
        className ?? "",
      ].join(" ")}
    >
      {isCelebration ? <Trophy size={16} aria-hidden="true" /> : null}
      {cta.label}
    </button>
  );
}
