"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Plus, X } from "lucide-react";
import { useMemo, useState } from "react";

import { EditableMatchMatrix } from "@/components/admin/editable-match-matrix";
import { TeamManager } from "@/components/admin/team-manager";
import { calculateStandings } from "@/lib/standings";
import type { Group } from "@/types/tournament";
import { StandingsTable } from "@/components/standings-table";

type EditableGroupTabsProps = {
  groups: Group[];
  onAddGroup: () => void;
  onRemoveGroup: (groupKey: string) => void;
  onAddTeam: (groupKey: string) => void;
  onRemoveTeam: (groupKey: string, teamId: string) => void;
  onUpdateTeamName: (groupKey: string, teamId: string, value: string) => void;
  onUploadTeamLogo: (groupKey: string, teamId: string, file: File) => void;
  onUpdateCell: (
    groupKey: string,
    homeTeamId: string,
    awayTeamId: string,
    value: string
  ) => void;
};

export function EditableGroupTabs({
  groups,
  onAddGroup,
  onRemoveGroup,
  onAddTeam,
  onRemoveTeam,
  onUpdateTeamName,
  onUploadTeamLogo,
  onUpdateCell,
}: EditableGroupTabsProps) {
  const [activeGroup, setActiveGroup] = useState(groups[0]?.key);

  const currentGroup = useMemo(
    () => groups.find((group) => group.key === activeGroup) ?? groups[0],
    [activeGroup, groups]
  );

  if (!currentGroup) {
    return (
      <section className="space-y-4">
        <div className="overflow-x-auto">
          <div className="inline-flex min-w-full gap-2 rounded-3xl border border-slate-200 bg-white p-2 shadow-sm">
            <button
              type="button"
              onClick={onAddGroup}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white"
            >
              <Plus size={16} />
              Dodaj grupę
            </button>
          </div>
        </div>
      </section>
    );
  }

  const standings = calculateStandings(currentGroup);

  return (
    <section className="space-y-4">
      <div className="overflow-x-auto">
        <div className="inline-flex min-w-full gap-2 rounded-3xl border border-slate-200 bg-white p-2 shadow-sm">
          {groups.map((group) => {
            const isActive = group.key === currentGroup.key;

            return (
              <div
                key={group.key}
                className={[
                  "inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold whitespace-nowrap transition",
                  isActive
                    ? "bg-slate-900 text-white shadow-sm"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                ].join(" ")}
              >
                <button type="button" onClick={() => setActiveGroup(group.key)}>
                  {group.name}
                </button>

                <button
                  type="button"
                  onClick={() => onRemoveGroup(group.key)}
                  className={isActive ? "text-white/80 hover:text-white" : "text-slate-500 hover:text-slate-900"}
                  title="Usuń grupę"
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}

          <button
            type="button"
            onClick={onAddGroup}
            className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
          >
            <Plus size={16} />
            Dodaj grupę
          </button>
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
          <TeamManager
            groups={groups}
            activeGroupKey={currentGroup.key}
            onAddTeam={onAddTeam}
            onRemoveTeam={onRemoveTeam}
            onUpdateTeamName={onUpdateTeamName}
            onUploadTeamLogo={onUploadTeamLogo}
          />

          <StandingsTable groupName={currentGroup.name} rows={standings} />

          <EditableMatchMatrix
            group={currentGroup}
            onUpdateCell={onUpdateCell}
          />
        </motion.div>
      </AnimatePresence>
    </section>
  );
}