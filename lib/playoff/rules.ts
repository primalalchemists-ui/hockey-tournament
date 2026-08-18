import type { StandingRow } from "@/types/tournament";
import type { QualifiedTeamCount } from "@/types/tournament-config";

import { buildFirstRoundPairs } from "./seeding";

/**
 * Reguły meczowe i podgląd rozstawienia — czyste funkcje.
 */

/* ==========================================================================
 * WYNIKI
 * ======================================================================== */

export type ScoreValidation = { ok: true } | { ok: false; reason: string };

/**
 * Mecz, który NIE MOŻE zakończyć się remisem: play-off i minigrupa.
 *
 * Nie przechowujemy osobnego wyniku rzutów karnych — do systemu trafia
 * wynik już rozstrzygnięty (1:1 po czasie + karne => admin wpisuje 2:1).
 */
export function validateDecisiveScore(
  homeScore: number | null,
  awayScore: number | null
): ScoreValidation {
  if (homeScore === null && awayScore === null) {
    return { ok: true };
  }

  if (homeScore === null || awayScore === null) {
    return {
      ok: false,
      reason: "Podaj wynik obu drużyn albo pozostaw mecz nierozegrany.",
    };
  }

  if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore)) {
    return { ok: false, reason: "Wynik musi być liczbą całkowitą." };
  }

  if (homeScore < 0 || awayScore < 0) {
    return { ok: false, reason: "Wynik nie może być ujemny." };
  }

  if (homeScore === awayScore) {
    return {
      ok: false,
      reason:
        "W fazie play-off mecz musi mieć zwycięzcę. " +
        "W przypadku remisu wpisz wynik po rzutach karnych.",
    };
  }

  return { ok: true };
}

/** Faza grupowa: remis jest poprawnym wynikiem. */
export function validateGroupScore(
  homeScore: number | null,
  awayScore: number | null
): ScoreValidation {
  if (homeScore === null && awayScore === null) return { ok: true };

  if (homeScore === null || awayScore === null) {
    return {
      ok: false,
      reason: "Podaj wynik obu drużyn albo pozostaw mecz nierozegrany.",
    };
  }

  if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore)) {
    return { ok: false, reason: "Wynik musi być liczbą całkowitą." };
  }

  if (homeScore < 0 || awayScore < 0) {
    return { ok: false, reason: "Wynik nie może być ujemny." };
  }

  return { ok: true };
}

/** Zwycięzca meczu rozstrzygniętego. null, gdy mecz nierozegrany. */
export function getWinner(match: {
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
}): string | null {
  if (
    match.homeScore === null ||
    match.awayScore === null ||
    !match.homeTeamId ||
    !match.awayTeamId
  ) {
    return null;
  }

  if (match.homeScore === match.awayScore) return null;

  return match.homeScore > match.awayScore ? match.homeTeamId : match.awayTeamId;
}

export function getLoser(match: {
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
}): string | null {
  const winner = getWinner(match);
  if (!winner) return null;

  return winner === match.homeTeamId ? match.awayTeamId : match.homeTeamId;
}

/* ==========================================================================
 * PODGLĄD ROZSTAWIENIA (przed zamrożeniem)
 * ======================================================================== */

export type PlayoffPreviewPair = {
  slotIndex: number;
  homeSeed: number;
  awaySeed: number;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
  homeLogoUrl: string | null;
  awayLogoUrl: string | null;
};

export type PlayoffPreview = {
  scopeKey: string;
  qualifiedTeamCount: number;
  /** false, gdy w puli jest za mało drużyn albo ranking nie jest jednoznaczny. */
  isReliable: boolean;
  warnings: string[];
  pairs: PlayoffPreviewPair[];
};

/**
 * "Gdyby faza grupowa zakończyła się teraz, tak wyglądałoby rozstawienie."
 *
 * Liczone z BIEŻĄCEGO calculateStandings — nigdy nie zapisywane do bazy.
 * Oficjalna drabinka powstaje wyłącznie ze snapshotu przy zamrożeniu.
 */
