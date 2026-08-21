"use client";

import { useEffect, useRef, useState } from "react";

import {
  PUBLIC_REFRESH_INTERVAL_MS,
  createAutoRefreshController,
} from "@/lib/public/auto-refresh";
import type { PlayoffStateView } from "@/lib/data/postgres/playoff-engine";
import type { Tournament } from "@/types/tournament";
import type { TournamentStructure } from "@/types/tournament-config";
import { BRAND_LOADER_PULSE_MS } from "@/components/brand-loader";

/**
 * Ile NAJKRÓCEJ trwa ekran ładowania przy zmianie kategorii.
 *
 * Snapshot potrafi wrócić w sto milisekund i wtedy loader tylko mrugnie —
 * a mignięcie czyta się jak usterka, nie jak wczytywanie. Jeden pełny puls
 * logo to najkrótszy czas, po którym widać, że aplikacja czegoś szuka.
 */
const MIN_SWITCH_MS = BRAND_LOADER_PULSE_MS;

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });

export type PublicSnapshotShape = {
  tournamentId: string;
  revision: number;
  tournament: Tournament;
  settings: { structure: TournamentStructure; scorersEnabled: boolean };
  playoffState: PlayoffStateView | null;
  plannedMatchCount: number;
  playedMatchCount: number;
};

type Options = {
  initialTournamentId: string | null;
  initialRevision: number;
  initialTournament: Tournament;
  initialStructure: TournamentStructure;
  initialScorersEnabled: boolean;
  initialPlayoffState: PlayoffStateView | null;
  initialPlannedMatchCount: number;
  initialPlayedMatchCount: number;
};

/**
 * Cienka nakładka Reacta na czysty kontroler auto-odświeżania.
 *
 * Cała logika cykli, widoczności i braku nakładających się żądań żyje
 * w lib/public/auto-refresh.ts i jest testowana bez DOM.
 */
