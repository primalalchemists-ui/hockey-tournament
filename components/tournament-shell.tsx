"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { CampBanner } from "@/components/camp-banner";
import { GroupTabs } from "@/components/group-tabs";
import { RegulationSection } from "@/components/regulation-section";
import { ScheduleSection } from "@/components/schedule-section";
import { ScorersTable } from "@/components/scorers-table";
import { TournamentHeader } from "@/components/tournament-header";

import type { Tournament } from "@/types/tournament";
import type { TournamentStructure } from "@/types/tournament-config";
import type { PlayoffStateView } from "@/lib/data/postgres/playoff-engine";
import { usePublicAutoRefresh } from "@/components/use-public-auto-refresh";
import { useCelebration } from "@/components/use-celebration";

type MainTab = "live" | "schedule" | "regulation" | "scorers";

type TournamentShellProps = {
  tournament: Tournament;
  /** Decyduje, czy kibic widzi selektor grup. */
  structure: TournamentStructure;
  playoffState: PlayoffStateView | null;
  /** Czy turniej prowadzi klasyfikację strzelców. */
  scorersEnabled: boolean;
  /** Planowana liczba meczów całego turnieju — patrz lib/playoff/planned-matches. */
  plannedMatchCount: number;
  /** Punkt startowy dla auto-odświeżania — z renderu serwerowego. */
  tournamentId: string | null;
  revision: number;
  initialTab?: MainTab;
  initialGroupKey?: string;
};

const mainTabs: Array<{ key: MainTab; label: string }> = [
  { key: "live", label: "Wyniki" },
  { key: "scorers", label: "Strzelcy" },
  { key: "schedule", label: "Harmonogram" },
  { key: "regulation", label: "Regulamin" },
];

