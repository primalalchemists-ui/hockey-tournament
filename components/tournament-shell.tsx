"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";

import { lockBodyScroll } from "@/lib/public/scroll-lock";
import { useRouter, useSearchParams } from "next/navigation";

import { BrandLoader } from "@/components/brand-loader";
import { ModalPortal } from "@/components/ui/modal-portal";
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
import { CategorySwitcher } from "@/components/public/category-switcher";
import type { CategoryLike } from "@/lib/public/tournament-collection";

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
  /** Ile z nich ma już wynik — licznik postępu w nagłówku. */
  playedMatchCount: number;
  /**
   * Gotowa sekcja „Poprzednie turnieje" wyrenderowana na serwerze.
   * Shell tylko przekazuje ją dalej — nie wie nic o archiwum.
   */
  previousTournaments?: React.ReactNode;
  /**
   * Kategorie tego samego wydarzenia (np. U8 / U10). Puste albo mniej niż
   * dwie = przełącznik się nie pojawia.
   */
  categories?: CategoryLike[] | null;
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
  playedMatchCount: initialPlayedMatchCount,
  previousTournaments,
  categories,
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
    playedMatchCount,
    refreshTick,
    selectedTournamentId,
    isSwitching,
    switchTournament,
  } = usePublicAutoRefresh({
      initialTournamentId: tournamentId,
      initialRevision: revision,
      initialTournament,
      initialStructure,
      initialScorersEnabled,
      initialPlayoffState,
      initialPlannedMatchCount,
      initialPlayedMatchCount,
    });
  const router = useRouter();
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<MainTab>(initialTab);
  const [switchError, setSwitchError] = useState<string | null>(null);

  /*
    Zmiana kategorii jest lokalna dla tej sesji: nie dotyka `is_current`,
    niczego nie zapisuje i po odświeżeniu strony kibic wraca do turnieju
    wyświetlanego globalnie.
  */
  async function handleSelectCategory(tournamentId: string) {
    setSwitchError(null);

    const ok = await switchTournament(tournamentId);

    if (!ok) setSwitchError("Nie udało się wczytać tej kategorii.");
  }

  /*
    W trakcie zmiany kategorii strona pod ekranem ładowania stoi. Bez tego
    dałoby się przewinąć zasłonięty, nieaktualny turniej i po odsłonięciu
    wylądować w zupełnie innym miejscu nowego.
  */
  useEffect(() => {
    if (!isSwitching) return;

    return lockBodyScroll();
  }, [isSwitching]);

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

  /*
    BŁĄD, KTÓRY TU MIESZKAŁ.

    Ta lista zależności nie zawierała `celebration` ani `tournamentId`,
    mimo że oba są używane niżej. Po zakończeniu ceremonii przycisk w hero
    (renderowany POZA tym memo) zmieniał się na „Zobacz klasyfikację",
    a przycisk przy Rankingu — czyli wersja mobilna — dostawał w prezencie
    zapamiętany, nieaktualny obiekt i dalej zapraszał na celebrację.

    Zależności muszą wymieniać wszystko, co memo naprawdę czyta.
  */
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
  }, [
    effectiveTab,
    tournament,
    allTeams,
    initialGroupKey,
    structure,
    playoffState,
    tournamentId,
    celebration,
  ]);

  return (
    <div className="space-y-4 sm:space-y-6" aria-busy={isSwitching}>
      {/*
        ZMIANA KATEGORII WYGLĄDA JAK WCZYTANIE INNEGO TURNIEJU.

        Wcześniej kliknięcie U10 zostawiało na ekranie kompletny, klikalny
        turniej U8 do czasu powrotu snapshotu. Wyglądało to jak zawieszenie
        aplikacji, bo nic nie potwierdzało, że cokolwiek się dzieje.

        Teraz stary turniej znika od razu pod tym samym ekranem ładowania,
        który obsługuje wejście na stronę — z logo Festiwalu Hokeja, bez
        drugiego języka wizualnego dla tej samej czynności. `blocking`
        odcina kliknięcia w zasłonięty widok.

        PORTAL DO <body> JEST TU KONIECZNY. Warstwa siedziała wewnątrz
        kontenera strony, a `position: fixed` liczy się względem viewportu
        tylko wtedy, gdy żaden przodek nie tworzy własnego kontenera
        pozycjonowania — robi to każdy `transform`, `filter` i `backdrop-filter`
        (czyli nasza `.ice-surface`). Efekt: zasłona kończyła się na krawędzi
        karty i pod spodem dalej było widać ranking oraz „Udostępnij".
      */}
      {isSwitching ? (
        <ModalPortal>
          <BrandLoader blocking testId="category-loader" />
        </ModalPortal>
      ) : null}

      <TournamentHeader
        title={tournament.title}
        scorers={tournament.scorers ?? []}
        teams={allTeams}
        heroBannerImage={tournament.assets.heroBannerImage}
        tickerMessage={tournament.tickerMessage}
        showTopScorerTicker={tournament.showTopScorerTicker}
        refreshTick={refreshTick}
        plannedMatchCount={plannedMatchCount}
        playedMatchCount={playedMatchCount}
        categorySwitcher={
          <CategorySwitcher
            variant="inline"
            categories={categories ?? []}
            selectedTournamentId={selectedTournamentId}
            isSwitching={isSwitching}
            onSelect={handleSelectCategory}
            error={switchError}
          />
        }
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
                signupLink={tournament.campSignupLink || ""}
                campTitle={tournament.campTitle}
                registrationEnabled={tournament.campRegistrationEnabled}
                countdownPinColor={tournament.countdownPinColor}
                bannerImage={tournament.assets.campBannerImage}
                leftPosterImage={tournament.assets.campPosterLeft}
                rightPosterImage={tournament.assets.campPosterRight}
                previousTournaments={previousTournaments}
              />
            ) : null}
      </div>

      {/*
        Wariant telefonowy: bąbelek pływa nad treścią, przy prawej krawędzi
        i nad dolną. Na desktopie ten sam przełącznik siedzi w nagłówku,
        więc oba warianty nigdy nie są widoczne jednocześnie.

        Przełącznik pojawia się WYŁĄCZNIE wtedy, gdy wydarzenie ma co
        najmniej dwie publicznie dostępne kategorie.
      */}
      <CategorySwitcher
        variant="floating"
        categories={categories ?? []}
        selectedTournamentId={selectedTournamentId}
        isSwitching={isSwitching}
        onSelect={handleSelectCategory}
        error={switchError}
      />
    </div>
  );
}