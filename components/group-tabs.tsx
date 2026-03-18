"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";

import { MatchMatrix } from "@/components/match-matrix";
import { StandingsTable } from "@/components/standings-table";
import { LegendTable } from "./legend-table";

import { calculateStandings } from "@/lib/standings";
import { applyGroupTestScenario } from "@/lib/standings-test-scenarios";
import {
  ACTIVE_STANDINGS_TEST_SCENARIO,
  STANDINGS_TEST_MODE,
} from "@/lib/standings-test-config";

import type { Group } from "@/types/tournament";

type GroupTabsProps = {
  groups: Group[];
};

export function GroupTabs({ groups }: GroupTabsProps) {
  const [activeGroup, setActiveGroup] = useState(groups[0]?.key);

  const currentGroup = useMemo(
    () => groups.find((group) => group.key === activeGroup) ?? groups[0],
    [activeGroup, groups]
  );

  const displayedGroup = useMemo(() => {
    if (!currentGroup) return null;
    return applyGroupTestScenario(currentGroup);
  }, [currentGroup]);

  const standings = useMemo(() => {
    if (!displayedGroup) return [];
    return calculateStandings(displayedGroup);
  }, [displayedGroup]);

  if (!displayedGroup) return null;

  return (
    <section className="space-y-4">
      <div className="-mx-4 md:mx-0">
  <div className="overflow-x-auto">
    <div className="inline-flex min-w-full gap-2 bg-white p-4 shadow-sm">
      {groups.map((group) => {
        const isActive = group.key === displayedGroup.key;

        return (
          <button
            key={group.key}
            type="button"
            onClick={() => setActiveGroup(group.key)}
            className={[
              "rounded-2xl px-4 py-3 text-sm font-semibold whitespace-nowrap transition",
              isActive
                ? "bg-slate-900 text-white shadow-sm"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200",
            ].join(" ")}
          >
            {group.name}
          </button>
        );
      })}
    </div>
  </div>
</div>

      {STANDINGS_TEST_MODE && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <span className="font-semibold">Tryb testowy:</span>{" "}
          {ACTIVE_STANDINGS_TEST_SCENARIO}
        </div>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={`${displayedGroup.key}-${STANDINGS_TEST_MODE ? ACTIVE_STANDINGS_TEST_SCENARIO : "prod"}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
          className="space-y-4"
        >
          <StandingsTable groupName={displayedGroup.name} rows={standings} />
          <LegendTable />
          <MatchMatrix group={displayedGroup} />
        </motion.div>
      </AnimatePresence>
    </section>
  );
}