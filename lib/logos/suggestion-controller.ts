/**
 * KONTROLER PODPOWIEDZI LOGO — czysta logika, bez Reacta i bez DOM.
 *
 * Rozwiązuje jeden konkretny problem: przy szybkim pisaniu
 * ("UKS" → "UKS Zagłębie" → "UKS Zagłębie Sosnowiec 1") odpowiedzi
 * wracają w dowolnej kolejności. Wolniejsza, STARSZA odpowiedź nie może
 * nadpisać nowszej — kibicowi pokazalibyśmy podpowiedź do tekstu,
 * którego już nie ma w polu.
 */

export type SuggestionResult<T> = {
  /** Zapytanie, dla którego policzono wynik. */
  query: string;
  value: T;
};

export type SuggestionController<T> = {
  /**
   * Rejestruje nowe zapytanie i zwraca funkcję przyjmującą wynik.
   * Zwraca `true`, gdy wynik jest nadal aktualny i wolno go pokazać.
   */
  begin: (query: string) => (value: T) => SuggestionResult<T> | null;
  /** Ostatnie zapytanie, jakie zostało zarejestrowane. */
  latest: () => string;
};

export function createSuggestionController<T>(): SuggestionController<T> {
  let sequence = 0;
  let latestQuery = "";

  return {
    begin(query: string) {
      sequence += 1;
      latestQuery = query;

      const ticket = sequence;

      return (value: T) => {
        // Wynik starszego zapytania jest po prostu porzucany.
        if (ticket !== sequence) return null;

        return { query, value };
      };
    },

    latest() {
      return latestQuery;
    },
  };
}
