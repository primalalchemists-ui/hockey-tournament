"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";

import { CampBanner } from "@/components/camp-banner";
import { GroupTabs } from "@/components/group-tabs";
import { RegulationSection } from "@/components/regulation-section";
import { ScheduleSection } from "@/components/schedule-section";
import { ScorersTable } from "@/components/scorers-table";
import { TournamentHeader } from "@/components/tournament-header";

import type { Tournament } from "@/types/tournament";

type MainTab = "live" | "schedule" | "regulation" | "scorers";

type TournamentShellProps = {
  tournament: Tournament;
};

const mainTabs: Array<{ key: MainTab; label: string }> = [
  { key: "live", label: "Wyniki" },
  { key: "scorers", label: "Strzelcy" },
  { key: "schedule", label: "Harmonogram" },
  { key: "regulation", label: "Regulamin" },
];

export function TournamentShell({ tournament }: TournamentShellProps) {
  const [activeTab, setActiveTab] = useState<MainTab>("live");
  const [headerReady, setHeaderReady] = useState(false);

  const allTeams = useMemo(
    () => tournament.groups.flatMap((group) => group.teams),
    [tournament.groups]
  );

  const content = useMemo(() => {
    if (activeTab === "schedule") {
      return (
        <ScheduleSection
          fileUrl={tournament.assets.scheduleImage}
          fileType={tournament.assets.scheduleImageType}
          fileName={tournament.assets.scheduleImageName}
        />
      );
    }

    if (activeTab === "regulation") {
      return (
        <RegulationSection
          fileUrl={tournament.assets.regulationImage}
          fileType={tournament.assets.regulationImageType}
          fileName={tournament.assets.regulationImageName}
        />
      );
    }

    if (activeTab === "scorers") {
      return <ScorersTable scorers={tournament.scorers ?? []} teams={allTeams} />;
    }

    return <GroupTabs groups={tournament.groups} />;
  }, [activeTab, tournament, allTeams]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <TournamentHeader
        title={tournament.title}
        scorers={tournament.scorers ?? []}
        teams={allTeams}
        groups={tournament.groups}
        heroBannerImage={tournament.assets.heroBannerImage}
        tickerMessage={tournament.tickerMessage}
        showTopScorerTicker={tournament.showTopScorerTicker}
        onHeroReady={() => setHeaderReady(true)}
      />

      <AnimatePresence>
        {headerReady ? (
          <motion.div
            key="tabs-and-content"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.28 }}
            className="space-y-4 sm:space-y-6"
          >
            <nav className="overflow-x-auto -mx-4 sm:mx-0">
              <div className="inline-flex min-w-full gap-2 bg-white p-4 shadow-sm">
                {mainTabs.map((tab) => {
                  const isActive = tab.key === activeTab;

                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveTab(tab.key)}
                      className={[
                        "rounded-2xl px-4 py-3 text-sm font-semibold whitespace-nowrap transition sm:px-5",
                        isActive
                          ? "bg-slate-900 text-white shadow-sm"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                      ].join(" ")}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </nav>

            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
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
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}