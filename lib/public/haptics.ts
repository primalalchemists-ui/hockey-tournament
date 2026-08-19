/**
 * HAPTYKA CEREMONII — wyłącznie wzmocnienie, nigdy warunek działania.
 *
 * Krótki impuls przy lądowaniu medalisty. Wszystko tutaj jest opcjonalne:
 * brak API, zablokowana zgoda, ukryta karta czy wyłączone animacje
 * oznaczają po prostu ciszę — bez błędu, bez komunikatu i bez ponawiania.
 */

/** Czy urządzenie w ogóle udostępnia wibrację. */
export function supportsHaptics(): boolean {
  return (
    typeof navigator !== "undefined" && typeof navigator.vibrate === "function"
  );
}

export type HapticContext = {
  /** Ceremonia oglądana teraz, a nie odtworzona ze stanu „obejrzane". */
  isLiveReveal: boolean;
  /** Użytkownik prosi o ograniczenie ruchu — wtedy także ciszej. */
  reducedMotion: boolean;
  /** Karta przeglądarki jest widoczna. */
  documentVisible: boolean;
};

/**
 * Czy w tym momencie wolno zawibrować.
 *
 * Czysta decyzja, bez sięgania do DOM — dzięki temu wszystkie reguły
 * bezpieczeństwa dają się przetestować w Node.
 */
export function shouldVibrate(context: HapticContext): boolean {
  if (!context.isLiveReveal) return false;
  if (context.reducedMotion) return false;
  if (!context.documentVisible) return false;

  return true;
}

/**
 * Pojedynczy impuls. Świadomie NIE przyjmuje wzorca tablicowego:
 * ceremonia ma przypominać lekkie uderzenie, a nie alarm telefonu.
 */
export function pulse(durationMs: number, context: HapticContext): boolean {
  if (!shouldVibrate(context)) return false;
  if (!supportsHaptics()) return false;

  try {
    navigator.vibrate(durationMs);
    return true;
  } catch {
    // Przeglądarka może odmówić (polityka, brak gestu użytkownika).
    // To nie jest błąd aplikacji — po prostu nie ma wibracji.
    return false;
  }
}