export function usePublicAutoRefresh(options: Options) {
  /*
    CEL ODPYTYWANIA.

    Przełącznik kategorii zmienia wyłącznie ten identyfikator — nigdy
    `is_current` w bazie. Od chwili zmiany zarówno polling, jak i pełne
    pobranie snapshotu dotyczą WYBRANEJ kategorii, a nie turnieju
    wyświetlanego globalnie.
  */
  const [targetId, setTargetId] = useState(options.initialTournamentId);
  const [isSwitching, setIsSwitching] = useState(false);
  const [tournament, setTournament] = useState(options.initialTournament);
  const [structure, setStructure] = useState(options.initialStructure);
  const [scorersEnabled, setScorersEnabled] = useState(
    options.initialScorersEnabled
  );
  const [playoffState, setPlayoffState] = useState(options.initialPlayoffState);
  const [plannedMatchCount, setPlannedMatchCount] = useState(
    options.initialPlannedMatchCount
  );
  const [playedMatchCount, setPlayedMatchCount] = useState(
    options.initialPlayedMatchCount
  );
  /** Rośnie po KAŻDYM udanym zastosowaniu snapshotu — mikro-feedback w UI. */
  const [refreshTick, setRefreshTick] = useState(0);

  /** Ostatnio zastosowana wersja — punkt startowy nowego kontrolera. */
  const revisionRef = useRef(options.initialRevision);

  // Ref, żeby zmiana danych nie tworzyła nowego kontrolera.
  const applyRef = useRef((snapshot: PublicSnapshotShape) => {
    setTournament(snapshot.tournament);
    setStructure(snapshot.settings.structure);
    // Wyłączenie klasyfikacji w panelu znika u kibica bez przeładowania.
    setScorersEnabled(snapshot.settings.scorersEnabled);
    setPlayoffState(snapshot.playoffState);
    setPlannedMatchCount(snapshot.plannedMatchCount);
    setPlayedMatchCount(snapshot.playedMatchCount);
    setRefreshTick((tick) => tick + 1);
  });

  useEffect(() => {
    const controller = createAutoRefreshController<PublicSnapshotShape>({
      initial: { tournamentId: targetId, revision: revisionRef.current },
      intervalMs: PUBLIC_REFRESH_INTERVAL_MS,
      fetchVersion: async (signal) => {
        const response = await fetch(versionUrl(targetId), {
          signal,
          cache: "no-store",
        });

        if (!response.ok) throw new Error(`version ${response.status}`);
        return response.json();
      },
      fetchSnapshot: async (signal) => {
        const response = await fetch(snapshotUrl(targetId), {
          signal,
          cache: "no-store",
        });

        if (!response.ok) throw new Error(`snapshot ${response.status}`);

        const snapshot = (await response.json()) as PublicSnapshotShape;

        return {
          tournamentId: snapshot.tournamentId,
          revision: snapshot.revision,
          snapshot,
        };
      },
      onSnapshot: (snapshot) => {
        revisionRef.current = snapshot.revision;
        applyRef.current(snapshot);
      },
      onError: (error) => {
        // Cicho: kibic nie dostaje alertów, ostatnie dobre dane zostają.
        console.warn("[public] auto-refresh failed", error);
      },
    });

    function isVisible() {
      return typeof document === "undefined" || !document.hidden;
    }

    // Polling wyłącznie przy widocznej karcie.
    const timer = window.setInterval(() => {
      if (isVisible()) void controller.check();
    }, PUBLIC_REFRESH_INTERVAL_MS);

    // Powrót do karty / okna => natychmiastowe sprawdzenie,
    // bez czekania na kolejny cykl. Guard w kontrolerze zapobiega
    // podwójnym żądaniom, gdy oba zdarzenia wystrzelą naraz.
    function handleVisibility() {
      if (isVisible()) void controller.check();
    }

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
      controller.stop();
    };
    /*
      Kontroler przebudowuje się WYŁĄCZNIE przy zmianie kategorii. Sprzątanie
      woła `controller.stop()`, więc żądanie w locie dla poprzedniego turnieju
      zostaje przerwane i jego odpowiedź nie może już nadpisać widoku.
      eslint-disable-next-line react-hooks/exhaustive-deps
    */
  }, [targetId]);

  /**
   * Przełączenie kategorii.
   *
   * Widok wymienia się ATOMOWO. Żadna sekcja nie aktualizuje się osobno:
   * dopóki trwa pobieranie, `isSwitching` trzyma na wierzchu ekran ładowania,
   * a dane podmieniają się dopiero wtedy, gdy jest komplet. Nieudane pobranie
   * zostawia poprzednią kategorię nietkniętą i zwraca `false`.
   */
  async function switchTournament(nextId: string): Promise<boolean> {
    if (nextId === targetId || isSwitching) return false;

    setIsSwitching(true);
    const startedAt = Date.now();

    try {
      const response = await fetch(snapshotUrl(nextId), { cache: "no-store" });

      if (!response.ok) throw new Error(`snapshot ${response.status}`);

      const snapshot = (await response.json()) as PublicSnapshotShape;

      revisionRef.current = snapshot.revision;
      applyRef.current(snapshot);
      // Dopiero teraz polling zaczyna dotyczyć nowej kategorii.
      setTargetId(snapshot.tournamentId);

      return true;
    } catch (error) {
      console.warn("[public] category switch failed", error);
      return false;
    } finally {
      /*
        Nowe dane są już zastosowane, ale ekran ładowania jeszcze je zasłania.
        Kibic widzi więc: stary turniej, ładowanie, KOMPLETNY nowy turniej —
        nigdy pół jednego i pół drugiego.
      */
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_SWITCH_MS) await wait(MIN_SWITCH_MS - elapsed);

      setIsSwitching(false);
    }
  }

  return {
    tournament,
    structure,
    scorersEnabled,
    playoffState,
    plannedMatchCount,
    playedMatchCount,
    refreshTick,
    selectedTournamentId: targetId,
    isSwitching,
    switchTournament,
  };
}

/** Adresy odpytań — bez parametru dla turnieju wyświetlanego globalnie. */
function versionUrl(tournamentId: string | null): string {
  return tournamentId
    ? `/api/tournament/version?tournamentId=${encodeURIComponent(tournamentId)}`
    : "/api/tournament/version";
}

function snapshotUrl(tournamentId: string | null): string {
  return tournamentId
    ? `/api/tournament/snapshot?tournamentId=${encodeURIComponent(tournamentId)}`
    : "/api/tournament/snapshot";
}
