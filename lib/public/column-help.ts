/**
 * OPISY SKRÓTÓW KOLUMN.
 *
 * Jedno źródło prawdy dla rankingu i minigrupy. Wcześniej te same
 * objaśnienia żyły w osobnym bloku „Legenda kolumn" pod tabelą —
 * blok generował clutter, a znaczenie skrótu i tak było daleko
 * od kolumny, której dotyczyło.
 */

export const COLUMN_HELP = {
  M: "Mecze rozegrane",
  W: "Wygrane",
  R: "Remisy",
  P: "Przegrane",
  Pkt: "Punkty",
  "G+": "Bramki zdobyte",
  "G-": "Bramki stracone",
  "Bil.": "Różnica bramek",
} as const;

export type ColumnCode = keyof typeof COLUMN_HELP;

/** Kolejność kolumn w pełnej tabeli rankingu. */
export const STANDINGS_COLUMNS: ColumnCode[] = [
  "M",
  "W",
  "R",
  "P",
  "Pkt",
  "G+",
  "G-",
  "Bil.",
];

export function describeColumn(code: ColumnCode): string {
  return COLUMN_HELP[code];
}
