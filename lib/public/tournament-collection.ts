import { normalizeColorToHex, relativeLuminance, hexToRgb } from "./color";

/**
 * PRZEŁĄCZNIK KATEGORII — czysta logika, bez Reacta i bez DOM.
 *
 * Świadomie generyczne: domena nie wie, czy „U8" oznacza rocznik, dywizję
 * czy płeć. Etykieta jest krótkim tekstem wybranym przez administratora.
 */

/** Domyślny kolor bąbelka — spokojny granat z systemu ice/navy. */
export const DEFAULT_BUBBLE_COLOR = "#1E3A5F";

/** Etykieta ma zmieścić się w bąbelku także na telefonie. */
export const MAX_CATEGORY_LABEL = 16;

export const LABEL_REQUIRED_ERROR = "Podaj etykietę kategorii.";
export const LABEL_TOO_LONG_ERROR = `Etykieta może mieć maksymalnie ${MAX_CATEGORY_LABEL} znaków.`;
export const LABEL_DUPLICATE_ERROR =
  "Taka etykieta jest już użyta w tym wydarzeniu.";

/**
 * Przycięta etykieta albo null, gdy pusta.
 *
 * ŻADNEGO wzorca w rodzaju `U[0-9]+` — to nie jest funkcja o rocznikach.
 */
export function normalizeCategoryLabel(
  input: string | null | undefined
): string | null {
  const value = input?.trim();

  if (!value) return null;
  if (value.length > MAX_CATEGORY_LABEL) return null;

  return value;
}

export function describeLabelError(
  input: string | null | undefined
): string | null {
  const value = input?.trim() ?? "";

  if (!value) return LABEL_REQUIRED_ERROR;
  if (value.length > MAX_CATEGORY_LABEL) return LABEL_TOO_LONG_ERROR;

  return null;
}

/**
 * Kolor tekstu dobierany AUTOMATYCZNIE do tła bąbelka.
 *
 * Administrator wybiera jeden kolor; o czytelności decyduje jasność
 * postrzegana, a nie jego wyczucie. Próg 0,6 daje ciemny tekst na żółciach
 * i jasnych błękitach, a jasny na granatach i czerwieniach.
 */
export function pickReadableTextColor(background: string): "light" | "dark" {
  const rgb = hexToRgb(normalizeColorToHex(background) ?? DEFAULT_BUBBLE_COLOR);

  if (!rgb) return "light";

  return relativeLuminance(rgb) > 0.6 ? "dark" : "light";
}

/**
 * Propozycja etykiety z tytułu turnieju.
 *
 * Wyłącznie podpowiedź do pola w panelu — administrator zawsze może ją
 * nadpisać. Bierzemy ostatni człon po myślniku („SUN CUP 2026 — U8" → „U8"),
 * bo taka jest konwencja nazw, a nie dlatego, że „U8" cokolwiek znaczy.
 */
export function suggestCategoryLabel(title: string): string {
  const parts = title.split(/[—–-]/);
  const last = parts[parts.length - 1]?.trim() ?? "";

  if (last && last.length <= MAX_CATEGORY_LABEL && last !== title.trim()) {
    return last;
  }

  return title.trim().slice(0, MAX_CATEGORY_LABEL);
}

export type CategoryLike = {
  tournamentId: string;
  label: string;
  bubbleColor: string;
};

/** Czy przełącznik ma się w ogóle pojawić. */
export function shouldShowSwitcher(
  categories: CategoryLike[] | null | undefined
): boolean {
  return (categories?.length ?? 0) >= 2;
}

/** Etykieta aktualnie oglądanej kategorii. */
export function findCategory(
  categories: CategoryLike[] | null | undefined,
  tournamentId: string | null
): CategoryLike | null {
  if (!categories || !tournamentId) return null;

  return categories.find((item) => item.tournamentId === tournamentId) ?? null;
}
