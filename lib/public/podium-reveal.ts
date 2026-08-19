import {
  CEREMONY,
  impactAtMs,
  tailGapMs,
} from "./ceremony-timing";

/**
 * CEREMONIA PODIUM — czysta logika, bez Reacta i bez DOM.
 *
 * Kolejność odsłaniania, klucz zapamiętania i obsługa awarii storage
 * są testowalne w Node; komponent jest tylko nakładką.
 */

/*
  Wszystkie liczby czasu mieszkają w lib/public/ceremony-timing.ts.
  Tutaj zostaje wyłącznie kolejność i wyliczenie opóźnień.
*/

/** Czas trwania pojedynczego wjazdu w ogonie klasyfikacji. */
export const REVEAL_DURATION_MS = CEREMONY.tailDurationMs;
/** Zwycięzca opada dłużej — to najmocniejszy moment całej strony. */
export const REVEAL_WINNER_DURATION_MS = CEREMONY.dropDurationMs;

/** Amplituda drgnięcia stopnia rośnie wraz z rangą miejsca (w pikselach). */
export const PODIUM_SHAKE_PX: Record<number, number> = {
  3: 1,
  2: 2,
  1: 3,
};

/**
 * Mikroreakcja CAŁEJ sceny podium — osobna i słabsza od reakcji stopnia.
 * Scena to wnętrze karty klasyfikacji, nigdy strona ani <body>.
 */
export const STAGE_SHAKE_PX: Record<number, number> = {
  3: 0.8,
  2: 1.4,
  1: 2.2,
};

/**
 * Krótki impuls wibracji przy lądowaniu — wyłącznie jako wzmocnienie,
 * nigdy jako wzorzec alarmowy.
 */
export const PODIUM_HAPTIC_MS: Record<number, number> = {
  3: 12,
  2: 20,
  1: 35,
};

export const PODIUM_DROP_MS = CEREMONY.dropDurationMs;
export const PODIUM_IMPACT_MS = CEREMONY.impactDurationMs;
export const PODIUM_BEAM_MS = CEREMONY.beamDurationMs;

/**
 * Kiedy dane miejsce faktycznie „ląduje".
 *
 * Herb startuje z opóźnieniem `delayMs`, opada `dropDurationMs`
 * i dopiero wtedy następuje uderzenie, światło i blask.
 */
export function getImpactMs(delayMs: number): number {
  return impactAtMs(delayMs);
}

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

/** Miejsca 1-3 to podium; reszta należy do ogona klasyfikacji. */
function isPodiumPosition(position: number | null): boolean {
  return position !== null && position <= 3;
}

/**
 * Kolejność odsłaniania: OD OSTATNIEGO miejsca DO PIERWSZEGO.
 *
 * Dla N sklasyfikowanych drużyn: N → … → 3 → 2 → 1.
 * Nie zakłada żadnej konkretnej liczby drużyn — rytm powstaje z reguł,
 * a nie z tabeli opóźnień dla siedmiu drużyn.
 *
 * Rytm jest TRZYCZĘŚCIOWY:
 *
 *   1. ogon (4+)  — spokojne, równe odstępy,
 *   2. oddech     — wyraźna pauza przed pierwszym medalem,
 *   3. podium     — wolniej, a przed zwycięzcą jeszcze jedna pauza.
 *
 * Dla siedmiu drużyn daje to ~4,8 s: na tyle długo, żeby to była
 * ceremonia, i na tyle krótko, żeby nikt nie odchodził od telefonu.
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
  let elapsed = 0;
  let tailStep = 0;

  return ranked.map((entry, index) => {
    const previous = index > 0 ? ranked[index - 1] : null;

    if (previous) {
      elapsed += gapBefore(entry.position, previous.position, tailStep);

      // Licznik narastania dotyczy wyłącznie ogona klasyfikacji.
      if (!isPodiumPosition(entry.position)) tailStep += 1;
    }

    const item: RevealItem = { key: entry.team.teamId, step, delayMs: elapsed };

    step += 1;
    return item;
  });
}

/**
 * Odstęp PRZED danym miejscem.
 *
 * Ogon narasta (`tailGapMs`), wejście na podium poprzedza wyraźna cisza,
 * a każdy kolejny medal każe czekać dłużej niż poprzedni.
 */
function gapBefore(
  position: number | null,
  previousPosition: number | null,
  tailStep: number
): number {
  const entersPodium = isPodiumPosition(position);

  if (!entersPodium) return tailGapMs(tailStep);

  // Granica ogon → podium: moment, w którym zaczynają się medale.
  if (!isPodiumPosition(previousPosition)) {
    return CEREMONY.prePodiumPauseMs + CEREMONY.bronzeDelayMs;
  }

  if (position === 1) return CEREMONY.winnerDelayMs;

  return CEREMONY.silverDelayMs;
}

/** Czas wjazdu jednego wiersza; zwycięzca wjeżdża dłużej. */
export function getRevealDurationMs(position: number | null): number {
  return position === 1 ? REVEAL_WINNER_DURATION_MS : REVEAL_DURATION_MS;
}

/**
 * Łączny czas ceremonii — po nim zapisujemy „obejrzane”.
 *
 * Ostatni wjazd to zwycięzca, więc liczy się jego dłuższy czas trwania.
 */
export function getRevealTotalMs(items: RevealItem[]): number {
  if (items.length === 0) return 0;

  const last = items[items.length - 1];

  /*
    Ceremonia kończy się nie w chwili, gdy zwycięzca doleci, tylko gdy
    wybrzmi jego uderzenie i rozjaśni się złoty blask. Dopiero wtedy
    zapisujemy „obejrzane".
  */
  return (
    last.delayMs +
    CEREMONY.dropDurationMs +
    CEREMONY.glowDelayMs +
    CEREMONY.glowFadeMs
  );
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
