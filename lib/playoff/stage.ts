import type { BracketRoundKind, TournamentPhase } from "./phases";

/**
 * PREZENTACJA ETAPU TURNIEJU — nazwa i ton koloru.
 *
 * Czysty moduł: zero IO i zero wiedzy o konkretnym turnieju. Ton jest
 * NEUTRALNY i globalny — żadnego „koloru SUN CUP". Frontend mapuje token
 * na klasy, ale nie decyduje, jaki etap trwa.
 */

/** Neutralne tokeny tonalne; kolejność = narastająca ranga sportowa. */
export type StageTone =
  | "group"
  | "round_of_16"
  | "quarterfinal"
  | "semifinal"
  | "final"
  | "third_place"
  | "completed";

export type StagePresentation = {
  /** Publiczna etykieta etapu. */
  label: string;
  tone: StageTone;
};

/** Oficjalne, publiczne nazwy etapów turnieju. */
export const STAGE_LABELS: Record<TournamentPhase, string> = {
  group_stage: "Faza grupowa",
  round_of_16: "1/8 finału",
  quarterfinal: "Ćwierćfinały",
  semifinal: "Półfinały",
  // Mecz o 3. miejsce należy do tego etapu, ale NIE jest osobną fazą.
  final: "Finał",
  completed: "Turniej zakończony",
};

const PHASE_TONES: Record<TournamentPhase, StageTone> = {
  group_stage: "group",
  round_of_16: "round_of_16",
  quarterfinal: "quarterfinal",
  semifinal: "semifinal",
  final: "final",
  completed: "completed",
};

const ROUND_TONES: Record<BracketRoundKind, StageTone> = {
  round_of_16: "round_of_16",
  quarterfinal: "quarterfinal",
  semifinal: "semifinal",
  final: "final",
  third_place: "third_place",
};

/** Etap całego turnieju — do plakietki przy Rankingu. */
export function describeStage(phase: TournamentPhase): StagePresentation {
  return {
    label: STAGE_LABELS[phase] ?? phase,
    tone: PHASE_TONES[phase] ?? "group",
  };
}

/** Ton pojedynczej rundy drabinki — karty rund są rozróżnialne wzrokowo. */
export function describeRoundTone(kind: BracketRoundKind): StageTone {
  return ROUND_TONES[kind] ?? "group";
}
