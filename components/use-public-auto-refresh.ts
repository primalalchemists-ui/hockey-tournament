"use client";

import { useEffect, useRef, useState } from "react";

import {
  PUBLIC_REFRESH_INTERVAL_MS,
  createAutoRefreshController,
} from "@/lib/public/auto-refresh";
import type { PlayoffStateView } from "@/lib/data/postgres/playoff-engine";
import type { Tournament } from "@/types/tournament";
import type { TournamentStructure } from "@/types/tournament-config";

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
      initial: {
        tournamentId: options.initialTournamentId,
        revision: options.initialRevision,
      },
      intervalMs: PUBLIC_REFRESH_INTERVAL_MS,
      fetchVersion: async (signal) => {
        const response = await fetch("/api/tournament/version", {
          signal,
          cache: "no-store",
        });

        if (!response.ok) throw new Error(`version ${response.status}`);
        return response.json();
      },
      fetchSnapshot: async (signal) => {
        const response = await fetch("/api/tournament/snapshot", {
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
      onSnapshot: (snapshot) => applyRef.current(snapshot),
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
    // Kontroler tworzymy raz — dane początkowe pochodzą z renderu serwera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    tournament,
    structure,
    scorersEnabled,
    playoffState,
    plannedMatchCount,
    playedMatchCount,
    refreshTick,
  };
}
