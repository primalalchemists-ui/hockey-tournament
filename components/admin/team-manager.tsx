"use client";

import type { Group } from "@/types/tournament";
import { Pencil, Plus, X } from "lucide-react";

type TeamManagerProps = {
  groups: Group[];
  activeGroupKey: string;
  onAddTeam: (groupKey: string) => void;
  onRemoveTeam: (groupKey: string, teamId: string) => void;
  onUpdateTeamName: (groupKey: string, teamId: string, value: string) => void;
  onUploadTeamLogo: (groupKey: string, teamId: string, file: File) => void;
};

export function TeamManager({
  groups,
  activeGroupKey,
  onAddTeam,
  onRemoveTeam,
  onUpdateTeamName,
  onUploadTeamLogo,
}: TeamManagerProps) {
  const activeGroup = groups.find((group) => group.key === activeGroupKey);

  if (!activeGroup) return null;

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 sm:px-6">
        <h2 className="text-lg font-semibold text-slate-900">Drużyny</h2>

        <button
          type="button"
          onClick={() => onAddTeam(activeGroup.key)}
          className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
        >
          <Plus size={16} />
          Dodaj drużynę
        </button>
      </div>

      <div className="divide-y divide-slate-200">
        {activeGroup.teams.map((team) => (
          <div
            key={team.id}
            className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                  {team.logoUrl ? (
                    <img
                      src={team.logoUrl}
                      alt={team.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-[10px] font-semibold uppercase text-slate-600">
                      LOGO
                    </span>
                  )}
                </div>

                <label className="cursor-pointer rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900">
                  <Pencil size={14} />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        onUploadTeamLogo(activeGroup.key, team.id, file);
                      }
                    }}
                  />
                </label>
              </div>

              <input
                value={team.name}
                onChange={(event) =>
                  onUpdateTeamName(activeGroup.key, team.id, event.target.value)
                }
                className="min-w-[220px] bg-transparent text-sm font-medium text-slate-900 outline-none"
              />
            </div>

            <button
              type="button"
              onClick={() => onRemoveTeam(activeGroup.key, team.id)}
              className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-700"
              title="Usuń drużynę"
            >
              <X size={16} />
            </button>
          </div>
        ))}

        {activeGroup.teams.length === 0 ? (
          <div className="px-4 py-6 text-sm text-slate-500 sm:px-6">
            Brak drużyn w tej grupie.
          </div>
        ) : null}
      </div>
    </section>
  );
}