/**
 * NORMALIZACJA NAZW DRUŻYN NA POTRZEBY BIBLIOTEKI LOGOTYPÓW.
 *
 * Czysty moduł: bez IO, bez Reacta, bez bazy. Cała logika dopasowania
 * opiera się na tych funkcjach, więc muszą być w pełni deterministyczne.
 */

/**
 * Mapa polskich znaków.
 *
 * Świadomie NIE używamy NFD + usuwania znaków łączących: ta metoda bywa
 * kaleczona przez narzędzia edycji plików i milcząco przestaje działać.
 * Jawna mapa jest odporna i czytelna.
 */
const DIACRITICS: Record<string, string> = {
  ą: "a",
  ć: "c",
  ę: "e",
  ł: "l",
  ń: "n",
  ó: "o",
  ś: "s",
  ź: "z",
  ż: "z",
};

/**
 * Sprowadza nazwę do postaci porównywalnej:
 * małe litery, bez polskich znaków, separatory jako pojedyncza spacja.
 */
export function normalizeTeamNameForLogoMatching(value: string): string {
  const lowered = value.toLowerCase();

  let stripped = "";
  for (const char of lowered) {
    stripped += DIACRITICS[char] ?? char;
  }

  return stripped
    .replace(/[_\-–—/.,]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Slug do Cloudinary i do stabilnej identyfikacji assetu na zewnątrz. */
export function slugifyLogoName(value: string): string {
  return normalizeTeamNameForLogoMatching(value).replace(/ /g, "-") || "logo";
}

/* ==========================================================================
 * WARIANTY DRUŻYN (GKS Katowice 1 / 2)
 * ======================================================================== */

export type SquadVariant = {
  /** Nazwa bazowa bez końcówki wariantu — null, gdy nie rozpoznano. */
  baseName: string | null;
  /** Rozpoznana końcówka, np. "2". */
  suffix: string | null;
};

/**
 * Rozpoznaje KOŃCOWY numer drużyny ("GKS Katowice 2").
 *
 * Celowo konserwatywnie — obcinamy tylko wtedy, gdy:
 *  - ostatni token to pojedyncza cyfra 1-9,
 *  - po jej usunięciu zostają co najmniej dwa tokeny,
 *  - baza ma sensowną długość.
 *
 * Dzięki temu "MKS Sokoły Toruń" czy "Legia 1926" nie tracą fragmentu
 * nazwy, a "Katowice 1" nie zamienia się w samo "Katowice".
 */
export function detectSquadVariant(name: string): SquadVariant {
  const normalized = normalizeTeamNameForLogoMatching(name);
  const tokens = normalized.split(" ").filter(Boolean);

  if (tokens.length < 3) return { baseName: null, suffix: null };

  const last = tokens[tokens.length - 1];

  if (!/^[1-9]$/.test(last)) return { baseName: null, suffix: null };

  const base = tokens.slice(0, -1).join(" ");

  if (base.length < 4) return { baseName: null, suffix: null };

  return { baseName: base, suffix: last };
}

/**
 * Propozycja nazwy własnej dla NOWEGO logo na podstawie nazwy drużyny.
 *
 * "GKS KATOWICE 2" → "GKS KATOWICE" (bez zmiany wielkości liter i polskich
 * znaków — wyświetlana nazwa należy do człowieka, nie do algorytmu).
 */
export function suggestCanonicalName(teamName: string): string {
  const trimmed = teamName.trim().replace(/\s+/g, " ");
  const variant = detectSquadVariant(trimmed);

  if (!variant.suffix) return trimmed;

  return trimmed.replace(/\s+[1-9]$/, "").trim() || trimmed;
}
