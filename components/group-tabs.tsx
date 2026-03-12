// components/group-tabs.tsx
"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";

import { MatchMatrix } from "@/components/match-matrix";
import { StandingsTable } from "@/components/standings-table";
import { calculateStandings } from "@/lib/standings";
import type { Group } from "@/types/tournament";
import { LegendTable } from "./legend-table";

type GroupTabsProps = {
  groups: Group[];
};

export function GroupTabs({ groups }: GroupTabsProps) {
  const [activeGroup, setActiveGroup] = useState(groups[0]?.key);

  const currentGroup = useMemo(
    () => groups.find((group) => group.key === activeGroup) ?? groups[0],
    [activeGroup, groups]
  );

  if (!currentGroup) return null;

  const standings = calculateStandings(currentGroup);

  return (
    <section className="space-y-4">
      

      <div className="overflow-x-auto">
        <div className="inline-flex min-w-full gap-2 rounded-3xl border border-slate-200 bg-white p-2 shadow-sm">
          {groups.map((group) => {
            const isActive = group.key === currentGroup.key;

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

      <AnimatePresence mode="wait">
        <motion.div
          key={currentGroup.key}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
          className="space-y-4"
        > 
          
          <StandingsTable groupName={currentGroup.name} rows={standings} />
          <LegendTable />
          <MatchMatrix group={currentGroup} />
        </motion.div>
      </AnimatePresence>
    </section>
  );
}