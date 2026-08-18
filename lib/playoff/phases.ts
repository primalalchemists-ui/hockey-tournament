import type { QualifiedTeamCount } from "@/types/tournament-config";

/**
 * Oficjalna faza turnieju — trzymana W BAZIE, nie wyliczana z UI.
 *
 * Software nigdy nie kończy fazy sam. Każde przejście wymaga jawnej,
 * świadomej akcji administratora.
 */
export type TournamentPhase =
  | "group_stage"
  | "round_of_16"
  | "quarterfinal"
  | "semifinal"
  | "final"
  | "completed";

/** Rodzaj rundy w drabince (mecz o 3. miejsce nie jest osobną fazą). */
export type BracketRoundKind =
  | "round_of_16"
  | "quarterfinal"
  | "semifinal"
  | "final"
  | "third_place";

export type BracketRoundStatus = "pending" | "active" | "completed";

export const PHASE_LABELS: Record<TournamentPhase, string> = {
  group_stage: "Faza grupowa",
  round_of_16: "1/8 finału",
  quarterfinal: "Ćwierćfinały",
  semifinal: "Półfinały",
  final: "Finały",
  completed: "Zakończony",
};

export const ROUND_LABELS: Record<BracketRoundKind, string> = {
  round_of_16: "1/8 finału",
  quarterfinal: "Ćwierćfinały",
  semifinal: "Półfinały",
  final: "Finał",
  third_place: "Mecz o 3. miejsce",
};

/** Ile drużyn gra w rundzie danego rodzaju. */
const KIND_BY_TEAM_COUNT: Record<number, BracketRoundKind> = {
  16: "round_of_16",
  8: "quarterfinal",
  4: "semifinal",
  2: "final",
};

/**
 * Rundy eliminacyjne dla zadanego rozmiaru drabinki, od pierwszej do finału.
 * Mecz o 3. miejsce NIE jest tu ujęty — to nie jest osobna faza.
 */
export function buildRoundKinds(size: QualifiedTeamCount): BracketRoundKind[] {
  const kinds: BracketRoundKind[] = [];

  for (let teams = size; teams >= 2; teams /= 2) {
    const kind = KIND_BY_TEAM_COUNT[teams];

    if (!kind) {
      throw new Error(`Nieobsługiwany rozmiar rundy: ${teams}.`);
    }

    kinds.push(kind);
  }

  return kinds;
}

/**
 * Pełna sekwencja faz turnieju.
 *
 *   2  -> group_stage, final, completed
 *   4  -> group_stage, semifinal, final, completed
 *   8  -> group_stage, quarterfinal, semifinal, final, completed
 *   16 -> group_stage, round_of_16, quarterfinal, semifinal, final, completed
 */
export function buildPhaseSequence(
  size: QualifiedTeamCount
): TournamentPhase[] {
  // buildRoundKinds nigdy nie zwraca "third_place" — mecz o 3. miejsce
  // nie jest osobną fazą, tylko częścią fazy "final".
  const kinds = buildRoundKinds(size) as Exclude<
    BracketRoundKind,
    "third_place"
  >[];

  return ["group_stage", ...kinds, "completed"];
}

export function getNextPhase(
  phase: TournamentPhase,
  size: QualifiedTeamCount
): TournamentPhase | null {
  const sequence = buildPhaseSequence(size);
  const index = sequence.indexOf(phase);

  if (index === -1 || index === sequence.length - 1) return null;

  return sequence[index + 1];
}

export function getPreviousPhase(
  phase: TournamentPhase,
  size: QualifiedTeamCount
): TournamentPhase | null {
  const sequence = buildPhaseSequence(size);
  const index = sequence.indexOf(phase);

  if (index <= 0) return null;

  return sequence[index - 1];
}

export function isBracketPhase(
  phase: TournamentPhase
): phase is Exclude<TournamentPhase, "group_stage" | "completed"> {
  return phase !== "group_stage" && phase !== "completed";
}

/**
 * Rundy, które muszą być rozegrane, żeby domknąć daną fazę.
 * Faza "final" obejmuje finał ORAZ mecz o 3. miejsce, jeśli istnieje.
 */
export function getRoundKindsForPhase(
  phase: TournamentPhase,
  thirdPlaceMatch: boolean
): BracketRoundKind[] {
  if (!isBracketPhase(phase)) return [];

  if (phase === "final") {
    return thirdPlaceMatch ? ["final", "third_place"] : ["final"];
  }

  return [phase];
}
