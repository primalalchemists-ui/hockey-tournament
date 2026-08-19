import {
  getRoundKindsForPhase,
  ROUND_LABELS,
  type BracketRoundKind,
  type TournamentPhase,
} from "./phases";

/**
 * TEKST OKNA COFANIA FAZY — czysta prezentacja, zero logiki sportowej.
 *
 * Cofanie fazy pozostaje w całości w silniku (`reopenPreviousPhase`).
 * Ten moduł WYŁĄCZNIE opowiada człowiekowi, co ta operacja zrobi —
 * i opiera się na tym, co silnik naprawdę robi:
 *
 *   1. cofnięcie z „zakończony" do finałów kasuje wyłącznie znacznik
 *      zakończenia (`completed_at`); ŻADEN wynik nie jest usuwany,
 *   2. cofnięcie o jedną rundę zeruje wyniki TEJ rundy i uczestników
 *      wyprowadzonych z rundy wcześniejszej; wcześniejsze rundy
 *      i minigrupa zostają nietknięte,
 *   3. cofnięcie do fazy grupowej rozmontowuje drabinkę, minigrupę
 *      i zamrożone rozstawienie; wyniki grupowe zostają.
 *
 * Zakazane słownictwo: identyfikatory meczów, „snapshot", „downstream",
 * „propagacja uczestników", „bieżący etap jest pusty".
 */

export type RewindCopy = {
  title: string;
  /** Dwa-trzy krótkie zdania. Nigdy instrukcja obsługi. */
  lines: string[];
};

/** Dopełniacz nazwy fazy — do tytułu „Cofnąć do …?". */
const PHASE_GENITIVE: Record<TournamentPhase, string> = {
  group_stage: "fazy grupowej",
  round_of_16: "1/8 finału",
  quarterfinal: "ćwierćfinałów",
  semifinal: "półfinałów",
  final: "finałów",
  completed: "zakończenia",
};

/** Dopełniacz nazwy rundy — do zdania „Wyniki … zostaną usunięte". */
const ROUND_GENITIVE: Record<BracketRoundKind, string> = {
  round_of_16: "meczów 1/8 finału",
  quarterfinal: "ćwierćfinałów",
  semifinal: "półfinałów",
  final: "finałów",
  third_place: "meczów o 3. miejsce",
};

/** Wylicza rundy, których wyniki faktycznie znikną przy cofnięciu. */
function describeAffectedRounds(
  phase: TournamentPhase,
  thirdPlaceMatch: boolean
): string {
  const kinds = getRoundKindsForPhase(phase, thirdPlaceMatch);

  if (kinds.length === 0) return "";

  const names = kinds.map((kind) => ROUND_GENITIVE[kind]);

  if (names.length === 1) return names[0];

  return `${names.slice(0, -1).join(", ")} i ${names[names.length - 1]}`;
}

export function getRewindConfirmationCopy(input: {
  currentPhase: TournamentPhase;
  targetPhase: TournamentPhase;
  targetLabel: string;
  /** Ile wpisanych wyników realnie zniknie — prosto z silnika. */
  resultsToDiscard: number;
  /** Czy operacja rozmontuje drabinkę i minigrupę. */
  removesBracket: boolean;
  thirdPlaceMatch: boolean;
}): RewindCopy {
  const target = PHASE_GENITIVE[input.targetPhase] ?? "poprzedniej fazy";

  /* --- 1. Powrót z zakończonego turnieju ------------------------------- */
  if (input.currentPhase === "completed") {
    return {
      title: `Cofnąć turniej do ${target}?`,
      lines: [
        "Turniej przestanie być oznaczony jako zakończony.",
        "Wszystkie wpisane wyniki pozostaną zapisane.",
        "Klasyfikacja końcowa zniknie ze strony wyników do czasu ponownego zakończenia turnieju.",
      ],
    };
  }

  /* --- 2. Rozmontowanie drabinki -------------------------------------- */
  if (input.removesBracket) {
    return {
      title: `Cofnąć do ${target}?`,
      lines: [
        input.resultsToDiscard > 0
          ? `Drabinka i minigrupa zostaną usunięte razem z wpisanymi w nich wynikami (${input.resultsToDiscard}).`
          : "Drabinka i minigrupa zostaną usunięte.",
        "Wyniki fazy grupowej pozostaną zapisane.",
        "Rozstawienie powstanie na nowo przy kolejnym zamknięciu fazy grupowej.",
      ],
    };
  }

  /* --- 3. Cofnięcie o jedną rundę ------------------------------------- */
  const affected = describeAffectedRounds(
    input.currentPhase,
    input.thirdPlaceMatch
  );

  return {
    title: `Cofnąć do ${target}?`,
    lines: [
      input.resultsToDiscard > 0
        ? `Wyniki ${affected} zostaną usunięte (${input.resultsToDiscard}).`
        : `${input.targetLabel} znów staną się etapem do rozegrania.`,
      "Wyniki wcześniejszych rund i minigrupy pozostaną zapisane.",
    ],
  };
}
