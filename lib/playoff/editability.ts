import type { QualifiedTeamCount } from "@/types/tournament-config";

import {
  buildRoundKinds,
  getRoundKindsForPhase,
  isBracketPhase,
  type BracketRoundKind,
  type TournamentPhase,
} from "./phases";

/**
 * KTÓRY MECZ WOLNO DZIŚ EDYTOWAĆ — czysta funkcja, zero IO.
 *
 * Kluczowe rozróżnienie, które wcześniej się zlewało:
 *
 *   „uczestnik meczu jest już znany"  !=  „mecz wolno zapisać".
 *
 * Publicznie wolno pokazać zwycięzcę półfinału od razu w finale — to jest
 * dobre i zostaje. Ale administrator nie może wpisać wyniku finału, dopóki
 * półfinały nie zostaną OFICJALNIE zamknięte, bo inaczej panel pokazuje
 * siedem jednakowo aktywnych sekcji i nie wiadomo, co jest teraz grane.
 *
 * Minigrupa jest wyjątkiem CELOWYM: to niezależna gałąź turnieju, która
 * w hali toczy się równolegle z drabinką, więc staje się edytowalna
 * natychmiast po zamknięciu fazy grupowej.
 */

export type MatchEditability =
  /** Bieżący etap — inputy i zapis aktywne. */
  | "editable"
  /** Runda jeszcze przed nami — widoczna, ale bez zapisu. */
  | "pending"
  /** Runda rozegrana — wynik widoczny, bez inputów. */
  | "completed"
  /** Drabinka nie ma jeszcze oficjalnego bytu (faza grupowa). */
  | "locked";

export type EditabilityInput = {
  phase: TournamentPhase;
  size: QualifiedTeamCount;
  thirdPlaceMatch: boolean;
  /** "bracket" = drabinka, "placement_group" = minigrupa. */
  stage: "bracket" | "placement_group";
  /** Rodzaj rundy — wymagany dla stage = "bracket". */
  kind?: BracketRoundKind;
};

/**
 * Pozycja rundy w sekwencji faz.
 *
 * Mecz o 3. miejsce nie jest osobną fazą — należy do fazy „final",
 * więc dziedziczy jej numer porządkowy.
 */
function roundOrderIndex(
  kind: BracketRoundKind,
  size: QualifiedTeamCount
): number {
  const kinds = buildRoundKinds(size);
  const effective = kind === "third_place" ? "final" : kind;

  return kinds.indexOf(effective);
}

export function describeMatchEditability(
  input: EditabilityInput
): MatchEditability {
  const { phase, size, thirdPlaceMatch, stage, kind } = input;

  if (phase === "group_stage") {
    /*
      Przed zamrożeniem nie istnieją ani oficjalni uczestnicy drabinki,
      ani oficjalne miejsca 5-N, więc minigrupa też jeszcze nie rusza.
    */
    return "locked";
  }

  if (phase === "completed") return "completed";

  // Minigrupa: niezależna gałąź, aktywna przez cały play-off.
  if (stage === "placement_group") return "editable";

  if (!kind) return "locked";

  if (getRoundKindsForPhase(phase, thirdPlaceMatch).includes(kind)) {
    return "editable";
  }

  if (!isBracketPhase(phase)) return "locked";

  const roundIndex = roundOrderIndex(kind, size);
  const phaseIndex = roundOrderIndex(phase as BracketRoundKind, size);

  if (roundIndex === -1 || phaseIndex === -1) return "locked";

  return roundIndex < phaseIndex ? "completed" : "pending";
}

/** Skrót do walidacji zapisu — zarówno na serwerze, jak i w UI. */
export function isMatchEditable(input: EditabilityInput): boolean {
  return describeMatchEditability(input) === "editable";
}

const STATUS_LABELS: Record<MatchEditability, string> = {
  editable: "Trwa",
  pending: "Oczekuje",
  completed: "Rozegrane",
  // Faza grupowa: drabinka istnieje jako podgląd, nie jako coś do wpisania.
  locked: "Podgląd",
};

/** Etykieta etapu dla panelu — jedno źródło słownictwa. */
export function describeEditabilityLabel(status: MatchEditability): string {
  return STATUS_LABELS[status];
}
