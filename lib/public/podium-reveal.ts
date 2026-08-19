/**
 * CEREMONIA PODIUM — czysta logika, bez Reacta i bez DOM.
 *
 * Kolejność odsłaniania, klucz zapamiętania i obsługa awarii storage
 * są testowalne w Node; komponent jest tylko nakładką.
 */

/**
 * Odstęp w OGONIE klasyfikacji (miejsca 4+).
 * Szybszy rytm: to jeszcze nie jest część uroczysta.
 */
export const REVEAL_TAIL_STEP_MS = 480;
/** Odstęp na PODIUM (3 → 2 → 1) — wolniejszy, bo to sedno ceremonii. */
export const REVEAL_PODIUM_STEP_MS = 700;
/**
 * Oddech PRZED wejściem na podium.
 *
 * Bez niego ogon i medaliści zlewają się w jedno odliczanie. Ta pauza
 * jest granicą między „resztą tabeli" a ceremonią.
 */
export const REVEAL_PODIUM_PAUSE_MS = 650;
/** Czas trwania pojedynczego wjazdu. */
export const REVEAL_DURATION_MS = 520;
/** Zwycięzca wjeżdża dłużej — to najmocniejszy moment całej strony. */
export const REVEAL_WINNER_DURATION_MS = 760;
/** Dodatkowa pauza przed zwycięzcą — dramaturgia, nie opóźnienie. */
export const REVEAL_WINNER_EXTRA_MS = 650;
/**
 * Złoty akcent po wjeździe zwycięzcy. Jednorazowy, bez pętli
 * i bez pulsowania — „winner moment", nie migająca dekoracja.
 */
export const WINNER_GLOW_MS = 900;

/* ==========================================================================
 * CEREMONIA MEDALOWA — opadanie, uderzenie, światło
 * ======================================================================== */

/**
 * Medalista nie wjeżdża z boku — jego herb OPADA nad własny stopień.
 *
 * Ruch jest ciężki i kontrolowany: przyspiesza w dół i zatrzymuje się
 * twardo, bo to zatrzymanie jest momentem uderzenia. Żadnego odbicia
 * w stylu kreskówki — to prezentacja sportowa, nie zabawka.
 */
export const PODIUM_DROP_MS = 620;

/** Mikro-drgnięcie stopnia w chwili lądowania. Kilkadziesiąt milisekund. */
export const PODIUM_IMPACT_MS = 150;

/** Snop światła z góry — zaczyna się tuż przed lądowaniem i gaśnie. */
export const PODIUM_BEAM_MS = 700;

/** Amplituda drgnięcia rośnie wraz z rangą miejsca (w pikselach). */
export const PODIUM_SHAKE_PX: Record<number, number> = {
  3: 1,
  2: 2,
  1: 3,
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

/**
 * Kiedy dane miejsce faktycznie „ląduje".
 *
 * Herb startuje z opóźnieniem `delayMs`, opada `PODIUM_DROP_MS`
 * i dopiero wtedy następuje uderzenie, światło i blask.
 */
export function getImpactMs(delayMs: number): number {
  return delayMs + PODIUM_DROP_MS;
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

  return ranked.map((entry, index) => {
    const previous = index > 0 ? ranked[index - 1] : null;

    if (previous) {
      const entersPodium = isPodiumPosition(entry.position);

      // Odstęp zależy od tego, do której części ceremonii wchodzimy.
      elapsed += entersPodium ? REVEAL_PODIUM_STEP_MS : REVEAL_TAIL_STEP_MS;

      // Granica ogon → podium dostaje dodatkowy oddech.
      if (entersPodium && !isPodiumPosition(previous.position)) {
        elapsed += REVEAL_PODIUM_PAUSE_MS;
      }

      if (entry.position === 1) elapsed += REVEAL_WINNER_EXTRA_MS;
    }

    const delayMs = elapsed;

    const item: RevealItem = { key: entry.team.teamId, step, delayMs };

    step += 1;
    return item;
  });
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
    wybrzmi jego uderzenie i złoty rozbłysk. Dopiero wtedy zapisujemy
    „obejrzane".
  */
  return last.delayMs + PODIUM_DROP_MS + WINNER_GLOW_MS;
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