export function buildPlayoffPreview(input: {
  scopeKey: string;
  standings: StandingRow[];
  qualifiedTeamCount: QualifiedTeamCount;
}): PlayoffPreview {
  const { scopeKey, standings, qualifiedTeamCount } = input;

  const warnings: string[] = [];
  const byPosition = new Map(standings.map((row) => [row.position, row]));

  if (standings.length < qualifiedTeamCount) {
    warnings.push(
      `Play-off wymaga ${qualifiedTeamCount} drużyn, obecnie ${standings.length}.`
    );
  }

  /*
    Nierozstrzygnięty remis w strefie awansu jest problemem ADMINISTRACYJNYM:
    blokuje zamknięcie fazy grupowej i tam admin dostaje dokładny komunikat.

    Kibicowi nie pokazujemy tego jako ostrzeżenia — stan jest zrozumiały
    wizualnie (znak zapytania przy miejscu w tabeli), a komunikat brzmiał
    jak błąd aplikacji.
  */

  const pairs = buildFirstRoundPairs(qualifiedTeamCount).map(
    ([homeSeed, awaySeed], slotIndex) => {
      const home = byPosition.get(homeSeed) ?? null;
      const away = byPosition.get(awaySeed) ?? null;

      return {
        slotIndex,
        homeSeed,
        awaySeed,
        homeTeamId: home?.teamId ?? null,
        awayTeamId: away?.teamId ?? null,
        homeTeamName: home?.teamName ?? null,
        awayTeamName: away?.teamName ?? null,
        homeLogoUrl: home?.logoUrl ?? null,
        awayLogoUrl: away?.logoUrl ?? null,
      };
    }
  );

  return {
    scopeKey,
    qualifiedTeamCount,
    isReliable: warnings.length === 0,
    warnings,
    pairs,
  };
}

/* ==========================================================================
 * KOMPLETNOŚĆ FAZY GRUPOWEJ
 * ======================================================================== */

export function getExpectedRoundRobinMatchCount(teamCount: number) {
  return (teamCount * (teamCount - 1)) / 2;
}

export type GroupStageIssue = { scopeLabel: string; reason: string };

/**
 * Twarda walidacja przed zamrożeniem fazy grupowej.
 * Zwraca WSZYSTKIE problemy naraz, żeby admin poprawił je za jednym razem.
 */
export function validateGroupStageCompletion(input: {
  scopeLabel: string;
  teamCount: number;
  playedMatchCount: number;
  standings: StandingRow[];
  qualifiedTeamCount: QualifiedTeamCount;
}): GroupStageIssue[] {
  const {
    scopeLabel,
    teamCount,
    playedMatchCount,
    standings,
    qualifiedTeamCount,
  } = input;

  const issues: GroupStageIssue[] = [];

  if (teamCount < qualifiedTeamCount) {
    issues.push({
      scopeLabel,
      reason: `play-off wymaga ${qualifiedTeamCount} drużyn, obecnie ${teamCount}.`,
    });
  }

  const expected = getExpectedRoundRobinMatchCount(teamCount);

  if (playedMatchCount < expected) {
    issues.push({
      scopeLabel,
      reason: `brakuje wyników ${expected - playedMatchCount} meczów.`,
    });
  }

  // Ranking musi jednoznacznie wskazywać miejsca potrzebne do rozstawienia
  // ORAZ granicę awansu — inaczej drabinka powstałaby z przypadkowej kolejności.
  const ambiguous = standings.filter(
    (row) => row.isTieUnresolved && row.position <= qualifiedTeamCount + 1
  );

  if (ambiguous.length > 0) {
    issues.push({
      scopeLabel,
      reason:
        "kolejność na granicy awansu nie jest rozstrzygnięta " +
        `(${ambiguous.map((row) => row.teamName).join(", ")}). ` +
        "Rozstrzygnij rzutami karnymi i popraw wynik.",
    });
  }

  if (standings.length !== teamCount) {
    issues.push({
      scopeLabel,
      reason: "klasyfikacja nie obejmuje wszystkich drużyn.",
    });
  }

  return issues;
}
