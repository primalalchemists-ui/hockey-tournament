/**
 * SEKCJA CAMPU — czysta logika, bez Reacta i bez DOM.
 *
 * Dwie decyzje, które wcześniej były zaszyte w komponencie:
 * jaki napis zobaczy rodzic i czy przycisk „Zapisz się" cokolwiek robi.
 */

/** Napis pokazywany, gdy administrator nie ustawił własnego. */
export const CAMP_DEFAULT_TITLE = "Najbliższy camp";

export type CampPresentation = {
  title: string;
  /** Czy przycisk zapisów jest aktywny. */
  canRegister: boolean;
  /** Adres zapisów — wyłącznie gdy zapisy są otwarte. */
  registrationUrl: string | null;
};

/**
 * Bezpieczny adres zapisów.
 *
 * Do publicznego linku wpuszczamy WYŁĄCZNIE http(s). Adresy w rodzaju
 * `javascript:` czy `data:` nie mogą trafić do atrybutu href — to jest
 * granica bezpieczeństwa, nie kwestia wygody.
 */
export function isValidRegistrationUrl(value: string | null | undefined): boolean {
  const trimmed = value?.trim();
  if (!trimmed) return false;

  try {
    const url = new URL(trimmed);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function describeCamp(input: {
  title?: string | null;
  registrationEnabled?: boolean | null;
  registrationUrl?: string | null;
}): CampPresentation {
  const title = input.title?.trim() || CAMP_DEFAULT_TITLE;

  /*
    Zapisy są otwarte tylko wtedy, gdy administrator je włączył ORAZ zapisany
    adres jest poprawny. Sam włącznik nie wystarczy — pusty href zamieniłby
    przycisk w atrapę prowadzącą donikąd.
  */
  const enabled = input.registrationEnabled ?? true;
  const url = input.registrationUrl?.trim() ?? "";

  if (!enabled || !isValidRegistrationUrl(url)) {
    return { title, canRegister: false, registrationUrl: null };
  }

  return { title, canRegister: true, registrationUrl: url };
}

/** Komunikat walidacji dla panelu — po polsku, bez żargonu. */
export const CAMP_URL_ERROR = "Podaj poprawny link do zapisów.";
