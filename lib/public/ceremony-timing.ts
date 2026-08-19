/**
 * TEMPO CEREMONII — jedno miejsce na wszystkie liczby.
 *
 * Wcześniej wartości czasu były rozrzucone między modułem odsłaniania,
 * komponentem i arkuszem stylów. Tutaj mieszka komplet, a JSX i CSS tylko
 * je odczytują.
 *
 * Charakter, który te liczby mają dawać: im bliżej podium, tym dłużej
 * trzeba czekać. Ogon nie odlicza równo — narasta.
 */

export const CEREMONY = {
  /** Odstęp po pierwszym (najsłabszym) miejscu w ogonie. */
  tailBaseMs: 620,
  /** O tyle rośnie każdy kolejny odstęp w ogonie. */
  tailIncrementMs: 180,
  /** Górny limit odstępu — chroni ceremonię dla 10 i 16 drużyn. */
  tailCapMs: 1200,

  /** Wyraźna cisza po miejscu 4: „teraz zaczynają się medale". */
  prePodiumPauseMs: 900,

  /** Oczekiwanie na brąz liczone od ostatniego miejsca ogona. */
  bronzeDelayMs: 900,
  /** Oczekiwanie na srebro po brązie. */
  silverDelayMs: 1050,
  /** Oczekiwanie na złoto po srebrze — najdłuższe w całej ceremonii. */
  winnerDelayMs: 1250,

  /** Ile trwa opadanie herbu medalisty nad swój stopień. */
  dropDurationMs: 620,
  /** Wjazd wiersza w ogonie — sam fade i delikatne uniesienie. */
  tailDurationMs: 520,

  /** Snop światła z góry; startuje jeszcze przed lądowaniem. */
  beamDurationMs: 760,
  /** Ile snop wyprzedza uderzenie. */
  beamLeadMs: 420,

  /** Platforma reaguje na uderzenie z chwilą zwłoki, nie w tej samej klatce. */
  glowDelayMs: 140,
  /** Blask narasta łagodnie, zamiast zapalać się natychmiast. */
  glowFadeMs: 600,

  /** Mikroreakcja stopnia i całej sceny. */
  impactDurationMs: 150,
  stageShakeMs: 160,
} as const;

/**
 * Odstęp przed kolejnym miejscem w ogonie.
 *
 * `step` = 0 dla przejścia z ostatniego miejsca na przedostatnie i rośnie
 * w stronę czwórki. Dzięki limitowi ceremonia dla szesnastu drużyn nie
 * rozciąga się w nieskończoność.
 */
export function tailGapMs(step: number): number {
  const raw = CEREMONY.tailBaseMs + step * CEREMONY.tailIncrementMs;

  return Math.min(raw, CEREMONY.tailCapMs);
}

/** Kiedy medalista dotyka swojego stopnia. */
export function impactAtMs(delayMs: number): number {
  return delayMs + CEREMONY.dropDurationMs;
}

/** Kiedy blask zaczyna narastać — chwilę PO uderzeniu. */
export function glowAtMs(delayMs: number): number {
  return impactAtMs(delayMs) + CEREMONY.glowDelayMs;
}

/** Kiedy z góry rusza snop światła. */
export function beamAtMs(delayMs: number): number {
  return impactAtMs(delayMs) - CEREMONY.beamLeadMs;
}
