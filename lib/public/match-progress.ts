/**
 * POSTĘP TURNIEJU — czysta funkcja, zero IO i zero DOM.
 *
 * Badge w nagłówku przestał być informacją o rozmiarze wydarzenia,
 * a stał się jego stanem: „42 / 56 meczów". Mianownik pochodzi
 * z KONFIGURACJI (patrz lib/playoff/planned-matches), licznik — wyłącznie
 * z meczów, które naprawdę mają wynik.
 *
 * Mecze przyszłych rund, które jeszcze nie zmaterializowały się w bazie,
 * nie są liczone po żadnej ze stron.
 */

type ScoredMatch = {
  homeScore: number | null;
  awayScore: number | null;
};

type ProgressScope = {
  rounds: Array<{ matches: ScoredMatch[] }>;
  placement: { matches: ScoredMatch[] } | null;
};

export type MatchProgress = {
  played: number;
  planned: number;
  /** Rozegrano wszystko, co zaplanowano. */
  isComplete: boolean;
};

function isPlayed(match: ScoredMatch): boolean {
  return match.homeScore !== null && match.awayScore !== null;
}

/**
 * Liczba rozegranych meczów ze WSZYSTKICH etapów sportowych:
 * faza grupowa, drabinka, mecz o 3. miejsce i minigrupa.
 *
 * Model domenowy grupy niesie wyłącznie mecze z wynikiem, więc faza
 * grupowa wchodzi tu swoją długością.
 */
export function countPlayedMatches(input: {
  groups: Array<{ matches: unknown[] }>;
  playoffState: { scopes: ProgressScope[] } | null;
}): number {
  const groupMatches = input.groups.reduce(
    (sum, group) => sum + group.matches.length,
    0
  );

  const playoffMatches = (input.playoffState?.scopes ?? []).reduce(
    (sum, scope) => {
      const bracket = scope.rounds
        .flatMap((round) => round.matches)
        .filter(isPlayed).length;

      const placement = (scope.placement?.matches ?? []).filter(isPlayed).length;

      return sum + bracket + placement;
    },
    0
  );

  return groupMatches + playoffMatches;
}

export function describeMatchProgress(input: {
  played: number;
  planned: number;
}): MatchProgress {
  /*
    Licznik nigdy nie przekracza mianownika. Gdyby konfiguracja i baza
    kiedykolwiek się rozjechały, kibic ma zobaczyć spójną liczbę,
    a nie „58 / 56".
  */
  const played = Math.max(0, Math.min(input.played, input.planned));

  return {
    played,
    planned: input.planned,
    isComplete: input.planned > 0 && played === input.planned,
  };
}
