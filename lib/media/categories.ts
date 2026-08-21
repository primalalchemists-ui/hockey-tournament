/**
 * KATEGORIE MEDIÓW — jedno miejsce, w którym wiadomo, co gdzie pasuje.
 *
 * `tournament_assets.kind` mówi, GDZIE grafika jest użyta. To za mało, żeby
 * zbudować sensowny wybór: lewy i prawy plakat campu to dwa różne `kind`,
 * ale ta sama pula do wyboru. Tło drabinki i tło podium — tak samo.
 *
 * Kategoria odpowiada więc na inne pytanie: „co wolno wstawić w to pole".
 * Dzięki temu picker nigdy nie pokazuje jednego śmietnika ze wszystkim,
 * a regulamin w PDF-ie nie trafia na listę banerów.
 */

export type MediaCategory =
  | "schedule"
  | "regulation"
  | "hero_banner"
  | "camp_banner"
  | "camp_poster"
  | "background";

/** Sposób pokazania podglądu — dokument nie jest miniaturką. */
export type MediaPreviewVariant = "image" | "document";

export type MediaCategoryDefinition = {
  /**
   * Etykieta przycisku dodawania — z RODZAJEM GRAMATYCZNYM.
   *
   * „Dodaj nową grafikę", ale „Dodaj nowy banner" i „Dodaj nowe tło".
   * Komponent jest generyczny i nie ma jak tego zgadnąć, więc dostaje
   * gotowy tekst zamiast sklejać go z fragmentów.
   */
  addNewLabel: string;
  /** Wartości `tournament_assets.kind` należące do tej puli. */
  kinds: string[];
  /** Co przyjmuje `<input type="file">` przy wgrywaniu nowego pliku. */
  accept: string;
  /** Czy pole dopuszcza dokumenty (PDF), czy wyłącznie obrazy. */
  allowsDocuments: boolean;
  previewVariant: MediaPreviewVariant;
};

export const MEDIA_CATEGORIES: Record<MediaCategory, MediaCategoryDefinition> = {
  /*
    Harmonogram i regulamin bywają skanem albo PDF-em — dlatego jako jedyne
    dopuszczają dokumenty i mają własny podgląd.
  */
  schedule: {
    addNewLabel: "Dodaj nowy",
    kinds: ["schedule"],
    accept: "application/pdf,image/*",
    allowsDocuments: true,
    previewVariant: "document",
  },
  regulation: {
    addNewLabel: "Dodaj nowy",
    kinds: ["regulation"],
    accept: "application/pdf,image/*",
    allowsDocuments: true,
    previewVariant: "document",
  },

  hero_banner: {
    addNewLabel: "Dodaj nowy",
    kinds: ["hero_banner"],
    accept: "image/*",
    allowsDocuments: false,
    previewVariant: "image",
  },
  camp_banner: {
    addNewLabel: "Dodaj nowy",
    kinds: ["camp_banner"],
    accept: "image/*",
    allowsDocuments: false,
    previewVariant: "image",
  },

  /** Lewy i prawy plakat dzielą jedną pulę — to ten sam rodzaj grafiki. */
  camp_poster: {
    addNewLabel: "Dodaj nowy",
    kinds: ["camp_poster_left", "camp_poster_right"],
    accept: "image/*",
    allowsDocuments: false,
    previewVariant: "image",
  },

  /** Tła sekcji play-off i podium są wymienne. */
  background: {
    addNewLabel: "Dodaj nowe",
    kinds: ["playoff_bracket_background", "podium_background"],
    accept: "image/*",
    allowsDocuments: false,
    previewVariant: "image",
  },
};

export const isMediaCategory = (value: string): value is MediaCategory =>
  Object.prototype.hasOwnProperty.call(MEDIA_CATEGORIES, value);

/** Czy plik o takim typie w ogóle nadaje się do tego pola. */
export function acceptsMimeType(
  category: MediaCategory,
  mimeType: string
): boolean {
  const definition = MEDIA_CATEGORIES[category];
  const normalized = (mimeType || "").toLowerCase();

  if (definition.allowsDocuments) return true;

  /*
    Pole obrazkowe odrzuca dokumenty. Pusty typ przepuszczamy: starsze
    rekordy bywają bez `mime_type`, a wykluczenie ich ukryłoby grafiki,
    które realnie działają.
  */
  return !normalized.startsWith("application/");
}

/** Jak pokazać konkretny plik — PDF nigdy jako miniaturka. */
export function previewVariantFor(
  category: MediaCategory,
  mimeType: string
): MediaPreviewVariant {
  const normalized = (mimeType || "").toLowerCase();

  if (normalized.startsWith("application/")) return "document";
  if (normalized.startsWith("image/")) return "image";

  return MEDIA_CATEGORIES[category].previewVariant;
}
