import type { PlayoffConfig, TournamentFormat } from "@/types/tournament-config";

/**
 * PLANOWANA LICZBA MECZÓW CAŁEGO TURNIEJU — czysta funkcja, zero IO.
 *
 * Liczy z KONFIGURACJI, nie z liczby wierszy w bazie. To istotne: mecze
 * pucharowe i minigrupy materializują się dopiero przy zamknięciu fazy
 * grupowej, więc licznik oparty o `matches.length` rósł w trakcie turnieju.
 * Kibic ma widzieć skalę wydarzenia od pierwszej sekundy i ta liczba nie
 * może się zmieniać tylko dlatego, że silnik dopisał rekordy.
 */

export type PlannedScope = {
  /** Liczba drużyn w tej grupie / puli. */
  teamCount: number;
};

/** Każdy z każdym: n * (n-1) / 2. */
export function roundRobinMatchCount(teamCount: number): number {
  if (teamCount < 2) return 0;
  return (teamCount * (teamCount - 1)) / 2;
}

/**
 * Liczba meczów planowanych w JEDNEJ grupie / puli.
 *
 * Drabinka o rozmiarze q ma zawsze q-1 meczów (każdy poza zwycięzcą
 * przegrywa dokładnie raz) — bez wypisywania rund.
 */
export function plannedMatchesForScope(input: {
  teamCount: number;
  format: TournamentFormat;
  playoffConfig: PlayoffConfig | null;
}): number {
  const groupStage = roundRobinMatchCount(input.teamCount);

  if (input.format !== "group_playoff" || !input.playoffConfig) {
    return groupStage;
  }

  const { qualifiedTeamCount, thirdPlaceMatch, placementMode } =
    input.playoffConfig;

  // Do play-offu nie wejdzie więcej drużyn, niż jest w grupie.
  const qualified = Math.min(qualifiedTeamCount, input.teamCount);
  const knockout = Math.max(0, qualified - 1);

  // Mecz o 3. miejsce wymaga półfinałów, czyli co najmniej czterech drużyn.
  const thirdPlace = thirdPlaceMatch && qualified >= 4 ? 1 : 0;

  const eliminated = Math.max(0, input.teamCount - qualified);
  const placement =
    placementMode === "placement_group" ? roundRobinMatchCount(eliminated) : 0;

  return groupStage + knockout + thirdPlace + placement;
}

/**
 * Suma po wszystkich grupach. Rozmiary grup mogą się różnić — każda jest
 * liczona osobno, bez zakładania równego podziału.
 */
export function calculatePlannedMatchCount(input: {
  format: TournamentFormat;
  playoffConfig: PlayoffConfig | null;
  scopes: PlannedScope[];
}): number {
  return input.scopes.reduce(
    (total, scope) =>
      total +
      plannedMatchesForScope({
        teamCount: scope.teamCount,
        format: input.format,
        playoffConfig: input.playoffConfig,
      }),
    0
  );
}
