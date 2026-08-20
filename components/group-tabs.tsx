"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { MatchMatrix } from "@/components/match-matrix";
import { StandingsTable } from "@/components/standings-table";

import { calculateStandings } from "@/lib/standings";
import { applyGroupTestScenario } from "@/lib/standings-test-scenarios";
import {
  ACTIVE_STANDINGS_TEST_SCENARIO,
  STANDINGS_TEST_MODE,
} from "@/lib/standings-test-config";

import type { Group } from "@/types/tournament";
import type { TournamentStructure } from "@/types/tournament-config";
import type { PlayoffStateView } from "@/lib/data/postgres/playoff-engine";
import { PlayoffBracket } from "@/components/playoff/playoff-bracket";
import type { CelebrationCta } from "@/lib/public/celebration";
import { PlacementSection } from "@/components/playoff/placement-section";
import {
  GroupTransition,
  useGroupTransition,
} from "@/components/public/group-transition";
import { PodiumSection } from "@/components/playoff/podium-section";

type GroupTabsProps = {
  groups: Group[];
  initialGroupKey?: string;
  /**
   * "single" = jedna wspólna tabela. Selektor grup znika w całości —
   * kibic nie widzi żadnego grupowego języka.
   */
  structure: TournamentStructure;
  /** null dla turniejów ligowych — wtedy nie renderujemy niczego nowego. */
  playoffState: PlayoffStateView | null;
  /** UUID turnieju — wyłącznie do klucza ceremonii podium w localStorage. */
  tournamentId: string | null;
  /** Stan przycisku celebracji; na telefonie stoi przy Rankingu. */
  celebration: CelebrationCta;
};

export function GroupTabs({
  groups,
  initialGroupKey,
  structure,
  playoffState,
  tournamentId,
  celebration,
}: GroupTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [activeGroup, setActiveGroup] = useState(
    searchParams.get("group") || initialGroupKey || groups[0]?.key
  );

  /*
    Grupa WYBRANA steruje przyciskami, grupa POKAZYWANA treścią. Rozjeżdżają
    się wyłącznie na czas krótkiego przejścia — patrz useGroupTransition.
  */
  const { displayedKey, phase: groupPhase } = useGroupTransition(activeGroup);

  useEffect(() => {
    const groupFromUrl = searchParams.get("group");
    if (groupFromUrl) {
      setActiveGroup(groupFromUrl);
    }
  }, [searchParams]);

  const currentGroup = useMemo(
    () => groups.find((group) => group.key === displayedKey) ?? groups[0],
    [displayedKey, groups]
  );

  const displayedGroup = useMemo(() => {
    if (!currentGroup) return null;
    return applyGroupTestScenario(currentGroup);
  }, [currentGroup]);

  const standings = useMemo(() => {
    if (!displayedGroup) return [];
    return calculateStandings(displayedGroup);
  }, [displayedGroup]);

  function handleGroupChange(groupKey: string) {
    setActiveGroup(groupKey);

    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "live");
    params.set("group", groupKey);

    router.replace(`/?${params.toString()}`, { scroll: false });
  }

  // Sekcje play-off dotyczą WYŁĄCZNIE aktualnie wybranej grupy —
  // drabinki różnych grup nigdy się nie mieszają.
  const playoffScope =
    playoffState && displayedGroup
      ? (playoffState.scopes.find(
          (scope) => scope.groupKey === displayedGroup.key
        ) ?? null)
      : null;

  if (!displayedGroup) return null;

  const showGroupTabs = structure === "groups" && groups.length > 0;

  return (
    <section className="space-y-4">
      {showGroupTabs ? (
      <div>
        <div className="ice-scroll overflow-x-auto">
          <div className="ice-panel flush-card inline-flex min-w-full gap-2 p-2">
            {groups.map((group) => {
              const isActive = group.key === displayedGroup.key;

              return (
                <button
                  key={group.key}
                  type="button"
                  onClick={() => handleGroupChange(group.key)}
                  className={[
                    "whitespace-nowrap rounded-full px-4 py-3 text-sm font-semibold transition",
                    isActive
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-[var(--text-secondary)] hover:bg-white/70",
                  ].join(" ")}
                >
                  {group.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      ) : null}

      {STANDINGS_TEST_MODE && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <span className="font-semibold">Tryb testowy:</span>{" "}
          {ACTIVE_STANDINGS_TEST_SCENARIO}
        </div>
      )}

      {/*
        CAŁY blok zależny od grupy przechodzi jako JEDNA treść.

        Poprzednio zmiana grupy podmieniała zawartość natychmiast i widać
        było, jak wiersze przeskakują między pozycjami. Teraz stara treść
        gaśnie, dopiero potem następuje podmiana, a nowa wchodzi z delikatnym
        uniesieniem — bez animowania pojedynczych drużyn.
      */}
      <GroupTransition phase={groupPhase} contentKey={displayedKey}>
        <div className="space-y-4">
          {/*
            W formacie z play-offem Ranking pokazuje statystyki CAŁEGO
            turnieju (grupa + drabinka + minigrupa) i kolejność zależną od
            etapu — jedno i drugie liczy serwer. Liga zostaje przy
            klasycznym calculateStandings.
          */}
          <StandingsTable
            groupKey={displayedGroup.key}
            groupName={displayedGroup.name}
            rows={playoffScope?.ranking?.length ? playoffScope.ranking : standings}
            stage={playoffState?.format === "group_playoff" ? playoffState.stage : null}
            celebration={celebration}
          />

          <MatchMatrix group={displayedGroup} />

          {playoffScope ? (
            <>
              {/*
                Jedna drabinka na wszystkie etapy: pełna topologia istnieje
                od początku, a puste sloty czekają na rozstrzygnięcia.
              */}
              <PlayoffBracket
                scope={playoffScope}
                backgroundUrl={playoffState!.bracketBackgroundUrl}
              />

              {playoffScope.placement ? (
                <PlacementSection placement={playoffScope.placement} />
              ) : null}

              {/*
                Podium istnieje OD POCZĄTKU turnieju — przed zakończeniem
                pokazuje puste sloty ze znakami zapytania. Nie tłumaczymy
                tego tekstem; puste podium jest zrozumiałe samo w sobie.
              */}
              <PodiumSection
                tournamentId={tournamentId ?? ""}
                scopeKey={playoffScope.groupKey}
                classification={
                  playoffState!.isCompleted ? playoffScope.classification : null
                }
                skeleton={playoffScope.classificationSkeleton}
                completionToken={playoffState!.completionToken}
                backgroundUrl={playoffState!.podiumBackgroundUrl}
              />
            </>
          ) : null}
        </div>
      </GroupTransition>
    </section>
  );
}