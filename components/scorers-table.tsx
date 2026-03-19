"use client";

import { ShareTableButton } from "@/components/ShareTableButton";
import type { Scorer, Team } from "@/types/tournament";

type ScorersTableProps = {
  scorers: Scorer[];
  teams: Team[];
};

function getSortedScorers(scorers: Scorer[]) {
  return [...scorers].sort((a, b) => {
    if (b.goals !== a.goals) return b.goals - a.goals;
    return a.playerName.localeCompare(b.playerName);
  });
}

function getTeamMap(teams: Team[]) {
  return new Map(teams.map((team) => [team.id, team]));
}

function renderPositionBadge(position: number) {
  if (position === 1) {
    return (
      <img
        src="/images/medals/gold.png"
        alt="1 miejsce"
        className="h-9 w-9 object-contain"
      />
    );
  }

  if (position === 2) {
    return (
      <img
        src="/images/medals/silver.png"
        alt="2 miejsce"
        className="h-9 w-9 object-contain"
      />
    );
  }

  if (position === 3) {
    return (
      <img
        src="/images/medals/bronze.png"
        alt="3 miejsce"
        className="h-9 w-9 object-contain"
      />
    );
  }

  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-bold text-slate-700 shadow-sm">
      {position}
    </span>
  );
}

export function ScorersTable({ scorers, teams }: ScorersTableProps) {
  const sortedScorers = getSortedScorers(scorers);
  const teamMap = getTeamMap(teams);

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Strzelcy</h2>

          <ShareTableButton shareText="Sprawdź TOP 5 najlepszych strzelców" />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-3 text-center font-semibold">Poz.</th>
              <th className="px-3 py-3 text-left font-semibold">Drużyna</th>
              <th className="px-3 py-3 text-left font-semibold">Zawodnik</th>
              <th className="px-3 py-3 text-center font-semibold">Nr</th>
              <th className="px-3 py-3 text-center font-semibold">Bramki</th>
            </tr>
          </thead>

          <tbody>
            {sortedScorers.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                  Brak strzelców.
                </td>
              </tr>
            ) : (
              sortedScorers.map((scorer, index) => {
                const team = teamMap.get(scorer.teamId);
                const position = index + 1;

                return (
                  <tr key={scorer.id} className="border-t border-slate-100">
                    <td className="px-3 py-3">
                      <div className="flex justify-center">
                        {renderPositionBadge(position)}
                      </div>
                    </td>

                    <td className="px-3 py-3">
                      <div className="flex min-w-[180px] items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white">
                          {team?.logoUrl ? (
                            <img
                              src={team.logoUrl}
                              alt={team.name}
                              className="h-full w-full object-contain"
                            />
                          ) : (
                            <span className="text-[10px] font-semibold uppercase text-slate-600">
                              {team?.shortName || team?.logoText || "LOGO"}
                            </span>
                          )}
                        </div>

                        <span className="font-medium text-slate-900">
                          {team?.name || "Brak drużyny"}
                        </span>
                      </div>
                    </td>

                    <td className="px-3 py-3 font-medium text-slate-900">
                      {scorer.playerName}
                    </td>

                    <td className="px-3 py-3 text-center">
                      {scorer.jerseyNumber ?? "—"}
                    </td>

                    <td className="px-3 py-3 text-center font-bold text-slate-900">
                      {scorer.goals}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}