/**
 * HERO — grafika turnieju.
 *
 * Banner jest projektowany pod pełny kadr, więc wypełnia go w całości
 * na każdym breakpoincie. Wersja z „contain + rozmyta warstwa tła"
 * została porzucona po weryfikacji wzrokowej: robiła z bannera
 * pomniejszony obrazek osadzony w szarej ramce.
 *
 * Czysta funkcja — bez Reacta i bez DOM.
 */

/** Używane, gdy turniej nie ma własnej grafiki. */
export const HERO_FALLBACK_IMAGE = "/images/unknown.jpeg";

export type HeroPresentation = {
  src: string;
  /** Czy to grafika turnieju, czy neutralny zapasowy obrazek. */
  hasCustomArtwork: boolean;
};

export function resolveHeroPresentation(
  heroBannerImage?: string | null
): HeroPresentation {
  const trimmed = heroBannerImage?.trim();

  return {
    src: trimmed || HERO_FALLBACK_IMAGE,
    hasCustomArtwork: Boolean(trimmed),
  };
}
