"use client";

import { Pencil } from "lucide-react";
import type { Group, Match, Team } from "@/types/tournament";

type EditableMatchMatrixProps = {
  group: Group;
  onUpdateCell: (
    groupKey: string,
    teamAId: string,
    teamBId: string,
    value: string
  ) => void;
};

function findMatch(group: Group, teamAId: string, teamBId: string): Match | null {
  return (
    group.matches.find(
      (item) =>
        (item.homeTeamId === teamAId && item.awayTeamId === teamBId) ||
        (item.homeTeamId === teamBId && item.awayTeamId === teamAId)
    ) ?? null
  );
}

function buildCellValue(match: Match | null, rowTeamId: string) {
  if (!match) return "";

  const isRowHome = match.homeTeamId === rowTeamId;
  const leftScore = isRowHome ? match.homeScore : match.awayScore;
  const rightScore = isRowHome ? match.awayScore : match.homeScore;

  return `${leftScore}:${rightScore}`;
}

function getTone(match: Match | null, rowTeamId: string) {
  if (!match) {
    return "border-slate-200 bg-slate-50 text-slate-500";
  }

  const isRowHome = match.homeTeamId === rowTeamId;
  const scored = isRowHome ? match.homeScore : match.awayScore;
  const conceded = isRowHome ? match.awayScore : match.homeScore;

  if (scored > conceded) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (scored < conceded) {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  return "border-amber-200 bg-amber-50 text-amber-700";
}

function TeamLogo({
  team,
  size = "md",
}: {
  team: Team;
  size?: "sm" | "md";
}) {
  const sizeClass = size === "sm" ? "h-9 w-9" : "h-10 w-10";

  if (team.logoUrl) {
    return (
      <div
        className={[
          "flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white",
          sizeClass,
        ].join(" ")}
      >
        <img
          src={team.logoUrl}
          alt={team.name}
          className="h-full w-full object-contain"
        />
      </div>
    );
  }

  return (
    <div
      className={[
        "flex shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-[9px] font-semibold uppercase text-slate-600",
        sizeClass,
      ].join(" ")}
    >
      {team.shortName || team.logoText || "LOGO"}
    </div>
  );
}

function EditableCell({
  groupKey,
  rowTeamId,
  colTeamId,
  initialValue,
  toneClassName,
  isEditable,
  onUpdateCell,
}: {
  groupKey: string;
  rowTeamId: string;
  colTeamId: string;
  initialValue: string;
  toneClassName: string;
  isEditable: boolean;
  onUpdateCell: (
    groupKey: string,
    teamAId: string,
    teamBId: string,
    value: string
  ) => void;
}) {
  if (!isEditable) {
    return (
      <div
        className={[
          "mx-auto flex min-h-10 min-w-[88px] items-center justify-center rounded-xl border px-2 py-2 text-xs font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]",
          toneClassName,
        ].join(" ")}
      >
        {initialValue || "—"}
      </div>
    );
  }

  return (
    <div
      className={[
        "mx-auto flex min-h-10 min-w-[88px] items-center justify-between gap-2 rounded-xl border px-2 py-2 text-xs font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]",
        toneClassName,
      ].join(" ")}
    >
      <input
        defaultValue={initialValue}
        onChange={(event) =>
          onUpdateCell(groupKey, rowTeamId, colTeamId, event.target.value)
        }
        placeholder="1:0"
        className="w-full bg-transparent text-center outline-none placeholder:text-slate-400"
      />

      <span className="shrink-0 rounded-md p-1 text-slate-500">
        <Pencil size={12} />
      </span>
    </div>
  );
}

export function EditableMatchMatrix({
  group,
  onUpdateCell,
}: EditableMatchMatrixProps) {
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="space-y-3 border-b border-slate-200 px-4 py-4 sm:px-6">
        <div className="flex justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Wyniki</h2>
        </div>
      </div>

      <div className="overflow-x-auto pb-4">
        <table className="w-full border-collapse p-16 text-xs sm:text-sm">
          <thead className="w-full">
            <tr>
              <th className="sticky left-0 z-10 bg-slate-50 px-3 py-3 text-left font-semibold text-slate-600"></th>

              {group.teams.map((team) => (
                <th
                  key={team.id}
                  className="bg-slate-50 px-2 py-3 text-center font-semibold text-slate-600"
                >
                  <div className="mx-auto flex w-20 flex-col items-center gap-2">
                    <TeamLogo team={team} size="sm" />
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {group.teams.map((rowTeam, rowIndex) => (
              <tr
                key={rowTeam.id}
                className={rowIndex % 2 === 0 ? "bg-white" : "bg-slate-50/40"}
              >
                <td
                  className={[
                    "sticky left-0 z-30 px-3 py-3 font-medium text-slate-900",
                    rowIndex % 2 === 0 ? "bg-white" : "bg-slate-50",
                  ].join(" ")}
                >
                  <div className="relative z-10 flex items-center gap-3">
                    <TeamLogo team={rowTeam} size="sm" />
                    <span className="truncate">{rowTeam.name}</span>
                  </div>
                </td>

                {group.teams.map((colTeam, colIndex) => {
                  const isSame = rowTeam.id === colTeam.id;
                  const match = findMatch(group, rowTeam.id, colTeam.id);
                  const isLastCol = colIndex === group.teams.length - 1;
                  const isEditable = rowIndex < colIndex;

                  return (
                    <td
                      key={colTeam.id}
                      className={
                        isLastCol
                          ? "py-2 pl-2 pr-4 text-center"
                          : "px-2 py-2 text-center"
                      }
                    >
                      {isSame ? (
                        <div className="mx-auto flex min-h-10 min-w-[88px] items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-slate-400">
                          -
                        </div>
                      ) : (
                        <EditableCell
                          groupKey={group.key}
                          rowTeamId={rowTeam.id}
                          colTeamId={colTeam.id}
                          initialValue={buildCellValue(match, rowTeam.id)}
                          toneClassName={getTone(match, rowTeam.id)}
                          isEditable={isEditable}
                          onUpdateCell={onUpdateCell}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}