export function TournamentShell({
  tournament: initialTournament,
  structure: initialStructure,
  playoffState: initialPlayoffState,
  scorersEnabled: initialScorersEnabled,
  plannedMatchCount: initialPlannedMatchCount,
  tournamentId,
  revision,
  initialTab = "live",
  initialGroupKey,
}: TournamentShellProps) {
  // Dane publiczne odświeżają się same; UI dostaje zawsze spójny snapshot.
  const {
    tournament,
    structure,
    scorersEnabled,
    playoffState,
    plannedMatchCount,
    refreshTick,
  } = usePublicAutoRefresh({
      initialTournamentId: tournamentId,
      initialRevision: revision,
      initialTournament,
      initialStructure,
      initialScorersEnabled,
      initialPlayoffState,
      initialPlannedMatchCount,
    });
  const router = useRouter();
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<MainTab>(initialTab);

  /*
    CELEBRACJA — jedna decyzja, dwa miejsca prezentacji.

    Grupa bierze się z adresu, bo to selektor grup nim steruje. Dzięki
    temu przycisk w hero prowadzi do podium AKTUALNIE oglądanej grupy,
    a nie zawsze do pierwszej.
  */
  const selectedGroupKey =
    searchParams.get("group") ??
    initialGroupKey ??
    tournament.groups[0]?.key ??
    null;

  const celebrationScope =
    playoffState?.scopes.find((scope) => scope.groupKey === selectedGroupKey) ??
    playoffState?.scopes[0] ??
    null;

  const celebration = useCelebration({
    tournamentId,
    scopeKey: celebrationScope?.groupKey ?? null,
    completionToken: playoffState?.completionToken ?? null,
    isCompleted: Boolean(playoffState?.isCompleted),
    classificationComplete: Boolean(celebrationScope?.classification?.complete),
  });

  /*
    Turniej bez klasyfikacji strzelców NIE ma tej zakładki — nie ma też
    pustej zakładki ani wyszarzonej. Pozostałe układają się naturalnie.
  */
  const visibleTabs = useMemo(
    () => mainTabs.filter((tab) => tab.key !== "scorers" || scorersEnabled),
    [scorersEnabled]
  );

  /** Wejście z linkiem ?tab=scorers na turniej bez strzelców wraca na wyniki. */
  const effectiveTab: MainTab =
    activeTab === "scorers" && !scorersEnabled ? "live" : activeTab;

  const allTeams = useMemo(
    () => tournament.groups.flatMap((group) => group.teams),
    [tournament.groups]
  );

  useEffect(() => {
    const tabFromUrl = searchParams.get("tab");

    if (
      tabFromUrl === "live" ||
      tabFromUrl === "schedule" ||
      tabFromUrl === "regulation" ||
      tabFromUrl === "scorers"
    ) {
      setActiveTab(tabFromUrl);
    }
  }, [searchParams]);

  function handleTabChange(tab: MainTab) {
    setActiveTab(tab);

    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);

    if (tab !== "live") {
      params.delete("group");
    } else if (!params.get("group") && initialGroupKey) {
      params.set("group", initialGroupKey);
    }

    router.replace(`/?${params.toString()}`, { scroll: false });
  }

  const content = useMemo(() => {
    if (effectiveTab === "schedule") {
      return (
        <ScheduleSection
          fileUrl={tournament.assets.scheduleImage}
          fileType={tournament.assets.scheduleImageType}
          fileName={tournament.assets.scheduleImageName}
        />
      );
    }

    if (effectiveTab === "regulation") {
      return (
        <RegulationSection
          fileUrl={tournament.assets.regulationImage}
          fileType={tournament.assets.regulationImageType}
          fileName={tournament.assets.regulationImageName}
        />
      );
    }

    if (effectiveTab === "scorers") {
      return (
        <ScorersTable
          scorers={tournament.scorers ?? []}
          teams={allTeams}
        />
      );
    }

    return (
      <GroupTabs
        groups={tournament.groups}
        initialGroupKey={initialGroupKey}
        structure={structure}
        playoffState={playoffState}
        tournamentId={tournamentId}
        celebration={celebration}
      />
    );
  }, [effectiveTab, tournament, allTeams, initialGroupKey, structure, playoffState]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <TournamentHeader
        title={tournament.title}
        scorers={tournament.scorers ?? []}
        teams={allTeams}
        heroBannerImage={tournament.assets.heroBannerImage}
        tickerMessage={tournament.tickerMessage}
        showTopScorerTicker={tournament.showTopScorerTicker}
        refreshTick={refreshTick}
        plannedMatchCount={plannedMatchCount}
        cta={celebration}
      />

      {/*
        Treść publiczna NIE czeka na załadowanie hero.
        Wolny albo zepsuty obrazek nie może blokować rankingu, matrixa,
        drabinki ani minigrupy.
      */}
      <div className="space-y-4 sm:space-y-6">
            {/*
              Pasek zakladek: wlasny scroll poziomy, ZERO ujemnych marginesow.
              Poprzedni ujemny margines byl szerszy niz padding strony,
              wystawal poza viewport i wlaczal poziomy scroll CALEGO
              dokumentu na telefonie.
            */}
            <nav className="ice-scroll overflow-x-auto">
              <div className="ice-panel flush-card inline-flex min-w-full gap-2 p-2">
                {visibleTabs.map((tab) => {
                  const isActive = tab.key === effectiveTab;

                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => handleTabChange(tab.key)}
                      className={[
                        "whitespace-nowrap rounded-full px-4 py-3 text-sm font-semibold transition sm:px-5",
                        isActive
                          ? "bg-slate-900 text-white shadow-sm"
                          : "text-[var(--text-secondary)] hover:bg-white/70",
                      ].join(" ")}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </nav>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={effectiveTab}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22 }}
              >
                {content}
              </motion.div>
            </AnimatePresence>

            {tournament.campStartDate ? (
              <CampBanner
                date={tournament.campStartDate}
                signupLink={tournament.campSignupLink || "#"}
                bannerImage={tournament.assets.campBannerImage}
                leftPosterImage={tournament.assets.campPosterLeft}
                rightPosterImage={tournament.assets.campPosterRight}
              />
            ) : null}
      </div>
    </div>
  );
}