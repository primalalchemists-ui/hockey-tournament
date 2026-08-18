/**
 * CEREMONIA PODIUM — czysta logika, bez Reacta i bez DOM.
 *
 * Kolejność odsłaniania, klucz zapamiętania i obsługa awarii storage
 * są testowalne w Node; komponent jest tylko nakładką.
 */

/** Odstęp między kolejnymi drużynami. Dla 7 drużyn daje ~2,2 s całości. */
export const REVEAL_STEP_MS = 260;
/** Czas trwania pojedynczego wjazdu. */
export const REVEAL_DURATION_MS = 420;
/** Dodatkowa pauza przed zwycięzcą — dramaturgia, nie opóźnienie. */
export const REVEAL_WINNER_EXTRA_MS = 220;

export type RevealItem = {
  /** Klucz stabilny w obrębie ceremonii. */
  key: string;
  /** Kolejność wejścia: 0 = pierwszy wjeżdża (ostatnie miejsce). */
  step: number;
  delayMs: number;
};

type EntryLike = {
  position: number | null;
  shared: boolean;
  team: { teamId: string };
};

/**
 * Kolejność odsłaniania: OD OSTATNIEGO miejsca DO PIERWSZEGO.
 *
 * Dla N sklasyfikowanych drużyn: N → … → 3 → 2 → 1.
 * Nie zakłada żadnej konkretnej liczby drużyn.
 * Miejsca dzielone (np. 3–4 bez meczu o 3. miejsce) wchodzą razem,
 * w miejscu odpowiadającym ich pozycji.
 */
export function buildRevealOrder(entries: EntryLike[]): RevealItem[] {
  // Sortujemy malejąco po pozycji; dzielone traktujemy jak najsłabsze
  // z możliwych miejsc, żeby weszły przed medalistami.
  const ranked = [...entries].sort((a, b) => {
    const left = a.position ?? Number.MAX_SAFE_INTEGER;
    const right = b.position ?? Number.MAX_SAFE_INTEGER;
    return right - left;
  });

  let step = 0;

  return ranked.map((entry) => {
    const isWinner = entry.position === 1;
    const delayMs =
      step * REVEAL_STEP_MS + (isWinner ? REVEAL_WINNER_EXTRA_MS : 0);

    const item: RevealItem = {
      key: entry.team.teamId,
      step,
      delayMs,
    };

    step += 1;
    return item;
  });
}

/** Łączny czas ceremonii — po nim zapisujemy „obejrzane”. */
export function getRevealTotalMs(items: RevealItem[]): number {
  if (items.length === 0) return 0;

  const last = items[items.length - 1];
  return last.delayMs + REVEAL_DURATION_MS;
}

/* ==========================================================================
 * ZAPAMIĘTANIE CEREMONII
 * ======================================================================== */

/**
 * Klucz per turniej, per pula i per FINALIZACJA.
 *
 * `completionToken` (completed_at) sprawia, że po cofnięciu i ponownym
 * zakończeniu turnieju kibic zobaczy nową ceremonię — a zmiana bannera
 * czy tickera jej nie wznowi.
 */
export function buildPodiumStorageKey(input: {
  tournamentId: string;
  scopeKey: string;
  completionToken: string;
}): string {
  return `podiumRevealSeen:${input.tournamentId}:${input.scopeKey}:${input.completionToken}`;
}

/** Odczyt odporny na wyłączony / niedostępny storage. */
export function hasSeenReveal(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    // Brak storage nie może wywalić podium — traktujemy jak "nieoglądane".
    return false;
  }
}

export function markRevealSeen(key: string): void {
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    // Świadomie ignorujemy — ceremonia po prostu pokaże się ponownie.
  }
}
