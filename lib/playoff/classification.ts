import type { StandingRow } from "@/types/tournament";

import { getLoser, getWinner } from "./rules";

/**
 * KOŃCOWA KLASYFIKACJA jednej puli / grupy — czysta funkcja.
 *
 * Miejsca 1-4 pochodzą z drabinki, dalsze z minigrupy klasyfikacyjnej.
 * Gdy nie ma meczu o 3. miejsce, miejsca 3-4 są dzielone i jawnie
 * oznaczone jako nierozstrzygnięte — nie wymyślamy kolejności.
 */

export type ClassificationEntry = {
  /** null = miejsce dzielone / nierozstrzygnięte. */
  position: number | null;
  teamId: string;
  /** Skąd wynika to miejsce — do prezentacji i diagnostyki. */
  source: "final" | "third_place" | "semifinal" | "placement_group";
  /** true, gdy miejsce jest dzielone z inną drużyną. */
  shared: boolean;
};

export type FinalClassification = {
  scopeKey: string;
  complete: boolean;
  missing: string[];
  entries: ClassificationEntry[];
};

type BracketMatchLike = {
  kind: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
};

export function buildFinalClassification(input: {
  scopeKey: string;
  /** Mecze drabinki tej puli. */
  bracketMatches: BracketMatchLike[];
  thirdPlaceMatch: boolean;
  /** Klasyfikacja minigrupy (już policzona przez calculateStandings). */
  placementStandings: StandingRow[] | null;
  /** Czy wszystkie mecze minigrupy zostały rozegrane. */
  placementComplete: boolean;
}): FinalClassification {
  const {
    scopeKey,
    bracketMatches,
    thirdPlaceMatch,
    placementStandings,
    placementComplete,
  } = input;

  const entries: ClassificationEntry[] = [];
  const missing: string[] = [];

  const finalMatch = bracketMatches.find((match) => match.kind === "final");
  const finalWinner = finalMatch ? getWinner(finalMatch) : null;
  const finalLoser = finalMatch ? getLoser(finalMatch) : null;

  if (!finalWinner || !finalLoser) {
    missing.push("finał");
  } else {
    entries.push({ position: 1, teamId: finalWinner, source: "final", shared: false });
    entries.push({ position: 2, teamId: finalLoser, source: "final", shared: false });
  }

  if (thirdPlaceMatch) {
    const thirdMatch = bracketMatches.find(
      (match) => match.kind === "third_place"
    );
    const thirdWinner = thirdMatch ? getWinner(thirdMatch) : null;
    const thirdLoser = thirdMatch ? getLoser(thirdMatch) : null;

    if (!thirdWinner || !thirdLoser) {
      missing.push("mecz o 3. miejsce");
    } else {
      entries.push({
        position: 3,
        teamId: thirdWinner,
        source: "third_place",
        shared: false,
      });
      entries.push({
        position: 4,
        teamId: thirdLoser,
        source: "third_place",
        shared: false,
      });
    }
  } else {
    // Bez meczu o 3. miejsce przegrani półfinałów dzielą miejsca 3-4.
    const semifinals = bracketMatches.filter(
      (match) => match.kind === "semifinal"
    );

    const losers = semifinals
      .map((match) => getLoser(match))
      .filter((teamId): teamId is string => Boolean(teamId));

    if (semifinals.length > 0 && losers.length !== semifinals.length) {
      missing.push("półfinały");
    }

    for (const teamId of losers) {
      entries.push({
        position: null,
        teamId,
        source: "semifinal",
        shared: true,
      });
    }
  }

  /* --- miejsca poza play-off ------------------------------------------- */

  if (placementStandings && placementStandings.length > 0) {
    if (!placementComplete) {
      missing.push("minigrupa klasyfikacyjna");
    }

    // Numeracja startuje od pierwszego miejsca poza play-off.
    const offset = entries.length + (thirdPlaceMatch ? 0 : 0);
    const firstPlacementPosition =
      (thirdPlaceMatch ? 4 : entries.length) + 1;

    void offset;

    placementStandings.forEach((row, index) => {
      entries.push({
        position: row.isTieUnresolved
          ? null
          : firstPlacementPosition + index,
        teamId: row.teamId,
        source: "placement_group",
        shared: Boolean(row.isTieUnresolved),
      });
    });
  }

  return {
    scopeKey,
    complete: missing.length === 0,
    missing,
    entries,
  };
}

/* ==========================================================================
 * SZKIELET KLASYFIKACJI (prezentacja przed zakończeniem turnieju)
 * ======================================================================== */

export type ClassificationSlot = {
  /** null = miejsce dzielone (np. 3-4 bez meczu o 3. miejsce). */
  position: number | null;
  /** Etykieta do pokazania, np. "3" albo "3–4". */
  label: string;
  shared: boolean;
};

/**
 * Jakie miejsca WYŁONI ten format, zanim jeszcze cokolwiek rozegrano.
 *
 * Frontend nie wymyśla struktury sportowej — dostaje gotowe sloty i wypełnia
 * je znakami zapytania. Uwzględnia liczbę drużyn, wielkość drabinki,
 * mecz o 3. miejsce i tryb minigrupy.
 */
export function buildClassificationSkeleton(input: {
  teamCount: number;
  qualifiedTeamCount: number;
  thirdPlaceMatch: boolean;
  placementMode: "none" | "placement_group";
}): ClassificationSlot[] {
  const { teamCount, qualifiedTeamCount, thirdPlaceMatch, placementMode } = input;

  const slots: ClassificationSlot[] = [];
  const qualified = Math.min(qualifiedTeamCount, teamCount);

  if (qualified >= 2) {
    slots.push({ position: 1, label: "1", shared: false });
    slots.push({ position: 2, label: "2", shared: false });
  }

  if (qualified >= 4) {
    if (thirdPlaceMatch) {
      slots.push({ position: 3, label: "3", shared: false });
      slots.push({ position: 4, label: "4", shared: false });
    } else {
      // Bez meczu o 3. miejsce przegrani półfinałów dzielą miejsca 3-4.
      slots.push({ position: null, label: "3–4", shared: true });
      slots.push({ position: null, label: "3–4", shared: true });
    }
  }

  // Miejsca poza drabinką pojawiają się tylko przy minigrupie.
  if (placementMode === "placement_group") {
    for (let position = qualified + 1; position <= teamCount; position += 1) {
      slots.push({ position, label: String(position), shared: false });
    }
  }

  return slots;
}
