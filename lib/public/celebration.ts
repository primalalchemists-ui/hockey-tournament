/**
 * CTA CELEBRACJI — czysta logika, bez Reacta i bez DOM.
 *
 * Decyduje, co ma robić przycisk w hero i przy Rankingu. Cała reszta
 * (przewijanie, animacja, zapamiętanie) mieszka gdzie indziej — tu
 * powstaje wyłącznie odpowiedź na pytanie „co pokazać i czy błysnąć".
 */

export type CelebrationCta = {
  /** "results" = zwykłe wyniki, "celebration" = klasyfikacja końcowa. */
  kind: "results" | "celebration";
  label: string;
  /**
   * Jednorazowy błysk — tylko gdy ceremonia jeszcze nieoglądana.
   * Nigdy nie zapętlamy: to zaproszenie, nie migająca reklama.
   */
  shine: boolean;
  /** Identyfikator sekcji, do której przewija przycisk. */
  targetId: string;
  /**
   * Czy kliknięcie ma uruchomić kadr kinowy.
   *
   * Prawda WYŁĄCZNIE dla nieobejrzanej ceremonii. Po obejrzeniu przycisk
   * zostaje zwykłym skrótem do wyników: przewija i nic więcej. Osobne pole,
   * a nie odczytywanie `shine`, bo błysk to decyzja wizualna, a to jest
   * decyzja o zachowaniu — te dwie rzeczy mogą się kiedyś rozejść.
   */
  cinematic: boolean;
};

/** Stabilny identyfikator sekcji klasyfikacji danej grupy. */
export function celebrationSectionId(scopeKey: string): string {
  return `celebration-${scopeKey}`;
}

export const RESULTS_SECTION_ID = "results-section";

export function describeCelebrationCta(input: {
  /** Turniej oficjalnie zakończony. */
  isCompleted: boolean;
  /** Klasyfikacja końcowa jest kompletna (bez dziur). */
  classificationComplete: boolean;
  /** Czy kibic widział już ceremonię tej grupy i tej finalizacji. */
  seen: boolean;
  /** Grupa, do której ma prowadzić przycisk. */
  scopeKey: string | null;
}): CelebrationCta {
  const canCelebrate =
    input.isCompleted && input.classificationComplete && Boolean(input.scopeKey);

  if (!canCelebrate) {
    return {
      kind: "results",
      label: "Sprawdź wyniki",
      shine: false,
      targetId: RESULTS_SECTION_ID,
      cinematic: false,
    };
  }

  return {
    kind: "celebration",
    /*
      Po obejrzeniu ceremonii przycisk nie znika — zostaje wygodnym
      skrótem do finalnych wyników, tylko bez zaproszenia w nazwie.
    */
    label: input.seen ? "Zobacz klasyfikację" : "Zobacz celebrację",
    shine: !input.seen,
    targetId: celebrationSectionId(input.scopeKey!),
    cinematic: !input.seen,
  };
}
