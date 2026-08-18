/**
 * KONTROLER AUTO-ODŚWIEŻANIA — czysta logika, bez Reacta i bez DOM.
 *
 * Dzięki temu cała mechanika (interwał, widoczność karty, brak nakładających
 * się żądań, zachowanie wersji przy błędzie) jest testowalna w Node
 * z fałszywymi timerami, a hook Reacta jest tylko cienką nakładką.
 */

/** Jedna wartość w całej aplikacji. To nie jest live scoring — wyniki
 *  wpisywane są po zakończonym meczu, więc 13 s w zupełności wystarcza. */
export const PUBLIC_REFRESH_INTERVAL_MS = 13_000;

export type PublicVersionPayload = {
  tournamentId: string | null;
  revision: number;
};

export type AutoRefreshDeps<TSnapshot> = {
  /** Lekkie odpytanie o wersję. */
  fetchVersion: (signal: AbortSignal) => Promise<PublicVersionPayload>;
  /** Pełny snapshot — wołany WYŁĄCZNIE po wykryciu zmiany. */
  fetchSnapshot: (signal: AbortSignal) => Promise<{
    tournamentId: string;
    revision: number;
    snapshot: TSnapshot;
  }>;
  /** Wywoływane po udanym pobraniu nowego stanu. */
  onSnapshot: (snapshot: TSnapshot) => void;
  /** Stan początkowy z renderu serwerowego — bez zbędnego fetchu po hydracji. */
  initial: { tournamentId: string | null; revision: number };
  intervalMs?: number;
  onError?: (error: unknown) => void;
};

export type AutoRefreshController = {
  /** Ręczne wywołanie sprawdzenia (widoczność karty, focus okna). */
  check: () => Promise<void>;
  /** Aktualnie znana wersja — zmienia się dopiero po UDANYM pełnym pobraniu. */
  getCurrent: () => { tournamentId: string | null; revision: number };
  isBusy: () => boolean;
  stop: () => void;
};

export function createAutoRefreshController<TSnapshot>(
  deps: AutoRefreshDeps<TSnapshot>
): AutoRefreshController {
  let currentTournamentId = deps.initial.tournamentId;
  let currentRevision = deps.initial.revision;

  let inFlight = false;
  let stopped = false;
  let controller: AbortController | null = null;

  async function check() {
    // Brak nakładających się żądań: dopóki poprzedni cykl trwa,
    // kolejny (z timera, focusu albo powrotu do karty) jest pomijany.
    if (inFlight || stopped) return;

    inFlight = true;
    controller = new AbortController();

    try {
      const version = await deps.fetchVersion(controller.signal);

      const changed =
        version.tournamentId !== currentTournamentId ||
        version.revision !== currentRevision;

      if (!changed) return;

      const result = await deps.fetchSnapshot(controller.signal);

      // Wersję lokalną podnosimy DOPIERO po udanym pobraniu pełnego stanu.
      // Gdyby pobranie padło, następny cykl spróbuje ponownie.
      deps.onSnapshot(result.snapshot);
      currentTournamentId = result.tournamentId;
      currentRevision = result.revision;
    } catch (error) {
      // Awaria sieci nie może zepsuć widoku — zostawiamy ostatnie dobre dane.
      deps.onError?.(error);
    } finally {
      inFlight = false;
      controller = null;
    }
  }

  return {
    check,
    getCurrent: () => ({
      tournamentId: currentTournamentId,
      revision: currentRevision,
    }),
    isBusy: () => inFlight,
    stop: () => {
      stopped = true;
      controller?.abort();
      controller = null;
    },
  };
}

/**
 * Wybór grupy po odświeżeniu.
 *
 * Zachowujemy wybór kibica; resetujemy tylko wtedy, gdy poprzednia grupa
 * przestała istnieć (np. po zmianie wyświetlanego turnieju).
 */
export function resolveSelectedGroupKey(
  previousKey: string | undefined,
  availableKeys: string[]
): string | undefined {
  if (previousKey && availableKeys.includes(previousKey)) {
    return previousKey;
  }

  return availableKeys[0];
}
