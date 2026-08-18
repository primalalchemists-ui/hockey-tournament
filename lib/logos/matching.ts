import {
  detectSquadVariant,
  normalizeTeamNameForLogoMatching,
} from "./normalize";

/**
 * DOPASOWANIE NAZWY DRUŻYNY DO LOGO Z BIBLIOTEKI.
 *
 * Kluczowa zasada: automatycznie zaznaczamy WYŁĄCZNIE pewne trafienia
 * (dokładna nazwa albo dokładny alias). Wszystko słabsze jest wyłącznie
 * propozycją — złe logo przypięte w ciemno jest gorsze niż brak logo.
 */

export type LogoMatchType = "exact" | "alias" | "base_name" | "fuzzy" | "none";

/** Minimalny kształt assetu potrzebny do dopasowania. */
export type MatchableLogo = {
  /** Stabilny, nie-UUID identyfikator prezentacyjny. */
  slug: string;
  canonicalName: string;
  normalizedName: string;
  normalizedAliases: string[];
};

export type LogoMatch<T extends MatchableLogo = MatchableLogo> = {
  logo: T;
  matchType: LogoMatchType;
  /** 0-1; wyłącznie do sortowania propozycji. */
  score: number;
};

export type LogoMatchResult<T extends MatchableLogo = MatchableLogo> = {
  /** Trafienie na tyle pewne, że wolno je zaznaczyć bez pytania. */
  autoSelect: LogoMatch<T> | null;
  /** Propozycje do pokazania w sekcji „Polecane” — posortowane malejąco. */
  suggestions: Array<LogoMatch<T>>;
};

/** Ile propozycji ma sens pokazać. */
const MAX_SUGGESTIONS = 6;
/** Poniżej tego progu fuzzy nie zasługuje nawet na propozycję. */
const FUZZY_THRESHOLD = 0.45;

function tokens(value: string): string[] {
  return value.split(" ").filter(Boolean);
}

/**
 * Podobieństwo tokenowe: część wspólna do sumy zbiorów.
 * Wystarczające dla nazw klubów i nie wymaga żadnej zależności.
 */
function similarity(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 1;

  const a = new Set(tokens(left));
  const b = new Set(tokens(right));

  let shared = 0;
  for (const token of a) {
    if (b.has(token)) shared += 1;
  }

  if (shared === 0) return 0;

  const union = new Set([...a, ...b]).size;
  const jaccard = shared / union;

  // Premia za wspólny początek nazwy — „UKS Zagłębie …” vs „UKS Zagłębie …”.
  const prefixBonus = left.startsWith(right) || right.startsWith(left) ? 0.15 : 0;

  return Math.min(1, jaccard + prefixBonus);
}

/**
 * Dopasowuje nazwę drużyny do biblioteki.
 *
 * Kolejność rozstrzygania jest hierarchiczna i celowo zachowawcza:
 *   1. dokładny alias,
 *   2. dokładna nazwa własna,
 *   3. rozpoznany wariant „… 1 / … 2” → nazwa bazowa,
 *   4. luźne podobieństwo (tylko propozycja).
 */
export function matchTeamNameToLogos<T extends MatchableLogo>(
  teamName: string,
  logos: T[]
): LogoMatchResult<T> {
  const normalized = normalizeTeamNameForLogoMatching(teamName);

  if (!normalized || logos.length === 0) {
    return { autoSelect: null, suggestions: [] };
  }

  const variant = detectSquadVariant(teamName);
  const scored: Array<LogoMatch<T>> = [];

  for (const logo of logos) {
    if (logo.normalizedAliases.includes(normalized)) {
      scored.push({ logo, matchType: "alias", score: 1 });
      continue;
    }

    if (logo.normalizedName === normalized) {
      scored.push({ logo, matchType: "exact", score: 1 });
      continue;
    }

    if (
      variant.baseName &&
      (logo.normalizedName === variant.baseName ||
        logo.normalizedAliases.includes(variant.baseName))
    ) {
      scored.push({ logo, matchType: "base_name", score: 0.9 });
      continue;
    }

    const score = Math.max(
      similarity(normalized, logo.normalizedName),
      ...logo.normalizedAliases.map((alias) => similarity(normalized, alias)),
      variant.baseName ? similarity(variant.baseName, logo.normalizedName) : 0
    );

    if (score >= FUZZY_THRESHOLD) {
      scored.push({ logo, matchType: "fuzzy", score });
    }
  }

  const rank: Record<LogoMatchType, number> = {
    alias: 4,
    exact: 3,
    base_name: 2,
    fuzzy: 1,
    none: 0,
  };

  scored.sort((a, b) => {
    const byType = rank[b.matchType] - rank[a.matchType];
    if (byType !== 0) return byType;
    if (b.score !== a.score) return b.score - a.score;
    return a.logo.canonicalName.localeCompare(b.logo.canonicalName);
  });

  const best = scored[0] ?? null;

  /*
    AUTOMATYCZNE ZAZNACZENIE — trzy przypadki, wszystkie DOKŁADNE.

    1. exact  — nazwa własna zgadza się co do znaku (po normalizacji),
    2. alias  — znany wariant nazwy,
    3. base_name — bezpiecznie rozpoznana końcówka „… 1 / … 2", której
       nazwa bazowa daje DOKŁADNIE JEDEN asset.

    Trzeci przypadek to nie fuzzy: usuwamy wyłącznie rozpoznaną cyfrę
    wariantu, a to, co zostaje, musi trafić dokładnie i jednoznacznie.
    Gdy baza pasuje do kilku assetów — nie zgadujemy.
  */
  const baseMatches = scored.filter((match) => match.matchType === "base_name");

  const autoSelect =
    best && (best.matchType === "exact" || best.matchType === "alias")
      ? best
      : baseMatches.length === 1
        ? baseMatches[0]
        : null;

  return {
    autoSelect,
    suggestions: scored.slice(0, MAX_SUGGESTIONS),
  };
}

/** Filtrowanie biblioteki w polu wyszukiwania: nazwa własna + aliasy. */
export function searchLogos<T extends MatchableLogo>(
  query: string,
  logos: T[]
): T[] {
  const normalized = normalizeTeamNameForLogoMatching(query);

  if (!normalized) return logos;

  return logos.filter(
    (logo) =>
      logo.normalizedName.includes(normalized) ||
      logo.normalizedAliases.some((alias) => alias.includes(normalized))
  );
}
