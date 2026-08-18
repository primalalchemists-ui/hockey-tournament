import type { QualifiedTeamCount } from "@/types/tournament-config";

import { buildFirstRoundPairs } from "./seeding";
import {
  ROUND_LABELS,
  buildRoundKinds,
  type BracketRoundKind,
} from "./phases";

/**
 * PLAN DRABINKI — czysta funkcja, zero IO.
 *
 * Zwraca kompletną strukturę rund i meczów wraz z regułami propagacji.
 * Nigdzie nie ma warunku typu `if (kind === "semifinal") -> final`:
 * przejścia między rundami są DANYMI (MatchSlotSource), nie kodem.
 */

export type MatchSlotSource =
  /** Rozstawienie z zamrożonego rankingu (1..n w obrębie puli). */
  | { type: "seed"; seed: number }
  /** Zwycięzca innego meczu — identyfikowany po stabilnym externalId. */
  | { type: "winner"; matchExternalId: string }
  /** Przegrany innego meczu (mecz o 3. miejsce). */
  | { type: "loser"; matchExternalId: string };

export type PlannedMatch = {
  externalId: string;
  slotIndex: number;
  homeSource: MatchSlotSource;
  awaySource: MatchSlotSource;
};

export type PlannedRound = {
  order: number;
  kind: BracketRoundKind;
  label: string;
  matchCount: number;
  matches: PlannedMatch[];
};

export type BracketPlan = {
  size: QualifiedTeamCount;
  rounds: PlannedRound[];
};

/** Stabilny, deterministyczny identyfikator meczu pucharowego. */
export function buildPlayoffMatchExternalId(
  scopeKey: string,
  kind: BracketRoundKind,
  slotIndex: number
) {
  return `po-${scopeKey}-${kind}-${slotIndex}`;
}

/**
 * Buduje plan drabinki dla jednej puli / grupy.
 *
 * @param scopeKey klucz grupy ("A") lub technicznej puli ("__main__") —
 *                 wchodzi do identyfikatorów, żeby drabinki grup A i B
 *                 były od siebie całkowicie niezależne.
 */
export function planBracket(input: {
  scopeKey: string;
  size: QualifiedTeamCount;
  thirdPlaceMatch: boolean;
}): BracketPlan {
  const { scopeKey, size, thirdPlaceMatch } = input;

  if (thirdPlaceMatch && size < 4) {
    throw new Error(
      "Mecz o 3. miejsce wymaga co najmniej 4 drużyn w play-off."
    );
  }

  const kinds = buildRoundKinds(size);
  const rounds: PlannedRound[] = [];

  // --- pierwsza runda: uczestnicy wprost z rozstawienia -------------------
  const firstKind = kinds[0];
  const firstPairs = buildFirstRoundPairs(size);

  rounds.push({
    order: 0,
    kind: firstKind,
    label: ROUND_LABELS[firstKind],
    matchCount: firstPairs.length,
    matches: firstPairs.map(([homeSeed, awaySeed], slotIndex) => ({
      externalId: buildPlayoffMatchExternalId(scopeKey, firstKind, slotIndex),
      slotIndex,
      homeSource: { type: "seed", seed: homeSeed },
      awaySource: { type: "seed", seed: awaySeed },
    })),
  });

  // --- kolejne rundy: uczestnicy ze zwycięzców pary meczów poprzedniej ----
  for (let index = 1; index < kinds.length; index += 1) {
    const kind = kinds[index];
    const previous = rounds[index - 1];
    const matchCount = previous.matchCount / 2;
    const matches: PlannedMatch[] = [];

    for (let slotIndex = 0; slotIndex < matchCount; slotIndex += 1) {
      matches.push({
        externalId: buildPlayoffMatchExternalId(scopeKey, kind, slotIndex),
        slotIndex,
        homeSource: {
          type: "winner",
          matchExternalId: previous.matches[slotIndex * 2].externalId,
        },
        awaySource: {
          type: "winner",
          matchExternalId: previous.matches[slotIndex * 2 + 1].externalId,
        },
      });
    }

    rounds.push({
      order: index,
      kind,
      label: ROUND_LABELS[kind],
      matchCount,
      matches,
    });
  }

  // --- mecz o 3. miejsce: przegrani półfinałów ---------------------------
  if (thirdPlaceMatch) {
    const semifinalRound = rounds.find((round) => round.kind === "semifinal");

    if (!semifinalRound || semifinalRound.matches.length !== 2) {
      throw new Error(
        "Mecz o 3. miejsce wymaga dokładnie dwóch półfinałów."
      );
    }

    rounds.push({
      // Osobny `order`, bo (bracket_id, order) jest unikalne w bazie.
      // Fazowo należy jednak do "final" — patrz getRoundKindsForPhase().
      order: rounds.length,
      kind: "third_place",
      label: ROUND_LABELS.third_place,
      matchCount: 1,
      matches: [
        {
          externalId: buildPlayoffMatchExternalId(scopeKey, "third_place", 0),
          slotIndex: 0,
          homeSource: {
            type: "loser",
            matchExternalId: semifinalRound.matches[0].externalId,
          },
          awaySource: {
            type: "loser",
            matchExternalId: semifinalRound.matches[1].externalId,
          },
        },
      ],
    });
  }

  return { size, rounds };
}

/* ==========================================================================
 * MINIGRUPA KLASYFIKACYJNA
 * ======================================================================== */

export type PlannedPlacementMatch = {
  externalId: string;
  homeTeamId: string;
  awayTeamId: string;
  sourceOrder: number;
};

/**
 * Generyczny round-robin dla drużyn poza play-off.
 *
 * Nie ma tu żadnego "5-6-7" — bierze dowolną liczbę drużyn
 * i generuje każdy z każdym.
 */
export function planPlacementGroup(input: {
  scopeKey: string;
  /** Identyfikatory domenowe drużyn, w kolejności miejsc z fazy grupowej. */
  teamExternalIds: string[];
}): PlannedPlacementMatch[] {
  const { scopeKey, teamExternalIds } = input;
  const matches: PlannedPlacementMatch[] = [];

  let sourceOrder = 0;

  for (let i = 0; i < teamExternalIds.length; i += 1) {
    for (let j = i + 1; j < teamExternalIds.length; j += 1) {
      const home = teamExternalIds[i];
      const away = teamExternalIds[j];

      matches.push({
        externalId: `pl-${scopeKey}-${home}-${away}`,
        homeTeamId: home,
        awayTeamId: away,
        sourceOrder: sourceOrder++,
      });
    }
  }

  return matches;
}
